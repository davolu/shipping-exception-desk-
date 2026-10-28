# Shipping Exception Desk (OpenAI Agents SDK for TypeScript)

Companion code for the Medium article *Building a Shipping Exception Desk with the OpenAI Agents SDK for TypeScript*.

One system, built up in stages: structured output, tools and run context, handoffs, agents-as-tools, sessions, guardrails, human approvals, MCP (Shippo + Gmail), prompt-injection defense, streaming, tracing, evals, and an HTTP server.

Pinned: `@openai/agents@0.21.0` (needs `zod@^4`), Node 20+.

## Quick start

```bash
npm install
cp .env.example .env        # add OPENAI_API_KEY
npm run typecheck

npm run demo -- delivered_not_received
npm run demo -- damaged_parcel --yes       # --yes auto-approves human approvals
npm run demo -- lost_expensive             # asks you to approve a >$50 action
npm run demo -- injection                  # blocked by the input guardrail
```

By default `MCP_MODE=fixture`: Shippo and Gmail are replaced by local MCP servers (`src/mcp/fixtures/`) that speak real MCP over stdio. Nothing touches a live carrier account or inbox, and the demo is free to run besides model tokens.

## Stage map

| Stage | Where |
| --- | --- |
| 1 Structured output | `examples/01-single-agent.ts`, `src/schemas.ts` |
| 2 Tools + run context | `examples/02-tools.ts`, `src/tools.ts`, `src/context.ts` |
| 3 Handoffs | `examples/03-handoffs.ts`, `src/agents.ts` (triage) |
| 4 Agents as tools | `examples/04-agents-as-tools.ts`, `src/agents.ts` (planner) |
| 5 Sessions | `src/main.ts`, `src/server.ts` (`MemorySession`, swap for `OpenAIConversationsSession`) |
| 6 Guardrails | `src/guardrails.ts` |
| 7 Approvals | `src/tools.ts` (`needsApproval`), `src/pipeline.ts`, `src/approvals.ts` |
| 8 MCP | `src/mcp/index.ts`, `src/mcp/fixtures/` |
| 9 Injection defense | `src/guardrails.ts` (`recipientAllowlist`), `src/agents.ts` (Intake), scenario `injection` |
| 10 Streaming | `src/pipeline.ts`, `src/server.ts` |
| 11 Tracing | `src/pipeline.ts` (`withTrace`, `groupId`) |
| 12 Evals | `evals/offline.test.ts`, `evals/routing.test.ts` |
| 13 Production | `src/server.ts`, `public/index.html` (operator UI), `src/config.ts` (`maxTurns`, hard ceiling) |

Run the early stages on their own: `npm run ex:1` ... `npm run ex:4`.

## Tests

```bash
npm run test:offline   # no API key needed: tool filters, guardrails, approval threshold, MCP fixtures
npm run test:evals     # real model: routing pass-rate + injection test (EVAL_RUNS=3 by default)
```

## HTTP server + browser UI

```bash
npm run serve
# then open http://localhost:3000 — pick a scenario, watch the stream, approve/reject gated tools
```

The UI is a single static file (`public/index.html`, no build step) that consumes the SSE endpoints below with `fetch()`. Or drive the API directly:

```bash
curl -N -X POST localhost:3000/cases/c1/messages -H 'content-type: application/json' -d '{"scenario":"lost_expensive"}'
# if it emits approval_required:
curl -N -X POST localhost:3000/cases/c1/approvals -H 'content-type: application/json' -d '{"approve":true}'
```

Paused runs are saved to `.data/state/<case>.json` via `RunState.toString()` and resumed with `RunState.fromString()`.

## Going live with real MCP servers

Set `MCP_MODE=live` and the tokens in `.env.example`. Before you do:

1. Connect once and print the server's real tool names with `await server.listTools()` (this is unfiltered), then update `SHIPPO_ALLOWED` / `GMAIL_ALLOWED` in `src/mcp/index.ts`. Fixture names (`track_shipment`, `list_rates`, `create_draft`...) may differ from the real servers.
2. Hosted Shippo has no test mode and tracking can be billable. Keep evals on fixtures.
3. Remote MCP servers use OAuth. This repo sends a bearer token via `requestInit`; for a real service you will likely want the transport's `authProvider`.
4. The ledger is a JSONL file (`src/ledger.ts`). Swap it for Postgres (Neon works) with a normal client.

Optional: set `VECTOR_STORE_ID` to use OpenAI hosted file search for policies instead of the local search tool.

## What was and wasn't verified

Typechecked against the real `@openai/agents@0.21.0` types, and the 14 offline tests pass (including real MCP stdio fixtures). The model-backed flows (`demo`, `serve`, `test:evals`) need your `OPENAI_API_KEY`; I could not run them from my sandbox, so expect to tune prompts and thresholds on first run.
