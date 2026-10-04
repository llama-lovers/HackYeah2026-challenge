import test from 'node:test';
import assert from 'node:assert/strict';
import { EARCON_PATTERNS, playEarcon, cancelEarcons } from './earcons.ts';
const contexts: FakeContext[] = [];
let holdResume: (() => Promise<void>) | undefined;
class Param { values: number[] = []; setValueAtTime(value: number, _time: number) { this.values.push(value); } linearRampToValueAtTime(value: number, _time: number) { this.values.push(value); } }
class Node { disconnected = false; connect(_to: unknown) {} disconnect() { this.disconnected = true; } }
class Tone extends Node { frequency = new Param(); type = ''; onended: (() => void) | null = null; started = false; ends: number[] = []; start(_time: number) { this.started = true; } stop(time?: number) { this.ends.push(time ?? 0); } }
class Gain extends Node { gain = new Param(); }
class FakeContext { currentTime = 0; destination = {}; closed = false; tones: Tone[] = []; gains: Gain[] = []; constructor() { contexts.push(this); } resume() { return holdResume?.() ?? Promise.resolve(); } async close() { this.closed = true; } createOscillator() { const tone = new Tone(); this.tones.push(tone); return tone; } createGain() { const gain = new Gain(); this.gains.push(gain); return gain; } }
Object.assign(globalThis, { AudioContext: FakeContext });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('five lifecycle cues have distinct bounded contour and rhythm signatures', () => {
  const patterns = Object.values(EARCON_PATTERNS);
  assert.equal(patterns.length, 5);
  assert.equal(new Set(patterns.map(p => JSON.stringify(p))).size, 5);
  assert.equal(new Set(patterns.map(p => JSON.stringify(p.map(n => [n.at, n.duration, Math.sign(n.to - n.from)])))).size, 5);
  for (const pattern of patterns) { const end = Math.max(...pattern.map(n => n.at + n.duration)); assert(end >= 0.08 && end <= 0.3); }
});
test('mic cues have distinct finite timelines and disconnect every source on completion', async () => {
  assert.notDeepEqual(EARCON_PATTERNS.mic_open, EARCON_PATTERNS.mic_close);
  for (const kind of ['mic_open', 'mic_close'] as const) {
    const played = playEarcon(kind, 'turn'); await tick();
    const context = contexts.at(-1)!;
    assert(context.tones.every(t => t.started && t.ends[0]! > 0 && t.ends[0]! <= 0.305));
    assert(context.gains.every(g => Math.max(...g.gain.values) <= 0.08 && g.gain.values.at(-1) === 0));
    for (const tone of context.tones) tone.onended?.();
    assert.equal(await played, 'played'); assert(context.closed);
    assert(context.tones.every(t => t.disconnected)); assert(context.gains.every(g => g.disconnected));
  }
});
test('cancel settles playing and queued tones without late resurrection after resume', async () => {
  let resume!: () => void;
  holdResume = () => new Promise(resolve => { resume = resolve; });
  const first = playEarcon('mic_open', 'old'), queued = playEarcon('mic_close', 'old'); await tick();
  const context = contexts.at(-1)!;
  cancelEarcons('old'); assert.equal(await first, 'cancelled'); assert.equal(await queued, 'cancelled');
  resume(); holdResume = undefined; await tick();
  assert(context.closed); assert.equal(context.tones.length, 0);
  const next = playEarcon('mic_open', 'new'); await tick(); cancelEarcons(); assert.equal(await next, 'cancelled');
  assert(contexts.at(-1)!.tones.every(t => t.disconnected));
});
