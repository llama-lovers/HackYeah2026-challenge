import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
// Missing implementation behaves like the existing recorder: it never stops for silence.
const create = existsSync(new URL('./silence.ts', import.meta.url))
  ? (await import('./silence.ts')).createSilenceDetector
  : () => ({ sample: (_time: number, _rms: number) => false, state: 'waiting_for_speech' });
test('speech-gated trailing silence finalizes exactly once at the configured window', () => {
  const detector = create({ onsetMs: 100, trailingMs: 1200, threshold: 0.02 });
  assert.equal(detector.sample(0, 0.1), false);
  assert.equal(detector.sample(100, 0.1), false);
  assert.equal(detector.sample(200, 0), false);
  assert.equal(detector.sample(1399, 0), false);
  assert.equal(detector.sample(1400, 0), true);
  assert.equal(detector.sample(1500, 0), false);
});
test('initial quiet and brief onset hesitation do not finish a capture', () => {
  const detector = create({ onsetMs: 100, trailingMs: 1200, threshold: 0.02 });
  for (const [time, rms] of [[0, 0], [5000, 0], [5100, 0.1], [5150, 0], [10000, 0]]) assert.equal(detector.sample(time!, rms!), false);
  assert.equal(detector.state, 'waiting_for_speech');
});
test('sustained sound and resumed speech reset trailing silence; timing can be tuned', () => {
  const detector = create({ onsetMs: 100, trailingMs: 300, threshold: 0.02 });
  for (const [time, rms] of [[0, 0.1], [100, 0.1], [24900, 0.1], [24950, 0], [24999, 0.1], [25000, 0]]) assert.equal(detector.sample(time!, rms!), false);
  assert.equal(detector.sample(25299, 0), false);
  assert.equal(detector.sample(25300, 0), true);
});
test('nonfinite samples and backward timestamps cannot advance silence', () => {
  const detector = create({ onsetMs: 100, trailingMs: 300, threshold: 0.02 });
  detector.sample(0, 0.1); detector.sample(100, 0.1); detector.sample(200, 0);
  assert.equal(detector.sample(Infinity, 0), false);
  assert.equal(detector.sample(600, NaN), false);
  assert.equal(detector.sample(150, 0), false);
  assert.equal(detector.sample(500, 0), true);
});
