import { tool, type RunContext } from '@openai/agents';
import { z } from 'zod';
import { config } from './config.js';
import type { CaseContext } from './context.js';
import { ORDERS, searchPolicyDocs } from './data.js';
import { appendLedger } from './ledger.js';

/* ---------- Stage 2: a plain function tool ---------- */

export const lookupOrder = tool({
  name: 'lookup_order',
  description:
    'Fetch an order by id: items, total in USD, customer email, shipping address, carrier and tracking number.',
  parameters: z.object({ orderId: z.string().describe('Order id such as ORD-1234') }),
  async execute({ orderId }) {
    const order = ORDERS[orderId.toUpperCase()];
    // Return specific, actionable errors as data so the model can recover.
    if (!order) return { error: 'order_not_found', hint: 'Order ids look like ORD-1234.' };
    return order;
  },
});

export const searchPolicy = tool({
  name: 'search_policy',
  description: 'Search carrier claim windows and refund/reship policy documents. Cite the source file.',
  parameters: z.object({ query: z.string() }),
  async execute({ query }) {
    const hits = searchPolicyDocs(query);
    return hits.length ? hits : { error: 'no_policy_found', hint: 'Say the documents do not cover it.' };
  },
});

/* ---------- Stage 7: money tools behind human approval ---------- */

const MoneyArgs = z.object({
  orderId: z.string(),
  costUsd: z.number().describe('Total cost to the business in USD'),
});

function overLimit(runContext: RunContext<unknown>, input: z.infer<typeof MoneyArgs>) {
  return input.costUsd > (runContext.context as CaseContext).approvalLimitUsd;
}

export const reshipOrder = tool({
  name: 'reship_order',
  description: 'Buy a replacement shipment for an order. Spends real money. May require human approval.',
  parameters: MoneyArgs,
  needsApproval: async (runContext, input) => overLimit(runContext, input),
  errorFunction: (_ctx, error) =>
    `Refused: ${error instanceof Error ? error.message : String(error)}. Do not retry; tell the operator.`,
  async execute({ orderId, costUsd }, runContext?: RunContext<unknown>) {
    // Defense in depth: never trust only the approval layer.
    if (costUsd > config.hardCeilingUsd) throw new Error('Above hard ceiling; escalate to finance.');
    appendLedger((runContext?.context as CaseContext | undefined)?.caseId ?? 'unknown', 'reship', { orderId, costUsd });
    return { status: 'RESHIPPED', orderId, costUsd };
  },
});

export const refundOrder = tool({
  name: 'refund_order',
  description: 'Refund an order. Spends real money. May require human approval.',
  parameters: MoneyArgs,
  needsApproval: async (runContext, input) => overLimit(runContext, input),
  errorFunction: (_ctx, error) =>
    `Refused: ${error instanceof Error ? error.message : String(error)}. Do not retry; tell the operator.`,
  async execute({ orderId, costUsd }, runContext?: RunContext<unknown>) {
    if (costUsd > config.hardCeilingUsd) throw new Error('Above hard ceiling; escalate to finance.');
    appendLedger((runContext?.context as CaseContext | undefined)?.caseId ?? 'unknown', 'refund', { orderId, costUsd });
    return { status: 'REFUNDED', orderId, costUsd };
  },
});

/**
 * Stage 8: writes to external systems go through YOUR gate. The model never sees Shippo's
 * pickup tool; it sees this wrapper, which always needs approval.
 */
export function makeSchedulePickup(shippo: { callTool: (name: string, args: Record<string, unknown> | null) => Promise<unknown> }) {
  return tool({
    name: 'schedule_pickup',
    description: 'Schedule a carrier pickup for a shipment. Always requires human approval.',
    parameters: z.object({ shipmentId: z.string(), date: z.string().describe('YYYY-MM-DD') }),
    needsApproval: true,
    async execute(args) {
      return shippo.callTool('create_pickup', args);
    },
  });
}
