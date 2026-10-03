import type { Snapshot, PageDiff } from './snapshot-format.ts';
// API declaration for the intentional RED phase; replaced in GREEN.
export function diffSnapshots(_before: Snapshot, _after: Snapshot): PageDiff { return { added: [], removed: [], changed: [], alerts: [] }; }
export function isEmptyDiff(_diff: PageDiff): boolean { return true; }
