import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: number;
}

export class EncryptedTokenStore {
  private key: Buffer;
  constructor(private path: string, secret: string) {
    this.key = createHash('sha256').update(secret).digest();
  }
  async load(): Promise<StoredToken | null> {
    try {
      const packed = JSON.parse(await readFile(this.path, 'utf8')) as { iv: string; tag: string; data: string };
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(packed.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(packed.tag, 'base64'));
      const clear = Buffer.concat([decipher.update(Buffer.from(packed.data, 'base64')), decipher.final()]);
      return JSON.parse(clear.toString('utf8')) as StoredToken;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async save(token: StoredToken): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(token)), cipher.final()]);
    const packed = JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, packed, { encoding: 'utf8', mode: 0o600 });
    await rename(temp, this.path);
  }
}
