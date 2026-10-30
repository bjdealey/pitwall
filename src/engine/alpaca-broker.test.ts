import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { atET } from '../shared/et.ts';
import { AlpacaBroker } from './alpaca-broker.ts';

const broker = new AlpacaBroker({ keyId: 'test-key', secretKey: 'test-secret', live: false });
const reply = (status: number, body: unknown) => mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status }));

test('account and positions parse from Alpaca strings into numbers', async (t) => {
  t.after(() => mock.restoreAll());
  reply(200, { equity: '50412.08', last_equity: '50000', buying_power: '100000', cash: '20000.5', status: 'ACTIVE' });
  assert.deepEqual(await broker.getAccount(), { equity: 50412.08, lastEquity: 50000, buyingPower: 100000, cash: 20000.5 });

  mock.restoreAll();
  reply(200, [{ symbol: 'SPY', qty: '10', avg_entry_price: '500', current_price: '505', unrealized_pl: '50', unrealized_plpc: '0.01' }]);
  assert.deepEqual(await broker.getPositions(), [{ symbol: 'SPY', qty: 10, avgEntryPrice: 500, lastPrice: 505, unrealizedPl: 50, unrealizedPlPct: 1 }]);
});

test('orders use the paper endpoint and keep the client order id', async (t) => {
  t.after(() => mock.restoreAll());
  const fetchMock = reply(200, [
    {
      id: 'o1',
      client_order_id: 'sma-cross-spy-1760000000000',
      symbol: 'SPY',
      side: 'buy',
      qty: '10',
      type: 'market',
      status: 'filled',
      filled_qty: '10',
      filled_avg_price: '501.25',
      created_at: '2026-10-12T14:00:00.000000Z',
      submitted_at: '2026-10-12T14:00:00.100000Z',
      updated_at: '2026-10-12T14:00:01Z',
    },
  ]);
  const [order] = await broker.listOrdersSince('2026-10-12T04:00:00.000Z');
  assert.equal(String(fetchMock.mock.calls[0]?.arguments[0]).startsWith('https://paper-api.alpaca.markets/v2/orders?'), true);
  assert.deepEqual(order, {
    id: 'o1',
    clientOrderId: 'sma-cross-spy-1760000000000',
    symbol: 'SPY',
    side: 'buy',
    qty: 10,
    type: 'market',
    status: 'filled',
    filledQty: 10,
    filledAvgPrice: 501.25,
    submittedAt: '2026-10-12T14:00:00.100Z',
    updatedAt: '2026-10-12T14:00:01.000Z',
  });
});

test('a refused order comes back as a rejected order', async (t) => {
  t.after(() => mock.restoreAll());
  reply(403, { code: 40310000, message: 'insufficient buying power' });
  const order = await broker.submitOrder({ symbol: 'SPY', side: 'buy', qty: 10, clientOrderId: 'sma-cross-spy-1' });
  assert.deepEqual([order.status, order.filledQty, order.clientOrderId], ['rejected', 0, 'sma-cross-spy-1']);
});

test('other broker failures throw with the broker message', async (t) => {
  t.after(() => mock.restoreAll());
  reply(500, { message: 'internal error' });
  await assert.rejects(broker.getClock(), /Alpaca 500 on GET \/v2\/clock: internal error/);
});

test('the clock opens the session at 09:30 ET on an early close too', async (t) => {
  t.after(() => mock.restoreAll());
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-27T15:00:00Z') });
  reply(200, { is_open: true, next_open: '2026-11-30T09:30:00-05:00', next_close: '2026-11-27T13:00:00-05:00' });
  const clock = await broker.getClock();
  assert.equal(clock.sessionOpen, atET(new Date(), '09:30'));
  assert.equal(clock.sessionOpen, '2026-11-27T14:30:00.000Z');
  assert.equal(clock.nextClose, '2026-11-27T18:00:00.000Z');
});
