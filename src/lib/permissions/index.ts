import { ROLE_RANK, ROLES } from '@/config/constants';
import { ForbiddenError } from '@/lib/errors';
import type { OrganizationContext, UserRole } from '@/types';

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function roleRank(role: UserRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function hasAtLeastRole(role: UserRole, minimum: UserRole): boolean {
  return roleRank(role) >= roleRank(minimum);
}

// --- Capability helpers -----------------------------------------------------
// Centralised so a permission change is a single edit, not a grep across routes.

export function canViewContent(role: UserRole): boolean {
  return hasAtLeastRole(role, 'VIEWER');
}

/** Create/update documents, actions, projects and review AI suggestions. */
export function canWriteContent(role: UserRole): boolean {
  return hasAtLeastRole(role, 'MEMBER');
}

/** Approve or reject AI suggestions (a member-level action). */
export function canReviewSuggestions(role: UserRole): boolean {
  return hasAtLeastRole(role, 'MEMBER');
}

/** Delete documents, actions or projects. */
export function canDeleteContent(role: UserRole): boolean {
  return hasAtLeastRole(role, 'ADMIN');
}

/** Invite/remove members and change roles. */
export function canManageMembers(role: UserRole): boolean {
  return hasAtLeastRole(role, 'ADMIN');
}

/** Rename the organization, change org-wide settings, transfer ownership. */
export function canManageOrganization(role: UserRole): boolean {
  return role === 'OWNER';
}

export function assertCapability(allowed: boolean, message: string): void {
  if (!allowed) throw new ForbiddenError(message);
}

export function assertRole(context: OrganizationContext, minimum: UserRole): void {
  if (!hasAtLeastRole(context.role, minimum)) {
    throw new ForbiddenError(`This action requires the ${minimum} role or higher.`);
  }
}

/**
 * Only OWNER/ADMIN may act on behalf of another user's content (reassigning,
 * cancelling someone else's action). Members are limited to their own items
 * unless explicitly granted by an assignment.
 */
export function canManageOthersWork(role: UserRole): boolean {
  return hasAtLeastRole(role, 'ADMIN');
}