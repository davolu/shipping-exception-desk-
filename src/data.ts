import fs from 'node:fs';
import path from 'node:path';

export type Order = {
  orderId: string;
  items: string[];
  totalUsd: number;
  customerEmail: string;
  shippingAddress: string;
  trackingNumber: string;
  carrier: 'usps' | 'ups' | 'fedex' | 'dhl';
};

export const ORDERS: Record<string, Order> = {
  'ORD-1234': {
    orderId: 'ORD-1234',
    items: ['Birthday gift box'],
    totalUsd: 40,
    customerEmail: 'sam@example.com',
    shippingAddress: '12 Elm St, Austin, TX 78701',
    trackingNumber: '1Z999AA10123456784',
    carrier: 'ups',
  },
  'ORD-2001': {
    orderId: 'ORD-2001',
    items: ['Ceramic mug set'],
    totalUsd: 28,
    customerEmail: 'lee@example.com',
    shippingAddress: '5 Oak Ave, Denver, CO 80202',
    trackingNumber: '9400111899223197428490',
    carrier: 'usps',
  },
  'ORD-3005': {
    orderId: 'ORD-3005',
    items: ['Wireless headphones'],
    totalUsd: 210,
    customerEmail: 'ana@example.com',
    shippingAddress: '88 Pine Rd, Seattle, WA 98101',
    trackingNumber: '794644790132',
    carrier: 'fedex',
  },
  'ORD-9999': {
    orderId: 'ORD-9999',
    items: ['Phone case'],
    totalUsd: 19,
    customerEmail: 'mallory@example.com',
    shippingAddress: '1 Hacker Way, Menlo Park, CA 94025',
    trackingNumber: '1Z999AA10123450000',
    carrier: 'ups',
  },
};

const POLICY_DIR = path.resolve(process.cwd(), 'policies');

/** Tiny keyword search over policies/*.md. Swap for fileSearchTool + a vector store in production. */
export function searchPolicyDocs(query: string, limit = 4): { source: string; excerpt: string }[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const hits: { source: string; excerpt: string; score: number }[] = [];
  for (const file of fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(POLICY_DIR, file), 'utf-8');
    for (const para of text.split(/\n\s*\n/)) {
      const lower = para.toLowerCase();
      const score = terms.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0);
      if (score > 0) hits.push({ source: file, excerpt: para.trim(), score });
    }
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ source, excerpt }) => ({ source, excerpt }));
}
