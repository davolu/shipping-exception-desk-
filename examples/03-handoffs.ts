// Stage 3: handoffs, no MCP needed.  Run: npm run ex:3
import 'dotenv/config';
import { Agent, run } from '@openai/agents';
import { RECOMMENDED_PROMPT_PREFIX } from '@openai/agents-core/extensions';
import { makeContext, type CaseContext } from '../src/context.js';
import { lookupOrder, searchPolicy } from '../src/tools.js';

const trackingAgent = new Agent<CaseContext>({
  name: 'Tracking',
  handoffDescription: 'Looks up order details and tracking. Use for "where is it" questions.',
  instructions: 'Use lookup_order and report facts only.',
  tools: [lookupOrder],
});
const policyAgent = new Agent<CaseContext>({
  name: 'Policy',
  handoffDescription: 'Answers claim windows and refund/reship rules.',
  instructions: 'Answer ONLY from search_policy results and cite the file.',
  tools: [searchPolicy],
});
const triage = Agent.create({
  name: 'Triage',
  instructions: `${RECOMMENDED_PROMPT_PREFIX}\nHand off to exactly one specialist. Do not answer yourself.`,
  handoffs: [trackingAgent, policyAgent],
});

for (const q of ['Where is ORD-1234?', 'How long do we have to file a UPS claim?']) {
  const r = await run(triage, q, { context: makeContext() });
  console.log(`\nQ: ${q}\nHandled by: ${r.lastAgent?.name}\nA: ${r.finalOutput}`);
}
