import { describe, expect, it } from 'vitest';
import { estimate, priceForTargetNet } from '../src/services/net-price-calculator.js';
import type { Costs } from '../src/types/index.js';

const costs = (rate: number, fixed = 0, shipping = 0) => async (price: number): Promise<Costs> => ({ saleFee: price * .14, fixedFee: fixed, financing: price * rate, shipping, other: 0, unknown: [] });

describe('precios con neto objetivo', () => {
  it('todas las variantes dan 20.000 o más y la diferencia es mínima', async () => {
    const target = 20_000;
    const variants = await Promise.all([costs(0, 1200), costs(.09, 1200), costs(0, 1200, 4200), costs(.09, 1200, 4200)].map((fn) => priceForTargetNet(target, fn)));
    for (const [index, value] of variants.entries()) {
      expect(value.net).toBeGreaterThanOrEqual(target);
      const oneLess = value.publishedPrice - 1;
      expect(estimate(oneLess, await [costs(0, 1200), costs(.09, 1200), costs(0, 1200, 4200), costs(.09, 1200, 4200)][index]!(oneLess)).net).toBeLessThan(target);
      expect(value.net - target).toBeLessThan(1);
    }
  });
});
