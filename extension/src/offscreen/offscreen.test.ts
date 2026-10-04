import test from 'node:test';
import assert from 'node:assert/strict';

const g = globalThis as any;
g.__PROXY_URL__ = 'http://localhost:8787';
g.__E2E__ = false;
g.__AUDIO_FORMAT__ = 'webm';
let listener: (message: any, sender: any) => void;
const events: any[] = [];
let acquire: () => Promise<any>;
let recorder: any;
let recorderCount = 0;
let stoppedTracks = 0;
const stream = { getTracks: () => [{ stop: () => { stoppedTracks++; } }] };
g.chrome = { runtime: {
  id: 'test',
  onMessage: { addListener: (fn: typeof listener) => { listener = fn; } },
  sendMessage: async (event: any) => { events.push(event); },
} };
Object.defineProperty(g, 'navigator', { configurable: true, value: {
  mediaDevices: { getUserMedia: () => acquire() },
} });
g.MediaRecorder = class {
  state = 'inactive';
  onstart?: () => void;
  onstop?: () => void;
  ondataavailable?: (event: any) => void;
  constructor() { recorder = this; recorderCount++; }
  start() { this.state = 'recording'; queueMicrotask(() => this.onstart?.()); }
  stop() { this.state = 'inactive'; /* Deliberately delay the browser's stop event. */ }
};
await import('./offscreen.ts');
const dispatch = (type: string, turnId: string) => listener({ target: 'offscreen', type, turnId }, { id: 'test' });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('stop releases microphone before recorder stop event; rapid stop during opening never records', async () => {
  acquire = async () => stream;
  dispatch('REC_START', 'recording');
  await flush();
  assert.equal(events.at(-1).type, 'MIC_OPEN');
  dispatch('REC_STOP', 'recording');
  assert.equal(recorder.state, 'inactive');
  assert.equal(stoppedTracks, 1);
  assert.equal(events.at(-1).type, 'REC_STOPPED');
  await recorder.onstop();
  assert.equal(events.filter(e => e.type === 'REC_STOPPED').length, 1);

  events.length = 0;
  let resolveMic!: (value: any) => void;
  acquire = () => new Promise(resolve => { resolveMic = resolve; });
  dispatch('REC_START', 'opening');
  dispatch('REC_STOP', 'opening');
  resolveMic(stream);
  await flush();
  assert.equal(recorderCount, 1, 'cancelled acquisition must not start MediaRecorder');
  assert.equal(stoppedTracks, 2);
  assert.deepEqual(events.map(e => e.type), ['REC_STOPPED', 'TRANSCRIPT']);
  assert.equal(events.at(-1).text, '');
});
