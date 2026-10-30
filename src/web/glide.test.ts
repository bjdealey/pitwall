import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glideStep, type Box } from './glide.ts';

const box = (x: number, y: number, w = 100, h = 50): Box => ({ x, y, w, h });

test('a move the resize explains is drawn where it is laid out', () => {
  const next = glideStep(new Map([['row', box(0, 0)]]), new Map([['row', box(10, 0, 110)]]), new Map(), 10, 0, 1);
  assert.equal(next.size, 0);
});

test('a jump draws every glider where it was, the jumper and the ones that only followed the window', () => {
  const before = new Map([
    ['tower', box(0, 0, 360, 800)],
    ['board', box(376, 0, 700, 300)],
  ]);
  const after = new Map([
    ['tower', box(0, 316, 1060, 500)],
    ['board', box(0, 0, 1062, 300)],
  ]);
  const next = glideStep(before, after, new Map(), 4, 0, 1);
  assert.deepEqual(next.get('tower'), { x: 0, y: -316, w: -700, h: 300 });
  assert.deepEqual(next.get('board'), { x: 376, y: 0, w: -362, h: 0 });
});

test('an offset eases away and is dropped under half a pixel', () => {
  const laid = new Map([['row', box(0, 0)]]);
  assert.deepEqual(glideStep(laid, laid, new Map([['row', box(40, -8, 0, 0)]]), 0, 0, 0.5).get('row'), { x: 20, y: -4, w: 0, h: 0 });
  assert.equal(glideStep(laid, laid, new Map([['row', box(0.8, 0, 0, 0)]]), 0, 0, 0.5).size, 0);
});

test('with the window still, any move is a jump, like the space a faded column leaves', () => {
  const next = glideStep(new Map([['cell', box(200, 0)]]), new Map([['cell', box(120, 0)]]), new Map(), 0, 0, 1);
  assert.deepEqual(next.get('cell'), { x: 80, y: 0, w: 0, h: 0 });
});

test('text that rewraps while the window moves is not a jump', () => {
  const next = glideStep(new Map([['src', box(0, 48)]]), new Map([['src', box(0, 72)]]), new Map(), 6, 0, 1);
  assert.equal(next.size, 0);
});

test('a figure set at the right edge of its cell holds that edge when the cell widens', () => {
  const before = new Map([['last', { ...box(340, 0, 122), end: true }]]);
  const after = new Map([['last', { ...box(377, 0, 224), end: true }]]);
  const o = glideStep(before, after, new Map(), 0, 0, 1).get('last');
  assert.equal(377 + 224 + (o?.x ?? 0), 340 + 122);
});
