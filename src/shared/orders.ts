const FINISHED = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced', 'done_for_day']);

export const isOpenOrder = (order: { status: string }) => !FINISHED.has(order.status);
