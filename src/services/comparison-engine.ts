import type { Comparable } from '../types/index.js';

const normalize = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[,x×]/g, ' x ').replace(/\s+/g, ' ').trim();
const tokens = (x: string) => new Set(normalize(x).split(/\W+/).filter((t) => t.length > 2));

export function filterComparables(rows: Comparable[], input: { productName: string; measurements?: string; material?: string; characteristics?: string; keywords?: string[] }): Comparable[] {
  const wanted = tokens([input.productName, input.measurements, input.material, input.characteristics, ...(input.keywords ?? [])].filter(Boolean).join(' '));
  const measurement = normalize(input.measurements ?? '').match(/\d+\s*x\s*\d+/)?.[0];
  return rows.map((row) => {
    const text = normalize(row.title); const present = tokens(text);
    let score = [...wanted].filter((t) => present.has(t)).length / Math.max(wanted.size, 1);
    if (measurement && text.includes(measurement)) score += 0.4;
    if (/redond|descartable|pack\s*[2-9]|x\s*[2-9]\s*unid/.test(text) && !normalize(input.productName).match(/redond|descartable|pack/)) score -= 0.8;
    if ((row.soldQuantity ?? 0) > 0) score += Math.min(0.15, Math.log10((row.soldQuantity ?? 0) + 1) / 10);
    return { ...row, relevanceScore: score };
  }).filter((x) => x.relevanceScore >= 0.35).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function analyzePrices(rows: Comparable[]) {
  if (rows.length < 3) throw new Error('Se necesitan al menos 3 comparables relevantes');
  const sorted = rows.map((x) => x.price).sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const weighted = rows.reduce((s, x) => s + x.price * Math.max(.1, x.relevanceScore) * (x.soldQuantity ? 1.15 : 1), 0) / rows.reduce((s, x) => s + Math.max(.1, x.relevanceScore) * (x.soldQuantity ? 1.15 : 1), 0);
  return { relevantCount: rows.length, minimum: sorted[0], maximum: sorted.at(-1), average: sorted.reduce((a, b) => a + b, 0) / sorted.length, median, competitiveRange: [Math.round(median * .94), Math.round(median * 1.08)], quickSalePrice: Math.ceil(median * .94 / 100) * 100, recommendedPrice: Math.ceil(((median * .6 + weighted * .4)) / 100) * 100, marginPrice: Math.ceil(median * 1.08 / 100) * 100, rationale: 'Se ponderaron equivalencia, medidas y ventas; no se eligió simplemente el precio más bajo.' };
}
