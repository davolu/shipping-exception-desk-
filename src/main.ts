import { MemorySession } from '@openai/agents';
import { buildAgents } from './agents.js';
import { makeContext } from './context.js';
import { closeAll, connectAll, createMcpServers } from './mcp/index.js';
import { handleCase } from './pipeline.js';
import { SCENARIOS } from './scenarios.js';

/**
 * Usage: npm run demo -- <scenario> [--yes]
 * Scenarios: delivered_not_received | damaged_parcel | lost_expensive | injection
 */
async function main() {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--')) ?? 'delivered_not_received';
  const autoYes = args.includes('--yes');
  const scenario = SCENARIOS[id];
  if (!scenario) {
    console.error(`Unknown scenario "${id}". Options: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  const mcp = createMcpServers();
  await connectAll(mcp);
  try {
    const agents = buildAgents(mcp);
    const ctx = makeContext({ caseId: `case_${scenario.id}`, customerEmail: scenario.customerEmail });
    console.log(`\n=== ${scenario.id} ===\n${scenario.message}\n`);

    const outcome = await handleCase({
      agents,
      scenario,
      ctx,
      session: new MemorySession(), // swap for OpenAIConversationsSession to persist across processes
      autoYes,
      onText: (d) => process.stdout.write(d),
    });
    console.log('\n\n=== outcome ===');
    console.log(JSON.stringify(outcome, null, 2));
  } finally {
    await closeAll(mcp);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
