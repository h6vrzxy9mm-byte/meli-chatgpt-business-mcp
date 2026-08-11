import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';

describe('protección de publicación', () => {
  it('bloquea crear sin PUBLICAR', async () => {
    const { server } = createMcpServer(); const client = new Client({ name: 'test', version: '1' }); const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a); await client.connect(b);
    const result = await client.callTool({ name: 'meli_create_listing', arguments: { draft: { title: 'Mantel test', category_id: 'MLA436287', price: 25000, currency_id: 'ARS', available_quantity: 1, buying_mode: 'buy_it_now', listing_type_id: 'gold_special', attributes: [], pictures: [{ source: 'https://example.com/a.jpg' }], shipping: { mode: 'me2', free_shipping: false } }, confirmed: false, confirmation_word: '' } });
    expect(result.isError).toBe(true); expect(JSON.stringify(result.content)).toContain('Operación bloqueada');
    await client.close(); await server.close();
  });
});
