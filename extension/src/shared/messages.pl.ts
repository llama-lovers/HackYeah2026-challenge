import type { RejectReason } from './validate.ts';
export function clickPre(_name: string): string { return ''; }
export function fillPre(_name: string): string { return ''; }
export function noChange(_kind: 'click' | 'fill', _name: string): string { return ''; }
export function effectFallback(_kind: 'click' | 'fill', _name: string): string { return ''; }
export function rejectionText(_reason: RejectReason): string { return ''; }
export function noneSay(_say: string): string { return ''; }
