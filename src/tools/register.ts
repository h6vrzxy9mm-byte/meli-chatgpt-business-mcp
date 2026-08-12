import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import type { ListingDraft, ListingType } from '../types/index.js';
import { MercadoLibreClient } from '../mercadolibre/client.js';
import { analyzePrices, filterComparables } from '../services/comparison-engine.js';
import { estimate, priceForTargetNet } from '../services/net-price-calculator.js';

const ok = (value: unknown) => {
  const structuredContent = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { result: value };
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }], structuredContent };
};
const confirm = (confirmed: boolean, word: string) => {
  if (confirmed !== true || word !== 'PUBLICAR') throw new Error('Operación bloqueada: se requiere confirmed=true y confirmation_word="PUBLICAR" escrito explícitamente por la usuaria.');
};
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false };
const productSchema = {
  product_name: z.string().min(3), measurements: z.string().optional(), material: z.string().optional(), characteristics: z.string().optional(), keywords: z.array(z.string()).default([])
};

export function registerTools(server: McpServer, client: MercadoLibreClient) {
  server.registerTool('meli_auth_status', { description: 'Verifica la cuenta Mercado Libre conectada. No devuelve tokens.', annotations: readOnly }, async () => {
    const me = await client.me(); return ok(me ? { connected: true, seller_id: me.id, nickname: me.nickname } : { connected: false });
  });

  server.registerTool('meli_upload_picture', {
    description: 'Sube una imagen de ChatGPT directamente a Mercado Libre sin hacerla pública. Recibe base64 puro y devuelve el picture_id para usar en un borrador.',
    inputSchema: {
      filename: z.string().min(1),
      mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      content_base64: z.string().min(16)
    },
    annotations: readOnly
  }, async ({ filename, mime_type, content_base64 }) => {
    const clean = content_base64.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i, '').replace(/\s+/g, '');
    const bytes = Buffer.from(clean, 'base64');
    if (!bytes.length) throw new Error('La imagen está vacía o el base64 es inválido.');
    if (bytes.length > 10 * 1024 * 1024) throw new Error('La imagen supera 10 MB.');
    const normalizedMime = mime_type === 'image/jpeg' ? 'image/jpeg' : mime_type;
    const uploaded = await client.uploadPicture(`data:${normalizedMime};base64,${clean}`);
    return ok({ filename, bytes: bytes.length, picture_id: uploaded.id, source: uploaded.source ?? null });
  });

  server.registerTool('meli_search_similar_products', { description: 'Busca publicaciones MLA activas y excluye comparables irrelevantes por tipo, medidas, material y packs.', inputSchema: productSchema, annotations: readOnly }, async (args) => {
    const query = [args.product_name, args.measurements, args.material, ...args.keywords].filter(Boolean).join(' ');
    const rows = filterComparables(await client.search(query), { productName: args.product_name, measurements: args.measurements, material: args.material, characteristics: args.characteristics, keywords: args.keywords });
    return ok({ query, site_id: 'MLA', count: rows.length, comparables: rows });
  });

  server.registerTool('meli_price_analysis', { description: 'Analiza varios comparables relevantes y recomienda precios sin elegir solo el más barato.', inputSchema: { comparables: z.array(z.object({ id: z.string(), title: z.string(), price: z.number().positive(), relevanceScore: z.number().default(1), soldQuantity: z.number().optional() })).min(3) }, annotations: readOnly }, async ({ comparables }) => ok(analyzePrices(comparables)));

  server.registerTool('meli_get_category', { description: 'Predice la categoría MLA oficial a partir del título.', inputSchema: { title: z.string().min(3) }, annotations: readOnly }, async ({ title }) => ok(await client.predictCategory(title)));

  server.registerTool('meli_get_required_attributes', { description: 'Consulta atributos de la categoría y detecta obligatorios faltantes.', inputSchema: { category_id: z.string(), provided_attributes: z.array(z.object({ id: z.string(), value_name: z.string().optional(), value_id: z.string().optional() })).default([]) }, annotations: readOnly }, async ({ category_id, provided_attributes }) => {
    const all = await client.categoryAttributes(category_id);
    const required = all.filter((a: any) => a.tags?.required || a.tags?.catalog_required || a.tags?.conditional_required);
    const supplied = new Set(provided_attributes.filter((x) => x.value_id || x.value_name).map((x) => x.id));
    return ok({ category_id, required, missing: required.filter((a: any) => !supplied.has(a.id)).map((a: any) => ({ id: a.id, name: a.name, values: a.values })) });
  });

  const estimateInput = { price: z.number().positive(), category_id: z.string(), listing_type_id: z.enum(['gold_special', 'gold_pro']), free_shipping: z.boolean().default(false), dimensions: z.string().optional(), logistic_type: z.string().optional(), product_cost: z.number().nonnegative().optional(), other_costs: z.number().nonnegative().default(0) };
  server.registerTool('meli_estimate_sale', { description: 'Calcula cargos oficiales consultables, neto visible, ganancia y margen. Seññala costos inciertos.', inputSchema: estimateInput, annotations: readOnly }, async (a) => {
    const costs = await client.costs(a.price, a.category_id, a.listing_type_id, { free: a.free_shipping, dimensions: a.dimensions, logisticType: a.logistic_type }); costs.other += a.other_costs;
    const e = estimate(a.price, costs, a.product_cost);
    return ok({ ...e, summary: { 'Precio publicado': e.publishedPrice, 'Cargos Mercado Libre': costs.saleFee + costs.fixedFee, 'Envío a cargo vendedor': costs.shipping, 'Costo financiero': costs.financing, 'Otros cargos': costs.other, 'NETO ESTIMADO A COBRAR': e.net }, warnings: costs.unknown });
  });

  server.registerTool('meli_generate_price_variants', { description: 'Calcula base, cuotas, envío gratis y ambos para conservar el mismo neto, siempre redondeando hacia arriba.', inputSchema: { base_price: z.number().positive(), category_id: z.string(), dimensions: z.string().optional(), logistic_type: z.string().optional() }, annotations: readOnly }, async (a) => {
    const baseCosts = await client.costs(a.base_price, a.category_id, 'gold_special', { free: false });
    const target = estimate(a.base_price, baseCosts).net;
    const variants = await Promise.all([
      ['base', 'gold_special', false], ['installments', 'gold_pro', false], ['free_shipping', 'gold_special', true], ['installments_and_shipping', 'gold_pro', true]
    ].map(async ([name, listing, free]) => ({ name, ...(await priceForTargetNet(target, (p) => client.costs(p, a.category_id, listing as ListingType, { free: Boolean(free), dimensions: a.dimensions, logisticType: a.logistic_type }))) })));
    return ok({ target_net: target, rule: 'Cada neto es igual o mayor al objetivo; nunca menor.', variants });
  });

  const draftSchema = {
    title: z.string().min(3).max(200), category_id: z.string(), price: z.number().positive(), stock: z.number().int().positive(), listing_type_id: z.enum(['gold_special', 'gold_pro']), free_shipping: z.boolean().default(false),
    pictures: z.array(z.string().min(1)).default([]), picture_ids: z.array(z.string().min(1)).default([]),
    attributes: z.array(z.object({ id: z.string(), value_name: z.string().optional(), value_id: z.string().optional() })).default([]), description: z.string().optional(), family_name: z.string().optional(), product_cost: z.number().nonnegative().optional(), dimensions: z.string().optional(), logistic_type: z.string().optional()
  };
  server.registerTool('meli_prepare_listing', { description: 'Genera una vista previa completa BORRADOR - NO PUBLICADO y valida atributos/costos. Puede usar picture_ids devueltos por meli_upload_picture o URLs HTTPS en pictures.', inputSchema: draftSchema, annotations: readOnly }, async (a) => {
    if (!a.pictures.length && !a.picture_ids.length) throw new Error('Se requiere al menos una imagen: pictures o picture_ids.');
    const attrs = await client.categoryAttributes(a.category_id); const supplied = new Set(a.attributes.filter((x) => x.value_id || x.value_name).map((x) => x.id));
    const missing = attrs.filter((x: any) => (x.tags?.required || x.tags?.catalog_required) && !supplied.has(x.id)).map((x: any) => ({ id: x.id, name: x.name }));
    const costs = await client.costs(a.price, a.category_id, a.listing_type_id, { free: a.free_shipping, dimensions: a.dimensions, logisticType: a.logistic_type });
    const sale = estimate(a.price, costs, a.product_cost);
    const draft: ListingDraft = { title: a.title, family_name: a.family_name, category_id: a.category_id, price: a.price, currency_id: 'ARS', available_quantity: a.stock, buying_mode: 'buy_it_now', listing_type_id: a.listing_type_id, attributes: a.attributes, pictures: [...a.picture_ids.map((id) => ({ id })), ...a.pictures.map((source) => ({ source }))], shipping: { mode: 'me2', free_shipping: a.free_shipping }, description: a.description ? { plain_text: a.description } : undefined };
    return ok({ status: 'BORRADOR - NO PUBLICADO', can_publish: missing.length === 0 && costs.unknown.length === 0, missing_required_attributes: missing, warnings: costs.unknown, draft, summary: { 'PRECIO QUE VE EL COMPRADOR': sale.publishedPrice, 'TOTAL DE CARGOS ESTIMADOS': sale.totalCharges, 'NETO ESTIMADO QUE COBRÁS': sale.net, 'GANANCIA ESTIMADA': sale.profit, 'MARGEN %': sale.marginPercent, ESTADO: 'BORRADOR - NO PUBLICADO' } });
  });

  server.registerTool('meli_create_listing', { description: 'PUBLICA realmente. Bloqueada salvo confirmed=true y palabra PUBLICAR. Usar solo tras vista previa.', inputSchema: { draft: z.object({ title: z.string(), category_id: z.string(), price: z.number(), currency_id: z.literal('ARS'), available_quantity: z.number().int(), buying_mode: z.literal('buy_it_now'), listing_type_id: z.enum(['gold_special', 'gold_pro']), attributes: z.array(z.any()), pictures: z.array(z.any()), shipping: z.any(), description: z.any().optional(), family_name: z.string().optional() }), confirmed: z.boolean(), confirmation_word: z.string() }, annotations: destructive }, async ({ draft, confirmed, confirmation_word }) => { confirm(confirmed, confirmation_word); return ok(await client.createListing(draft as ListingDraft)); });

  server.registerTool('meli_update_listing', { description: 'Actualiza precio, stock, atributos o estado. Siempre exige PUBLICAR.', inputSchema: { item_id: z.string(), changes: z.record(z.unknown()), confirmed: z.boolean(), confirmation_word: z.string() }, annotations: destructive }, async ({ item_id, changes, confirmed, confirmation_word }) => { confirm(confirmed, confirmation_word); return ok(await client.updateListing(item_id, changes)); });
  server.registerTool('meli_pause_listing', { description: 'Pausa una publicación propia. Siempre exige PUBLICAR.', inputSchema: { item_id: z.string(), confirmed: z.boolean(), confirmation_word: z.string() }, annotations: destructive }, async ({ item_id, confirmed, confirmation_word }) => { confirm(confirmed, confirmation_word); return ok(await client.updateListing(item_id, { status: 'paused' })); });
  server.registerTool('meli_get_listing', { description: 'Consulta una publicación propia.', inputSchema: { item_id: z.string() }, annotations: readOnly }, async ({ item_id }) => ok(await client.getListing(item_id)));
  server.registerTool('meli_list_my_listings', { description: 'Lista publicaciones del vendedor conectado.', inputSchema: { status: z.enum(['active', 'paused', 'closed']).optional() }, annotations: readOnly }, async ({ status }) => ok(await client.listMine(status)));

  server.registerTool('meli_process_excel', { description: 'Lee Excel XLSX base64, normaliza columnas opcionales y devuelve borradores; nunca publica.', inputSchema: { filename: z.string(), content_base64: z.string() }, annotations: readOnly }, async ({ filename, content_base64 }) => {
    if (!filename.toLowerCase().endsWith('.xlsx')) throw new Error('Solo se admite .xlsx');
    const bytes = Buffer.from(content_base64, 'base64'); if (bytes.length > 10 * 1024 * 1024) throw new Error('El Excel supera 10 MB');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer); const sheet = workbook.worksheets[0]; if (!sheet) throw new Error('Excel sin hojas');
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((x) => String(x ?? '').trim());
    const rows: Record<string, unknown>[] = []; sheet.eachRow((row, number) => { if (number === 1) return; const values = (row.values as unknown[]).slice(1); const record: Record<string, unknown> = {}; headers.forEach((h, i) => { record[h] = values[i] ?? ''; }); rows.push(record); });
    const aliases: Record<string, string> = { sku: 'sku', producto: 'product', descripcion: 'description', medida: 'measurements', material: 'material', color: 'color', stock: 'stock', costo: 'cost', 'precio deseado': 'desired_price', marca: 'brand', imagen: 'image' };
    const products = rows.map((row, index) => { const normalized: Record<string, unknown> = { row: index + 2 }; for (const [key, value] of Object.entries(row)) normalized[aliases[key.toLowerCase().trim()] ?? key] = value; const missing = ['product', 'stock'].filter((k) => !normalized[k]); return { ...normalized, missing }; });
    return ok({ status: 'BORRADORES - NO PUBLICADOS', sheet: sheet.name, count: products.length, products, confirmation_required_before_any_bulk_publish: true });
  });
}
