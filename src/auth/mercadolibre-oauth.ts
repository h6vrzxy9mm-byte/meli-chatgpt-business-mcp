import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config, isMock } from '../config.js';
import { EncryptedTokenStore, type StoredToken } from './token-store.js';

const store = new EncryptedTokenStore(config.TOKEN_STORE_PATH, config.SESSION_SECRET);
const states = new Map<string, number>();

function form(data: Record<string, string>) { return new URLSearchParams(data); }

export class MercadoLibreOAuth {
  startUrl(): string {
    const state = randomBytes(24).toString('hex');
    states.set(state, Date.now() + 10 * 60_000);
    const url = new URL('https://auth.mercadolibre.com.ar/authorization');
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.MELI_CLIENT_ID, redirect_uri: config.MELI_REDIRECT_URI, state }).toString();
    return url.toString();
  }
  async callback(code: string, state: string): Promise<void> {
    const expiration = states.get(state);
    states.delete(state);
    if (!expiration || expiration < Date.now()) throw new Error('OAuth state inválido o vencido');
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form({ grant_type: 'authorization_code', client_id: config.MELI_CLIENT_ID, client_secret: config.MELI_CLIENT_SECRET, code, redirect_uri: config.MELI_REDIRECT_URI })
    });
    await this.saveResponse(response);
  }
  async accessToken(): Promise<StoredToken | null> {
    if (isMock) return { accessToken: 'mock-access', refreshToken: 'mock-refresh', expiresAt: Date.now() + 3600_000, userId: 123456789 };
    const token = await store.load();
    if (!token) return null;
    if (token.expiresAt - Date.now() > 5 * 60_000) return token;
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form({ grant_type: 'refresh_token', client_id: config.MELI_CLIENT_ID, client_secret: config.MELI_CLIENT_SECRET, refresh_token: token.refreshToken })
    });
    return this.saveResponse(response);
  }
  private async saveResponse(response: Response): Promise<StoredToken> {
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`OAuth Mercado Libre falló (${response.status})`);
    const token = { accessToken: String(body.access_token), refreshToken: String(body.refresh_token), expiresAt: Date.now() + Number(body.expires_in) * 1000, userId: Number(body.user_id) };
    await store.save(token);
    return token;
  }
}

export function safeApiKey(value: string | undefined): boolean {
  if (!value) return false;
  const a = Buffer.from(value); const b = Buffer.from(config.MCP_API_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}
