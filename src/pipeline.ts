import fs from 'node:fs/promises';
import path from 'node:path';
import {
  GuardrailExecutionError,
  InputGuardrailTripwireTriggered,
  MaxTurnsExceededError,
  OutputGuardrailTripwireTriggered,
  RunState,
  run,
  withTrace,
  type Session,
} from '@openai/agents';
import { askHuman } from './approvals.js';
import type { Agents } from './agents.js';
import { config } from './config.js';
import type { CaseContext } from './context.js';
import { appendLedger } from './ledger.js';
import type { Scenario } from './scenarios.js';

export type Outcome =
  | { status: 'ok'; output: unknown }
  | { status: 'blocked'; reason: string }
  | { status: 'error'; reason: string };

const STATE_DIR = path.resolve(process.cwd(), '.data/state');

/**
 * The full flow:
 *   1. Intake (input guardrail + structured output): untrusted prose becomes a validated Incident.
 *   2. Triage gets STRUCTURED fields only, never the raw message.
 *   3. Run, streaming progress. Pause on approvals, persist state, resume.
 */
export async function handleCase(opts: {
  agents: Agents;
  scenario: Scenario;
  ctx: CaseContext;
  session: Session;
  autoYes?: boolean;
  onText?: (delta: string) => void;
}): Promise<Outcome> {
  const { agents, scenario, ctx, session, autoYes, onText } = opts;

  return withTrace(
    'exception_case',
    async () => {
      try {
        // 1) Intake
        const intake = await run(agents.intakeAgent, scenario.message, { context: ctx, maxTurns: 4 });
        const incident = intake.finalOutput;
        if (!incident) return { status: 'error', reason: 'Intake produced no structured output' } as Outcome;
        appendLedger(ctx.caseId, 'incident', incident);

        // 2) Triage with structured brief
        const brief =
          `Customer: ${ctx.customerEmail}\nOrder: ${scenario.orderId}\n` +
          `Incident (validated): ${JSON.stringify(incident)}\n` +
          'Decide the next step for this exception.';

        let stream = await run(agents.triageAgent, brief, {
          stream: true,
          context: ctx,
          session,
          maxTurns: config.maxTurns,
        });
        const pump = async (s: typeof stream) => {
          for await (const event of s) {
            if (event.type === 'raw_model_stream_event' && event.data.type === 'output_text_delta') {
              onText?.(event.data.delta);
            } else if (event.type === 'agent_updated_stream_event') {
              console.log(`\n[handoff -> ${event.agent.name}]`);
            } else if (event.type === 'run_item_stream_event' && event.item.type === 'tool_call_item') {
              const raw = event.item.rawItem as { name?: string };
              console.log(`\n[tool: ${raw.name}]`);
            }
          }
          await s.completed;
        };
        await pump(stream);

        // 3) Approvals loop (Stage 7)
        while (stream.interruptions?.length) {
          await fs.mkdir(STATE_DIR, { recursive: true });
          await fs.writeFile(path.join(STATE_DIR, `${ctx.caseId}.json`), stream.state.toString());
          for (const item of stream.interruptions) {
            const ok = await askHuman(item, autoYes);
            appendLedger(ctx.caseId, ok ? 'approved' : 'rejected', item.rawItem);
            if (ok) stream.state.approve(item);
            else stream.state.reject(item);
          }
          stream = await run(agents.triageAgent, stream.state, {
            stream: true,
            context: ctx,
            session,
            maxTurns: config.maxTurns,
          });
          await pump(stream);
        }

        appendLedger(ctx.caseId, 'final', stream.finalOutput);
        return { status: 'ok', output: stream.finalOutput } as Outcome;
      } catch (err) {
        if (err instanceof InputGuardrailTripwireTriggered) {
          appendLedger(ctx.caseId, 'blocked_input', {});
          return { status: 'blocked', reason: 'Input guardrail tripped: routed to a human.' } as Outcome;
        }
        if (err instanceof OutputGuardrailTripwireTriggered) {
          appendLedger(ctx.caseId, 'blocked_output', {});
          return { status: 'blocked', reason: 'Output guardrail tripped: routed to a human.' } as Outcome;
        }
        if (err instanceof GuardrailExecutionError) {
          // The guardrail itself failed (network, model error). Fail closed.
          return { status: 'error', reason: 'Guardrail could not complete; escalate to a human.' } as Outcome;
        }
        if (err instanceof MaxTurnsExceededError) {
          return { status: 'error', reason: 'Agent exceeded max turns; escalate to a human.' } as Outcome;
        }
        throw err;
      }
    },
    { groupId: ctx.caseId },
  );
}

export { RunState };
