import { ValidationError } from '@/lib/errors';
import type { ActionStatus } from '@/types';

/**
 * Explicit, whitelisted status graph.
 *
 * CANCELLED -> IN_PROGRESS is intentionally not allowed: a cancelled item must
 * be reopened to TODO first, so the history stays interpretable.
 */
export const ALLOWED_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['TODO'],
  CANCELLED: ['TODO'],
};

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ActionStatus, to: ActionStatus): void {
  if (!canTransition(from, to)) {
    throw new ValidationError(
      `Cannot move an action from ${from} to ${to}. Allowed from ${from}: ${
        ALLOWED_TRANSITIONS[from]?.join(', ') || 'none'
      }.`,
      [{ path: 'status', message: `Invalid status transition ${from} -> ${to}.` }],
    );
  }
}

export function transitionTimestamps(to: ActionStatus, now = new Date()) {
  if (to === 'COMPLETED') return { completedAt: now };
  // Reopening or cancelling clears the completion timestamp.
  return { completedAt: null };
}