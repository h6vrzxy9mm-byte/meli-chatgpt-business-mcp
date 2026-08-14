import { isMock } from '../config.js';
import type { Comparable, Costs, ListingDraft } from '../types/index.js';
import { MercadoLibreOAuth } from '../auth/mercadolibre-oauth.js';
import sharp from 'sharp';

const API = 'https://api.mercadolibre.com';

export class MercadoLibreClient {
  constructor(private oauth: MercadoLibreOAuth) {}
  private async request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const token = auth ? await this.oauth.accessToken() : null;
    if (auth && !token) throw new Error('Cuenta de Mercado Libre no conectada. Abrí /oauth/meli/start.');
    const response = await fetch(`${API}${path}`, { ...init, headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token.accessToken}` } : {}), ...init.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Mercado Libre API ${response.status}: ${JSON.stringify(body)}`);
    return body as T;
  }
  async me() {
    if (isMock) return { id: 123456789, nickname: 'VENDEDORA_MOCK', tags: ['user_product_seller'] };
    const token = await this.oauth.accessToken();
    if (!token) return null;
    return this.request<{ id: number; nickname: string; tags?: string[] }>(`/users/${token.userId}`);
  }
  async search(query: string, limit = 30): Promise<Comparable[]> {
    if (isMock) return mockComparables();
    const data = await this.request<{ results: any[] }>(`/sites/MLA/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return data.results.map((x) => ({ id: x.id, title: x.title, price: x.price, permalink: x.permalink, categoryId: x.category_id, condition: x.condition, listingTypeId: x.listing_type_id, freeShipping: x.shipping?.free_shipping, installments: x.installments?.quantity ?? null, soldQuantity: x.sold_quantity, sellerReputation: x.seller?.seller_reputation?.level_id ?? null, attributes: x.attributes, relevanceScore: 0 }));
  }
  async predictCategory(title: string) {
    if (isMock) return { category_id: 'MLA436287', category_name: 'Manteles' };
    const data = await this.request<any[]>(`/sites/MLA/domain_discovery/search?limit=1&q=${encodeURIComponent(title)}`);
    if (!data[0]) throw new Error('Mercado Libre no pudo determinar una categoría');
    return data[0];
  }
  async categoryAttributes(categoryId: string) {
    if (isMock) return [
      { id: 'BRAND', name: 'Marca', tags: { required: true }, value_type: 'string' },
      { id: 'MODEL', name: 'Modelo', tags: { required: true }, value_type: 'string' },
      { id: 'COLOR', name: 'Color', tags: {}, value_type: 'string' },
      { id: 'ITEM_CONDITION', name: 'Condición del ítem', tags: { required: true }, values: [{ id: '2230284', name: 'Nuevo' }] }
    ];
    return this.request<any[]>(`/categories/${encodeURIComponent(categoryId)}/attributes`);
  }
  async costs(price: number, categoryId: string, listingTypeId: string, shipping?: { free: boolean; dimensions?: string; logisticType?: string }): Promise<Costs> {
    if (isMock) {
      const premium = listingTypeId === 'gold_pro';
      return { saleFee: price * 0.14, fixedFee: price < 33000 ? 1200 : 0, financing: premium ? price * 0.09 : 0, shipping: shipping?.free ? 4200 : 0, other: 0, unknown: [] };
    }
    const fees = await this.request<any>(`/sites/MLA/listing_prices?price=${price}&category_id=${encodeURIComponent(categoryId)}&listing_type_id=${encodeURIComponent(listingTypeId)}`);
    const detail = fees.sale_fee_details ?? {};
    let shippingCost = 0; const unknown: string[] = [];
    if (shipping?.free) {
      const me = await this.me();
      if (me && shipping.dimensions && shipping.logisticType) {
        const q = new URLSearchParams({ dimensions: shipping.dimensions, verbose: 'true', item_price: String(price), listing_type_id: listingTypeId, mode: 'me2', condition: 'new', logistic_type: shipping.logisticType });
        const quote = await this.request<any>(`/users/${me.id}/shipping_options/free?${q}`);
        shippingCost = Number(quote.coverage?.all_country?.list_cost ?? quote.list_cost ?? 0);
        if (!shippingCost) unknown.push('El costo de envío no pudo determinarse con certeza');
      } else unknown.push('Faltan dimensiones/logistic_type para cotizar el envío');
    }
    const totalSaleFee = Number(fees.sale_fee_amount ?? detail.gross_amount ?? 0);
    const financing = Number(detail.financing_add_on_fee ?? 0);
    const fixedFee = Number(detail.fixed_fee ?? 0);
    return { saleFee: Math.max(0, totalSaleFee - financing - fixedFee), fixedFee, financing, shipping: shippingCost, other: Number(fees.listing_fee_amount ?? 0), unknown };
  }
  async uploadPicture(source: string): Promise<{ id?: string; source?: string }> {
    if (isMock) return { id: `MOCK-${Buffer.from(source).toString('base64url').slice(0, 12)}` };
    if (/^https:\/\//.test(source)) return { source };
    const match = source.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
    if (match) {
      const token = await this.oauth.accessToken();
      if (!token) throw new Error('Cuenta de Mercado Libre no conectada. Abrí /oauth/meli/start.');
      const mimeSource = match[1]!;
      const payload = match[2]!;
      const mime = mimeSource.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeSource.toLowerCase();
      const bytes = Buffer.from(payload, 'base64');
      const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const boundary = `----meli-chatgpt-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
      const head = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="picture.${extension}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`,
        'utf8'
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
      const multipart = Buffer.concat([head, bytes, tail]);
      const response = await fetch(`${API}/pictures/items/upload`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          accept: 'application/json',
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': String(multipart.length)
        },
        body: multipart
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Mercado Libre picture upload ${response.status}: ${JSON.stringify(body)}`);
      const id = body.id ?? body.variations?.[0]?.id;
      if (!id) throw new Error(`Mercado Libre no devolvió id de imagen: ${JSON.stringify(body)}`);
      return { id: String(id) };
    }
    throw new Error('La imagen debe ser una URL HTTPS o un data URL base64 (jpeg/png/webp).');
  }
  async createListing(draft: ListingDraft) {
    if (isMock) return { id: 'MLA-MOCK-NOT-PUBLISHED', status: 'mock', permalink: null };
    const pictures = await Promise.all(draft.pictures.map((p) => p.id ? p : this.uploadPicture(String(p.source ?? ''))));
    const { description, ...item } = { ...draft, pictures };
    (item as Record<string, unknown>).condition = 'new';
    const me = await this.me();
    if (me?.tags?.includes('user_product_seller')) {
      item.family_name = item.family_name ?? item.title;
      delete (item as Record<string, unknown>).title;
    }
    const created = await this.request<any>('/items', { method: 'POST', body: JSON.stringify(item) });
    if (description?.plain_text && created.id) await this.request(`/items/${encodeURIComponent(created.id)}/description`, { method: 'POST', body: JSON.stringify(description) });
    return created;
  }
  async updateListing(id: string, patch: Record<string, unknown>) {
    if (isMock) return { id, status: 'mock-updated', patch };
    const imageUrl = typeof patch.reprocess_picture_url === 'string' ? patch.reprocess_picture_url : null;
    if (imageUrl) {
      if (!imageUrl.startsWith('https://')) throw new Error('reprocess_picture_url debe usar HTTPS.');
      const response = await fetch(imageUrl, { headers: { accept: 'image/*' } });
      if (!response.ok) throw new Error(`No se pudo descargar la imagen (${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const square = await sharp(bytes, { failOn: 'none' })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'contain', background: '#ffffff', withoutEnlargement: false })
        .jpeg({ quality: 92, chromaSubsampling: '4:2:0' })
        .toBuffer();
      const uploaded = await this.uploadPicture(`data:image/jpeg;base64,${square.toString('base64')}`);
      if (!uploaded.id) throw new Error('Mercado Libre no devolvió id para la imagen reprocesada.');
      patch = { ...patch, pictures: [{ id: uploaded.id }] };
      delete patch.reprocess_picture_url;
    }
    return this.request<any>(`/items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
  }
  async getListing(id: string) { return isMock ? { id, title: 'Publicación mock', status: 'active', price: 25000 } : this.request<any>(`/items/${encodeURIComponent(id)}`); }
  async listMine(status?: string) {
    if (isMock) return [{ id: 'MLA-MOCK-1', title: 'Mantel mock', status: status ?? 'active', price: 25000 }];
    const me = await this.me(); if (!me) throw new Error('Cuenta no conectada');
    const ids = await this.request<{ results: string[] }>(`/users/${me.id}/items/search${status ? `?status=${encodeURIComponent(status)}` : ''}`);
    if (!ids.results.length) return [];
    const rows = await this.request<any[]>(`/items?ids=${ids.results.slice(0, 20).join(',')}`);
    return rows.map((x) => x.body ?? x);
  }
}

function mockComparables(): Comparable[] {
  return [18900, 21500, 22990, 24500, 25990, 27900, 31000].map((price, i) => ({ id: `MLA-MOCK-${i + 1}`, title: i === 0 ? 'Mantel Rectangular Antimanchas 140x180 Cm' : `Mantel Rectangular Estampado Antimanchas 140 X 180 Cm ${i + 1}`, price, permalink: `https://articulo.mercadolibre.com.ar/MLA-MOCK-${i + 1}`, categoryId: 'MLA436287', condition: 'new', listingTypeId: i % 2 ? 'gold_pro' : 'gold_special', freeShipping: price > 25000, installments: i % 2 ? 6 : null, soldQuantity: [3, 18, 42, 8, 60, 25, 2][i], sellerReputation: '5_green', relevanceScore: 0 }));
}
