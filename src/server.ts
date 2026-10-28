/**
 * Stage 13: thin HTTP layer with server-sent events.
 *   POST /cases/:id/messages   { "scenario": "damaged_parcel" }   (or { "text": "...", "orderId": "...", "customerEmail": "..." })
 *   POST /cases/:id/approvals  { "approve": true }                (resumes a paused run)
 * Pending approvals are persisted to .data/state so they survive a restart.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { InputGuardrailTripwireTriggered, MemorySession, RunState, run, type Session } from '@openai/agents';
import { buildAgents } from './agents.js';
import { config } from './config.js';
import { makeContext, type CaseContext } from './context.js';
import { closeAll, connectAll, createMcpServers } from './mcp/index.js';
import { SCENARIOS } from './scenarios.js';

const STATE_DIR = path.resolve(process.cwd(), '.data/state');
const mcp = createMcpServers();
await connectAll(mcp);
const agents = buildAgents(mcp);

// One session per case. Swap for OpenAIConversationsSession({ conversationId }) with ids stored in your DB.
const sessions = new Map<string, Session>();
const sessionFor = (id: string) => {
  if (!sessions.has(id)) sessions.set(id, new MemorySession());
  return sessions.get(id)!;
};
const contexts = new Map<string, CaseContext>();

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public'))); // demo UI at http://localhost:3000
app.get('/scenarios', (_req, res) => void res.json(Object.values(SCENARIOS)));

function sse(res: express.Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  return (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function stream(res: express.Response, send: ReturnType<typeof sse>, input: string | RunState<any, any>, ctx: CaseContext) {
  const abort = new AbortController();
  res.on('close', () => abort.abort()); // client left: stop paying for the run
  try {
    const s = await run(agents.triageAgent, input, {
      stream: true,
      context: ctx,
      session: sessionFor(ctx.caseId),
      maxTurns: config.maxTurns,
      signal: abort.signal,
    });
    for await (const ev of s) {
      if (ev.type === 'raw_model_stream_event' && ev.data.type === 'output_text_delta') send('text', ev.data.delta);
      else if (ev.type === 'agent_updated_stream_event') send('handoff', ev.agent.name);
    }
    await s.completed;
    if (s.interruptions?.length) {
      await fs.mkdir(STATE_DIR, { recursive: true });
      await fs.writeFile(path.join(STATE_DIR, `${ctx.caseId}.json`), s.state.toString());
      send('approval_required', s.interruptions.map((i) => i.rawItem));
    } else {
      await fs.rm(path.join(STATE_DIR, `${ctx.caseId}.json`), { force: true });
      send('final', s.finalOutput);
    }
  } catch (e) {
    send('error', { name: (e as Error).name, message: (e as Error).message });
  } finally {
    res.end();
  }
}

app.post('/cases/:id/messages', async (req, res) => {
  const sc = req.body.scenario ? SCENARIOS[req.body.scenario] : undefined;
  const text: string = sc?.message ?? req.body.text;
  if (!text) return void res.status(400).json({ error: 'Provide "scenario" or "text".' });
  const ctx = makeContext({
    caseId: req.params.id,
    customerEmail: sc?.customerEmail ?? req.body.customerEmail ?? 'unknown@example.com',
  });
  contexts.set(ctx.caseId, ctx);
  const send = sse(res);

  // Same trust boundary as the CLI pipeline: intake (with the injection guardrail)
  // turns untrusted prose into a validated Incident. Triage never sees the raw message.
  try {
    const intake = await run(agents.intakeAgent, text, { context: ctx, maxTurns: 4 });
    if (!intake.finalOutput) {
      send('error', { name: 'IntakeError', message: 'Intake produced no structured output.' });
      return void res.end();
    }
    send('incident', intake.finalOutput);
    const brief =
      `Customer: ${ctx.customerEmail}\nOrder: ${sc?.orderId ?? req.body.orderId ?? 'unknown'}\n` +
      `Incident (validated): ${JSON.stringify(intake.finalOutput)}\n` +
      'Decide the next step for this exception.';
    await stream(res, send, brief, ctx);
  } catch (e) {
    if (e instanceof InputGuardrailTripwireTriggered) {
      send('blocked', { reason: 'Input guardrail tripped: the message looks like a prompt-injection attempt. Routed to a human.' });
    } else {
      send('error', { name: (e as Error).name, message: (e as Error).message });
    }
    res.end();
  }
});

app.post('/cases/:id/approvals', async (req, res) => {
  const file = path.join(STATE_DIR, `${req.params.id}.json`);
  const ctx = contexts.get(req.params.id) ?? makeContext({ caseId: req.params.id });
  let state: RunState<any, any>;
  try {
    state = await RunState.fromString(agents.triageAgent, await fs.readFile(file, 'utf-8'));
  } catch {
    return void res.status(404).json({ error: 'No pending approval for this case.' });
  }
  for (const item of state.getInterruptions()) {
    if (req.body.approve) state.approve(item);
    else state.reject(item);
  }
  await stream(res, sse(res), state, ctx);
});

const server = app.listen(Number(process.env.PORT ?? 3000), () =>
  console.log(`Exception desk listening on :${process.env.PORT ?? 3000} (MCP mode: ${config.mcpMode})`),
);
process.on('SIGINT', async () => {
  server.close();
  await closeAll(mcp);
  process.exit(0);
});
