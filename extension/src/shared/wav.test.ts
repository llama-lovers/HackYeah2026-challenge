import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav16, downsample } from './wav.ts';
test('encodes complete 16 kHz mono PCM16 WAV header', () => {
  const buffer = encodeWav16(new Float32Array([0, 0.5, -0.5]), 16000);
  assert.equal(buffer.byteLength, 50);
  const view = new DataView(buffer);
  const text = (offset: number, length: number) => new TextDecoder().decode(new Uint8Array(buffer, offset, length));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(view.getUint32(4, true), 42);
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(text(12, 4), 'fmt ');
  assert.equal(view.getUint32(16, true), 16);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(28, true), 32000);
  assert.equal(view.getUint16(32, true), 2);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(text(36, 4), 'data');
  assert.equal(view.getUint32(40, true), 6);
});
test('clamps out of range WAV samples and encodes silence', () => {
  const buffer = encodeWav16(new Float32Array([1.5, -1.5, 0]), 16000);
  assert.equal(buffer.byteLength, 50);
  const view = new DataView(buffer);
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
  assert.equal(view.getInt16(48, true), 0);
});
test('downsamples 48000 to 16000 by block averaging', () => {
  const samples = new Float32Array(4800).fill(0.5);
  const result = downsample(samples, 48000, 16000);
  assert.equal(result.length, 1600);
  assert(result.every(sample => sample === 0.5));
  assert.deepEqual(downsample(new Float32Array([0, 0.3, 0.6, 0, 0.3, 0.6]), 48000, 16000), new Float32Array([0.3, 0.3]));
});
test('equal rate and empty buffers preserve sample lengths', () => {
  const samples = new Float32Array([0.5, -0.5]);
  assert.equal(downsample(samples, 16000, 16000).length, 2);
  assert.equal(downsample(new Float32Array(), 48000, 16000).length, 0);
  assert.equal(encodeWav16(new Float32Array(), 16000).byteLength, 44);
});
