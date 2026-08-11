import { describe, expect, it } from 'vitest';
import { analyzePrices, filterComparables } from '../src/services/comparison-engine.js';

describe('comparables', () => {
  it('excluye redondos, descartables y packs', () => {
    const base = (title: string, price: number) => ({ id: title, title, price, relevanceScore: 0 });
    const rows = [base('Mantel rectangular antimanchas 140 x 180 cm', 20000), base('Mantel rectangular tela 140 x 180 cm', 22000), base('Mantel rectangular estampado 140 x 180 cm', 24000), base('Mantel redondo 140 cm', 10000), base('Pack 6 manteles descartables', 5000)];
    const filtered = filterComparables(rows, { productName: 'Mantel rectangular antimanchas', measurements: '140 x 180 cm', material: 'tela' });
    expect(filtered).toHaveLength(3); expect(filtered.every((x) => !/redondo|pack/i.test(x.title))).toBe(true);
    expect(analyzePrices(filtered).median).toBe(22000);
  });
});
