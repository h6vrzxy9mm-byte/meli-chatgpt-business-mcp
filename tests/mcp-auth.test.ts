import { describe, expect, it } from 'vitest';
import { isMcpDiscoveryRequest } from '../src/server.js';

describe('MCP discovery authentication boundary', () => {
  it.each([
    'initialize',
    'notifications/initialized',
    'ping',
    'tools/list',
    'resources/list',
    'resources/templates/list',
    'prompts/list'
  ])('allows unauthenticated metadata method %s', (method) => {
    expect(isMcpDiscoveryRequest({ jsonrpc: '2.0', id: 1, method })).toBe(true);
  });

  it.each(['tools/call', 'resources/read', 'unknown'])('keeps %s authenticated', (method) => {
    expect(isMcpDiscoveryRequest({ jsonrpc: '2.0', id: 1, method })).toBe(false);
  });

  it('rejects a batch if any message is not discovery-only', () => {
    expect(isMcpDiscoveryRequest([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call' }
    ])).toBe(false);
  });
});
