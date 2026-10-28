/**
 * Fixture MCP server that mimics the shape of Shippo's tracking/rates/pickup tools.
 * Runs over stdio so the demo and the evals never touch a live carrier account.
 * Tool names here are fixture names; with the real Shippo server, run listTools() and adapt.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TRACKING: Record<string, unknown> = {
  '1Z999AA10123456784': {
    carrier: 'ups',
    status: 'DELIVERED',
    events: [
      { at: '2026-10-22T10:02:00Z', status: 'OUT_FOR_DELIVERY', location: 'Austin, TX' },
      { at: '2026-10-22T16:41:00Z', status: 'DELIVERED', location: 'Austin, TX', note: 'Delivered, left at front door' },
    ],
  },
  '9400111899223197428490': {
    carrier: 'usps',
    status: 'DELIVERED',
    events: [{ at: '2026-10-21T14:00:00Z', status: 'DELIVERED', location: 'Denver, CO' }],
  },
  '794644790132': {
    carrier: 'fedex',
    status: 'IN_TRANSIT',
    events: [
      { at: '2026-10-15T08:00:00Z', status: 'PICKED_UP', location: 'Memphis, TN' },
      { at: '2026-10-16T03:30:00Z', status: 'DEPARTED_FACILITY', location: 'Memphis, TN' },
    ],
    note: 'No scan for 12 days',
  },
  '1Z999AA10123450000': {
    carrier: 'ups',
    status: 'EXCEPTION',
    events: [{ at: '2026-10-20T09:00:00Z', status: 'EXCEPTION', location: 'Reno, NV', note: 'Address issue' }],
  },
};

const server = new McpServer({ name: 'shippo-fixture', version: '1.0.0' });
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

server.registerTool(
  'track_shipment',
  {
    description: 'Get carrier tracking status and event history for a tracking number.',
    inputSchema: { trackingNumber: z.string() },
  },
  async ({ trackingNumber }) => text(TRACKING[trackingNumber] ?? { error: 'tracking_number_not_found' }),
);

server.registerTool(
  'list_rates',
  {
    description: 'List replacement shipping rates for a parcel (USD) with transit days.',
    inputSchema: { weightOz: z.number(), destinationZip: z.string() },
  },
  async ({ weightOz }) =>
    text([
      { service: 'ground', costUsd: 8 + weightOz * 0.1, transitDays: 5 },
      { service: 'express', costUsd: 22 + weightOz * 0.25, transitDays: 2 },
      { service: 'overnight', costUsd: 48 + weightOz * 0.4, transitDays: 1 },
    ]),
);

server.registerTool(
  'create_pickup',
  {
    description: 'Schedule a carrier pickup. Has side effects.',
    inputSchema: { shipmentId: z.string(), date: z.string() },
  },
  async ({ shipmentId, date }) => text({ pickupId: `PU-${shipmentId}-${date}`, status: 'SCHEDULED' }),
);

await server.connect(new StdioServerTransport());
