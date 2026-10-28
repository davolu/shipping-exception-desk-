import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.cwd(), '.data');

/**
 * Case ledger: append-only JSONL. In production, write this with a normal Postgres client
 * (or Neon). Using a file keeps the demo runnable with zero infrastructure.
 */
export function appendLedger(caseId: string, event: string, data: unknown) {
  fs.mkdirSync(DIR, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), caseId, event, data });
  fs.appendFileSync(path.join(DIR, 'ledger.jsonl'), line + '\n');
}
