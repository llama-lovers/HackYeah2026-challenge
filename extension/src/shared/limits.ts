export const CONFIRM_TTL_MS = 60000;
export const MAX_REPROMPTS = 1;
export const READ_STATUS_CAP_MS = 6000;
export const RECORDING_CAP_MS = 25000;
export const MAX_STEPS_PER_COMMAND = 3;
export const STATUS_SPOKEN_MAX = 400;
export interface StepBudget { max: number; used: number }
export function createBudget(max = MAX_STEPS_PER_COMMAND): StepBudget {
  if (!Number.isInteger(max) || max < 0) throw new RangeError('invalid_step_budget');
  return { max, used: 0 };
}
export function takeStep(b: StepBudget): boolean {
  if (!Number.isInteger(b.max) || !Number.isInteger(b.used) || b.used < 0 || b.used >= b.max) return false;
  b.used++; return true;
}
