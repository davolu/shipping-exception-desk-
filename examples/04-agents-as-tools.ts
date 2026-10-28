// Stage 4: manager pattern + deterministic parallelism.  Run: npm run ex:4
import 'dotenv/config';
import { Agent, run } from '@openai/agents';
import { makeContext, type CaseContext } from '../src/context.js';
import { Option } from '../src/schemas.js';
import { lookupOrder } from '../src/tools.js';

const optionAgent = (kind: Option['kind']) =>
  new Agent<CaseContext, typeof Option>({
    name: `${kind}Option`,
    instructions: `Evaluate the ${kind} resolution for the order in the brief. Return cost in USD, ETA days and risks.`,
    tools: [lookupOrder],
    outputType: Option,
  });

const brief = 'Order ORD-2001 arrived damaged. Evaluate your resolution option.';
const ctx = makeContext();

// Guaranteed parallelism: plain code, no reliance on model behavior.
const results = await Promise.all(
  (['reship', 'refund', 'redeliver'] as const).map((k) => run(optionAgent(k), brief, { context: ctx })),
);
for (const r of results) console.log(r.finalOutput);

// Manager pattern: the planner stays in charge and calls specialists as tools.
const planner = new Agent<CaseContext>({
  name: 'Planner',
  instructions: 'Call all three option tools, then recommend ONE resolution with a short rationale.',
  tools: (['reship', 'refund', 'redeliver'] as const).map((k) =>
    optionAgent(k).asTool({ toolName: `${k}_option`, toolDescription: `Evaluate ${k}` }),
  ),
});
console.log((await run(planner, brief, { context: ctx })).finalOutput);
