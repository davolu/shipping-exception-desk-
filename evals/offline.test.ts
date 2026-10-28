/**
 * Offline tests: no OpenAI key needed. They prove the safety layers work in code,
 * independent of any model behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RunContext } from '@openai/agents';
import { buildAgents } from '../src/agents.js';
import { makeContext } from '../src/context.js';
import { searchPolicyDocs } from '../src/data.js';
import { noCardNumbers, recipientAllowlist } from '../src/guardrails.js';
import { closeAll, connectAll, createMcpServers, type McpServers } from '../src/mcp/index.js';
import { reshipOrder } from '../src/tools.js';

describe('MCP fixtures + tool filters (least privilege)', () => {
  let mcp: McpServers;
  beforeAll(async () => {
    mcp = createMcpServers('fixture');
    await connectAll(mcp);
  }, 30_000);
  afterAll(async () => {
    await closeAll(mcp);
  });

  // NOTE: server.listTools() is UNFILTERED (handy for discovery). The filter applies when an
  // agent resolves its tools, so we assert on agent.getMcpTools(), which is what the model sees.
  const modelSees = async (agent: { getMcpTools: (rc: RunContext<any>) => Promise<{ name: string }[]> }) =>
    (await agent.getMcpTools(new RunContext(makeContext()))).map((t) => t.name).sort();

  it('server really has a write tool that the model must not see', async () => {
    const all = (await mcp.shippo.listTools()).map((t) => t.name);
    expect(all).toContain('create_pickup');
  });

  it('tracking agent sees read tools only', async () => {
    const names = await modelSees(buildAgents(mcp).trackingAgent);
    expect(names).toEqual(['list_rates', 'track_shipment']);
  });

  it('comms agent can search/read/draft but never send', async () => {
    const names = await modelSees(buildAgents(mcp).commsAgent);
    expect(names).toEqual(['create_draft', 'get_thread', 'search_threads']);
  });

  it('our own code can still call a hidden write tool (for approval-gated wrappers)', async () => {
    const out = await mcp.shippo.callTool('create_pickup', { shipmentId: 'S1', date: '2026-11-01' });
    expect(JSON.stringify(out)).toContain('SCHEDULED');
  });

  it('tracking data comes back', async () => {
    const out = await mcp.shippo.callTool('track_shipment', { trackingNumber: '1Z999AA10123456784' });
    expect(JSON.stringify(out)).toContain('DELIVERED');
  });
});

describe('Stage 9: recipient allowlist tool guardrail', () => {
  const rc = new RunContext(makeContext({ customerEmail: 'sam@example.com' }));
  const call = (to: string, name = 'create_draft') =>
    recipientAllowlist.run({
      context: rc,
      agent: {} as never,
      toolCall: { type: 'function_call', name, callId: 'c1', arguments: JSON.stringify({ to, subject: 's', body: 'b' }) } as never,
    });

  it('allows the case customer', async () => {
    expect((await call('SAM@example.com')).behavior.type).toBe('allow');
  });
  it('rejects an injected recipient', async () => {
    const out = await call('refunds@evil-example.com');
    expect(out.behavior.type).toBe('rejectContent');
  });
  it('ignores other tools', async () => {
    expect((await call('x@y.com', 'search_threads')).behavior.type).toBe('allow');
  });
});

describe('Stage 6: output guardrail', () => {
  it('trips on a card number', async () => {
    const out = await noCardNumbers.execute({ agentOutput: 'Your card 4111 1111 1111 1111 was refunded', context: new RunContext({}), agent: {} as never } as never);
    expect(out.tripwireTriggered).toBe(true);
  });
  it('passes normal text', async () => {
    const out = await noCardNumbers.execute({ agentOutput: 'Your parcel is on its way', context: new RunContext({}), agent: {} as never } as never);
    expect(out.tripwireTriggered).toBe(false);
  });
});

describe('Stage 7: approval threshold', () => {
  const rc = new RunContext(makeContext({ approvalLimitUsd: 50 }));
  const needs = (costUsd: number) => (reshipOrder.needsApproval as Function)(rc, { orderId: 'ORD-1', costUsd }, 'call');
  it('does not need approval at or below the limit', async () => {
    expect(await needs(30)).toBe(false);
    expect(await needs(50)).toBe(false);
  });
  it('needs approval above the limit', async () => {
    expect(await needs(60)).toBe(true);
  });
  it('hard ceiling blocks even approved calls', async () => {
    // The SDK turns thrown errors into a model-visible string (customized by errorFunction).
    const out = await reshipOrder.invoke(rc, JSON.stringify({ orderId: 'ORD-1', costUsd: 900 }));
    expect(String(out)).toMatch(/hard ceiling/i);
  });
});

describe('policy search', () => {
  it('finds the claim window', () => {
    const hits = searchPolicyDocs('UPS claim window');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source).toMatch(/claims/);
  });
});
