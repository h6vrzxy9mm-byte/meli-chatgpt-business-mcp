import type { Costs, SaleEstimate } from '../types/index.js';

export function estimate(price: number, costs: Costs, productCost?: number): SaleEstimate {
  const totalCharges = costs.saleFee + costs.fixedFee + costs.financing + costs.shipping + costs.other;
  const net = price - totalCharges;
  const profit = productCost == null ? undefined : net - productCost;
  return { publishedPrice: price, costs, totalCharges, net, productCost, profit, marginPercent: profit == null || price === 0 ? undefined : (profit / price) * 100 };
}

export async function priceForTargetNet(target: number, costAt: (price: number) => Promise<Costs>): Promise<SaleEstimate> {
  let low = Math.max(0, target); let high = Math.max(1000, target * 2);
  while (estimate(high, await costAt(high)).net < target) {
    high *= 2; if (high > target * 100 + 1_000_000) throw new Error('No se pudo alcanzar el neto objetivo con los costos informados');
  }
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (estimate(mid, await costAt(mid)).net >= target) high = mid; else low = mid + 1;
  }
  return estimate(high, await costAt(high));
}
