import type { Order } from './domain.ts';

const FINISHED = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced', 'done_for_day']);

export const isOpenOrder = (order: { status: string }) => !FINISHED.has(order.status);

// Quote a cell when it holds a comma, quote or line break, and defuse text a spreadsheet would run as a formula.
const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Orders as CSV for a spreadsheet: a header row, then one row per order in the order given, times in UTC ISO 8601. */
export const ordersCsv = (orders: Order[]) =>
  [
    ['Submitted (UTC)', 'Symbol', 'Side', 'Qty', 'Type', 'Status', 'Filled', 'Avg fill', 'Strategy'],
    ...orders.map((o) => [o.submittedAt, o.symbol, o.side, o.qty, o.type, o.status, o.filledQty, o.filledAvgPrice, o.strategyId ?? 'manual']),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n') + '\r\n';
