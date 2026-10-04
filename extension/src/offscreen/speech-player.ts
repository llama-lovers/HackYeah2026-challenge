export type SpeechResult = { ok: true } | { ok: false; cancelled?: true };
type Job = { text: string; abort: AbortController; resolve: (result: SpeechResult) => void };

// One active utterance and a bounded queue. Stopping releases callers immediately,
// even when an old synthesizer ignores its aborted request.
export class SpeechPlayer<T> {
  private queue: Job[] = [];
  private active: Job | undefined;
  private synthesize: (text: string, signal: AbortSignal) => Promise<T>;
  private play: (audio: T, signal: AbortSignal) => Promise<void | SpeechResult>;
  constructor(synthesize: (text: string, signal: AbortSignal) => Promise<T>, play: (audio: T, signal: AbortSignal) => Promise<void | SpeechResult>) {
    this.synthesize = synthesize; this.play = play;
  }
  speak(text: string): Promise<SpeechResult> {
    if (!text.trim() || text.length > 4000 || this.queue.length + (this.active ? 1 : 0) >= 16) return Promise.resolve({ ok: false });
    return new Promise(resolve => {
      this.queue.push({ text, abort: new AbortController(), resolve });
      this.next();
    });
  }
  stop(): void {
    const jobs = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = undefined; this.queue = [];
    for (const job of jobs) { job.abort.abort(); job.resolve({ ok: false, cancelled: true }); }
  }
  private next(): void {
    if (this.active) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    void this.run(job);
  }
  private async run(job: Job): Promise<void> {
    try {
      const audio = await this.synthesize(job.text, job.abort.signal);
      if (job.abort.signal.aborted || this.active !== job) return;
      const result = await this.play(audio, job.abort.signal);
      if (!job.abort.signal.aborted) job.resolve(result ?? { ok: true });
    } catch {
      if (!job.abort.signal.aborted) job.resolve({ ok: false });
    } finally {
      if (this.active === job) { this.active = undefined; this.next(); }
    }
  }
}
