import { z } from 'zod';

/** Stage 1: the contract between messy text and the rest of the system. */
export const Incident = z.object({
  trackingNumber: z.string(),
  orderId: z.string().nullable(),
  carrier: z.enum(['usps', 'ups', 'fedex', 'dhl', 'other']),
  category: z.enum(['delayed', 'failed_delivery', 'damaged', 'lost', 'address_issue', 'other']),
  severity: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
});
export type Incident = z.infer<typeof Incident>;

/** Stage 4: what each option agent returns. */
export const Option = z.object({
  kind: z.enum(['reship', 'refund', 'redeliver']),
  costUsd: z.number(),
  etaDays: z.number().nullable(),
  risks: z.array(z.string()),
});
export type Option = z.infer<typeof Option>;

export const Recommendation = z.object({
  choice: Option,
  rationale: z.string(),
  executed: z.boolean(),
});
export type Recommendation = z.infer<typeof Recommendation>;
