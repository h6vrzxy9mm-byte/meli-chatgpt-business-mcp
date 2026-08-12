import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { MercadoLibreOAuth, safeApiKey } from './auth/mercadolibre-oauth.js';
import { MercadoLibreClient } from './mercadolibre/client.js';
import { registerTools } from './tools/register.js';

const DISCOVERY_METHODS = new Set([
  'initialize',
  'notifications/initialized',
  'ping',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list'
]);

export function isMcpDiscoveryRequest(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.length > 0 && messages.every((message) => {
    if (!message || typeof message !== 'object') return false;
    const method = (message as { method?: unknown }).method;
    return typeof method === 'string' && DISCOVERY_METHODS.has(method);
  });
}

export function createMcpServer() {
  const server = new McpServer({ name: 'mercado-libre-argentina-listings', version: '1.0.0' });
  const oauth = new MercadoLibreOAuth(); registerTools(server, new MercadoLibreClient(oauth)); return { server, oauth };
}

export async function start() {
  const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit: '12mb' }));
  const oauth = new MercadoLibreOAuth();
  app.get('/health', (_req, res) => res.json({ ok: true, mode: config.MELI_MODE, site_id: 'MLA' }));
  app.get('/oauth/meli/start', (_req, res) => res.redirect(oauth.startUrl()));
  app.get('/oauth/meli/callback', async (req, res) => { try { await oauth.callback(String(req.query.code ?? ''), String(req.query.state ?? '')); res.type('text').send('Mercado Libre conectado. Ya podés cerrar esta pestaña.'); } catch { res.status(400).type('text').send('No se pudo conectar Mercado Libre. Revisá la configuración y volvé a intentar.'); } });
  app.all('/mcp', async (req, res) => {
    const authenticated = safeApiKey(req.header('authorization')?.replace(/^Bearer\s+/i, ''));
    if (!authenticated && !isMcpDiscoveryRequest(req.body)) return res.status(401).json({ error: 'unauthorized' });
    const { server } = createMcpServer(); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport); await transport.handleRequest(req, res, req.body);
  });
  app.listen(config.PORT, '0.0.0.0', () => console.log(`MCP Mercado Libre escuchando en ${config.PUBLIC_BASE_URL}/mcp (${config.MELI_MODE})`));
}

if (process.env.NODE_ENV !== 'test') void start();
