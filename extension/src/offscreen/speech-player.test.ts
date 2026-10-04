import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer } from './speech-player.ts';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('speech plays in order with only one synthesis in flight', async () => {
  const heard: string[] = [];
  let release!: () => void;
  const player = new SpeechPlayer(async text => text, async text => {
    heard.push(text);
    if (text === 'First.') await new Promise<void>(resolve => { release = resolve; });
  });
  const first = player.speak('First.');
  const second = player.speak('Second.');
  await tick();
  assert.deepEqual(heard, ['First.']);
  release();
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
  assert.deepEqual(heard, ['First.', 'Second.']);
});

test('stop aborts synthesis and discards queued speech without playing stale audio', async () => {
  const heard: string[] = [];
  let old!: (value: string) => void;
  let aborted = false;
  const player = new SpeechPlayer((text, signal) => text === 'Old.' ? new Promise<string>(resolve => {
    old = resolve; signal.addEventListener('abort', () => { aborted = true; });
  }) : Promise.resolve(text), async text => { heard.push(text); });
  const first = player.speak('Old.');
  const queued = player.speak('Queued.');
  await tick();
  player.stop();
  assert.equal(aborted, true);
  assert.deepEqual(await Promise.all([first, queued]), [{ ok: false, cancelled: true }, { ok: false, cancelled: true }]);
  const fresh = player.speak('Fresh.');
  old('Old.');
  assert.deepEqual(await fresh, { ok: true });
  await tick();
  assert.deepEqual(heard, ['Fresh.']);
});

test('stop aborts playback and resolves waiting callers', async () => {
  let aborted = false;
  const player = new SpeechPlayer(async text => text, async (_, signal) => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }));
  });
  const result = player.speak('Speaking.');
  await tick(); player.stop();
  assert.deepEqual(await result, { ok: false, cancelled: true });
  assert.equal(aborted, true);
});

test('synthesis and playback failures do not poison the queue', async () => {
  const heard: string[] = [];
  const player = new SpeechPlayer(async text => { if (text === 'Failed.') throw new Error('private'); return text; },
    async text => { if (text === 'Unplayable.') throw new Error('private'); heard.push(text); });
  assert.deepEqual(await player.speak('Failed.'), { ok: false });
  assert.deepEqual(await player.speak('Unplayable.'), { ok: false });
  assert.deepEqual(await player.speak('Next.'), { ok: true });
  assert.deepEqual(heard, ['Next.']);
});

test('an overflowing queue refuses more speech rather than growing unbounded', async () => {
  const player = new SpeechPlayer(async text => text, async (_, signal) => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve()));
  });
  const pending = Array.from({ length: 16 }, () => player.speak('Waiting.'));
  assert.deepEqual(await player.speak('Overflow.'), { ok: false });
  player.stop(); await Promise.all(pending);
});
