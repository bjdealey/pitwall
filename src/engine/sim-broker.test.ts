import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineEnvSchema } from '../shared/env.ts';
import { gateEntry, riskExit, type RuleConfig } from './rules.ts';
import { SimBroker } from './sim-broker.ts';

const cents = (n: number) => Math.round(n * 100) / 100;

test('a buy fills at the last price and moves cash into the position', async () => {
  const broker = new SimBroker();
  const [price] = await broker.getBars('SPY', 1);
  assert.ok(price);
  const order = await broker.submitOrder({ symbol: 'SPY', side: 'buy', qty: 10, clientOrderId: 'sma-cross-spy-1' });
  assert.deepEqual([order.status, order.filledQty, order.filledAvgPrice], ['filled', 10, price]);
  const account = await broker.getAccount();
  assert.equal(cents(account.cash), cents(50_000 - 10 * price));
  assert.equal(cents(account.equity), 50_000);
  assert.deepEqual((await broker.getPositions()).map((p) => [p.symbol, p.qty]), [['SPY', 10]]);
});

test('orders the account cannot cover are rejected and change nothing', async () => {
  const broker = new SimBroker();
  const buy = await broker.submitOrder({ symbol: 'SPY', side: 'buy', qty: 1_000_000, clientOrderId: 'sma-cross-spy-1' });
  const sell = await broker.submitOrder({ symbol: 'SPY', side: 'sell', qty: 1, clientOrderId: 'sma-cross-spy-2' });
  assert.deepEqual([buy.status, sell.status], ['rejected', 'rejected']);
  assert.equal((await broker.getAccount()).cash, 50_000);
  assert.deepEqual(await broker.getPositions(), []);
});

test('close all sells every position back to cash', async () => {
  const broker = new SimBroker();
  await broker.submitOrder({ symbol: 'SPY', side: 'buy', qty: 5, clientOrderId: 'a-1' });
  await broker.submitOrder({ symbol: 'QQQ', side: 'buy', qty: 5, clientOrderId: 'b-1' });
  await broker.closeAllPositions();
  assert.deepEqual(await broker.getPositions(), []);
  assert.equal(cents((await broker.getAccount()).cash), 50_000);
});

test('prices are seeded by symbol', async () => {
  assert.deepEqual(await new SimBroker().getBars('SPY', 30), await new SimBroker().getBars('SPY', 30));
  assert.notDeepEqual(await new SimBroker().getBars('SPY', 30), await new SimBroker().getBars('QQQ', 30));
});

test('the clock rules leave the sim trading at every hour on the default config', async (t) => {
  const env = engineEnvSchema.parse({ PITWALL_BROKER: 'sim' });
  const config: RuleConfig = {
    entryDelayMin: env.PITWALL_ENTRY_DELAY_MIN,
    entryCutoffMin: env.PITWALL_ENTRY_CUTOFF_MIN,
    flatBeforeCloseMin: env.PITWALL_FLAT_BEFORE_CLOSE_MIN,
    stopPct: env.PITWALL_STOP_PCT,
    riskPct: env.PITWALL_RISK_PCT,
    maxPositionPct: env.PITWALL_MAX_POSITION_PCT,
    cashBufferPct: env.PITWALL_CASH_BUFFER_PCT,
    maxTradesPerDay: env.PITWALL_MAX_TRADES_PER_DAY,
  };
  const midnight = Date.parse('2026-10-12T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: midnight });
  const broker = new SimBroker();
  const position = { symbol: 'SPY', qty: 10, avgEntryPrice: 100, lastPrice: 100, unrealizedPl: 0, unrealizedPlPct: 0 };
  for (let hour = 0; hour < 24; hour++) {
    t.mock.timers.setTime(midnight + hour * 3_600_000);
    const now = new Date();
    const clock = await broker.getClock();
    assert.deepEqual(gateEntry({ clock, now, entriesToday: 0, lastFillAt: null, price: 100, equity: 50_000, cash: 50_000, ceiling: 10 }, config), { qty: 10 }, `entry at ${hour}:00Z`);
    assert.equal(riskExit({ kind: 'running' }, position, clock, now, config), null, `exit at ${hour}:00Z`);
  }
});
