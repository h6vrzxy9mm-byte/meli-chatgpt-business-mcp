import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  MELI_CLIENT_ID: z.string().default('mock-client'),
  MELI_CLIENT_SECRET: z.string().default('mock-secret'),
  MELI_REDIRECT_URI: z.string().url().default('http://localhost:3000/oauth/meli/callback'),
  SESSION_SECRET: z.string().min(32).default('mock-session-secret-at-least-32-chars'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3000),
  MELI_SITE_ID: z.literal('MLA').default('MLA'),
  MELI_MODE: z.enum(['mock', 'live']).default('mock'),
  TOKEN_STORE_PATH: z.string().default('./data/tokens.enc'),
  MCP_API_KEY: z.string().min(16).default('mock-api-key-change-me')
});

export const config = schema.parse(process.env);
export const isMock = config.MELI_MODE === 'mock';
