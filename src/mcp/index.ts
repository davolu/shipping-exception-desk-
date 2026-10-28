import path from 'node:path';
import {
  MCPServerStdio,
  MCPServerStreamableHttp,
  createMCPToolStaticFilter,
  type MCPServer,
} from '@openai/agents';
import { config } from '../config.js';
import { recipientAllowlist } from '../guardrails.js';

export type McpServers = { shippo: MCPServer; gmail: MCPServer };

// Least privilege: each agent family gets only the tools it needs.
const SHIPPO_ALLOWED = ['track_shipment', 'list_rates']; // create_pickup is NOT exposed to the model
const GMAIL_ALLOWED = ['search_threads', 'get_thread', 'create_draft']; // send_message is NOT exposed

const tsxBin = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
const fixture = (file: string) => path.resolve(process.cwd(), 'src/mcp/fixtures', file);

export function createMcpServers(mode = config.mcpMode): McpServers {
  if (mode === 'live') {
    const bearer = (token?: string) => ({ headers: { Authorization: `Bearer ${token ?? ''}` } });
    return {
      shippo: new MCPServerStreamableHttp({
        name: 'shippo',
        url: process.env.SHIPPO_MCP_URL ?? 'https://mcp.shippo.com',
        cacheToolsList: true,
        requestInit: bearer(process.env.SHIPPO_MCP_TOKEN),
        toolFilter: createMCPToolStaticFilter({ allowed: SHIPPO_ALLOWED }),
      }),
      gmail: new MCPServerStreamableHttp({
        name: 'gmail',
        url: process.env.GMAIL_MCP_URL ?? 'https://gmailmcp.googleapis.com/mcp/v1',
        cacheToolsList: true,
        requestInit: bearer(process.env.GMAIL_MCP_TOKEN),
        toolFilter: createMCPToolStaticFilter({ allowed: GMAIL_ALLOWED }),
        toolInputGuardrails: [recipientAllowlist],
      }),
    };
  }

  return {
    shippo: new MCPServerStdio({
      name: 'shippo',
      command: tsxBin,
      args: [fixture('shippo-server.ts')],
      cacheToolsList: true,
      toolFilter: createMCPToolStaticFilter({ allowed: SHIPPO_ALLOWED }),
    }),
    gmail: new MCPServerStdio({
      name: 'gmail',
      command: tsxBin,
      args: [fixture('gmail-server.ts')],
      cacheToolsList: true,
      toolFilter: createMCPToolStaticFilter({ allowed: GMAIL_ALLOWED }),
      toolInputGuardrails: [recipientAllowlist],
    }),
  };
}

export async function connectAll(servers: McpServers) {
  await Promise.all([servers.shippo.connect(), servers.gmail.connect()]);
}

export async function closeAll(servers: McpServers) {
  await Promise.allSettled([servers.shippo.close(), servers.gmail.close()]);
}
