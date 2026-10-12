export const ORDER_QTY = 10;

const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const spread = (closes: number[], fast: number) => mean(closes.slice(-fast)) - mean(closes);

export function decide(closes: number[], position: number, fast = 10, slow = 30): { side: 'buy' | 'sell'; qty: number } | null {
  if (closes.length < slow + 1) return null;
  const before = spread(closes.slice(-slow - 1, -1), fast);
  const after = spread(closes.slice(-slow), fast);
  if (before <= 0 && after > 0 && position === 0) return { side: 'buy', qty: ORDER_QTY };
  if (before >= 0 && after < 0 && position > 0) return { side: 'sell', qty: position };
  return null;
}
