// Pure helpers for matching live-region announcements that belong to the current turn rather than to earlier ones.
// A mark beyond the log length means the document was replaced (the log restarted), so the whole log is new.
export const entriesSince = (log, mark) => log.slice(mark !== undefined && mark <= log.length ? mark : 0);
export function matchesSince(log, mark, expected) {
  const entries = entriesSince(log, mark);
  return typeof expected === 'function' ? expected(entries) : entries.includes(expected);
}
