import readline from 'node:readline/promises';
import type { RunToolApprovalItem } from '@openai/agents';

/** Human approval prompt for the CLI. Replace with a Slack button or web UI in production. */
export async function askHuman(item: RunToolApprovalItem, autoYes = false): Promise<boolean> {
  const raw = item.rawItem as { name?: string; arguments?: string };
  const summary = `${raw.name}(${raw.arguments})`;
  if (autoYes) {
    console.log(`\n[auto-approve] ${summary}`);
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nApprove ${summary}? [y/N] `);
  rl.close();
  return answer.trim().toLowerCase().startsWith('y');
}
