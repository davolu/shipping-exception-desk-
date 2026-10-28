// Stage 2: tools + run context.  Run: npm run ex:2
import 'dotenv/config';
import { Agent, run } from '@openai/agents';
import { makeContext, type CaseContext } from '../src/context.js';
import { lookupOrder } from '../src/tools.js';

const trackingAgent = new Agent<CaseContext>({
  name: 'Tracking',
  instructions: 'Look up orders and report facts only. If a tool returns an error, say so. Never guess.',
  tools: [lookupOrder],
});

const result = await run(trackingAgent, 'What did customer order in ORD-1234 and what is the tracking number?', {
  context: makeContext(),
});
console.log(result.finalOutput);
