export type EarconKind = 'mic_open' | 'mic_close';
export type EarconResult = 'played' | 'cancelled' | 'failed';
interface Note { at: number; duration: number; from: number; to: number }
export const EARCON_PATTERNS: Readonly<Record<EarconKind, readonly Note[]>> = {
  mic_open: [{ at: 0, duration: 0.12, from: 440, to: 880 }],
  mic_close: [{ at: 0, duration: 0.16, from: 660, to: 330 }],
};
interface Job { owner: string; cancelled: boolean; settle: (result: EarconResult) => void; context?: AudioContext; sources: OscillatorNode[]; gains: GainNode[]; timer?: ReturnType<typeof setTimeout> }
const jobs = new Set<Job>();
let queue: Promise<unknown> = Promise.resolve();
function cleanup(job: Job) {
  clearTimeout(job.timer);
  for (const source of job.sources) { source.onended = null; try { source.stop(); } catch { /* ended */ } source.disconnect(); }
  for (const gain of job.gains) gain.disconnect();
  if (job.context) void job.context.close().catch(() => {});
  job.sources = []; job.gains = []; jobs.delete(job);
}
export function cancelEarcons(owner?: string): void {
  for (const job of [...jobs]) if (owner === undefined || owner === job.owner) { job.cancelled = true; cleanup(job); job.settle('cancelled'); }
}
export function playEarcon(kind: EarconKind, owner: string): Promise<EarconResult> {
  if (jobs.size >= 6) return Promise.resolve('failed');
  let resolve!: (result: EarconResult) => void, settled = false;
  const result = new Promise<EarconResult>(done => { resolve = done; });
  const job: Job = { owner, cancelled: false, sources: [], gains: [], settle(value) { if (!settled) { settled = true; resolve(value); } } };
  jobs.add(job);
  const run = async () => {
    if (job.cancelled) return;
    // A suspended/resuming context cannot leave a queued cue or dependent line waiting forever.
    job.timer = setTimeout(() => { cleanup(job); job.cancelled = true; job.settle('failed'); }, 700);
    try {
      const context = job.context = new AudioContext();
      await context.resume();
      if (job.cancelled) return;
      const start = context.currentTime + 0.005;
      const notes = EARCON_PATTERNS[kind];
      let remaining = notes.length;
      for (const note of notes) {
        const source = context.createOscillator(), gain = context.createGain();
        job.sources.push(source); job.gains.push(gain);
        const at = start + note.at, end = at + note.duration;
        source.type = 'sine'; source.frequency.setValueAtTime(note.from, at); source.frequency.linearRampToValueAtTime(note.to, end);
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.08, at + 0.008); gain.gain.linearRampToValueAtTime(0, end);
        source.connect(gain); gain.connect(context.destination);
        source.onended = () => { if (--remaining === 0) { cleanup(job); job.settle('played'); } };
        source.start(at); source.stop(end);
      }
    } catch { cleanup(job); job.settle('failed'); }
    await result;
  };
  queue = queue.then(run, run);
  return result;
}
