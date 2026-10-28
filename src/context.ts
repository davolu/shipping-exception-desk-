/** Run context: available to tools, guardrails and approval functions. Never shown to the model. */
export type CaseContext = {
  caseId: string;
  operator: string;
  customerEmail: string;
  approvalLimitUsd: number;
};

export function makeContext(overrides: Partial<CaseContext> = {}): CaseContext {
  return {
    caseId: 'case_001',
    operator: 'dana',
    customerEmail: 'sam@example.com',
    approvalLimitUsd: Number(process.env.APPROVAL_LIMIT_USD ?? 50),
    ...overrides,
  };
}
