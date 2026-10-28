// Stage 1: one agent, one job, structured output.  Run: npm run ex:1
import 'dotenv/config';
import { Agent, run } from '@openai/agents';
import { Incident } from '../src/schemas.js';

const intakeAgent = new Agent({
  name: 'Intake',
  instructions:
    'Read raw customer messages about shipping problems and extract the tracking number, order id (null if absent), ' +
    'carrier, incident category, severity, and a one-sentence summary.',
  outputType: Incident,
});

const result = await run(
  intakeAgent,
  'Hi, my UPS package 1Z999AA10123456784 says delivery attempted but nobody came. ' +
    'This was a birthday gift and I need it by Friday!',
);
console.log(result.finalOutput); // typed as Incident
