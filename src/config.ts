import 'dotenv/config';

export const config = {
  mcpMode: (process.env.MCP_MODE ?? 'fixture') as 'fixture' | 'live',
  mainModel: process.env.MAIN_MODEL ?? 'gpt-5',
  smallModel: process.env.SMALL_MODEL ?? 'gpt-5-mini',
  vectorStoreId: process.env.VECTOR_STORE_ID,
  approvalLimitUsd: Number(process.env.APPROVAL_LIMIT_USD ?? 50),
  hardCeilingUsd: 500,
  maxTurns: 14,
};
