import { describe, expect, it } from 'vitest';
import {
  assertRole,
  canDeleteContent,
  canManageMembers,
  canManageOrganization,
  canManageOthersWork,
  canReviewSuggestions,
  canViewContent,
  canWriteContent,
  hasAtLeastRole,
  isUserRole,
  roleRank,
} from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import { ALLOWED_TRANSITIONS, assertTransition, canTransition, transitionTimestamps } from '@/services/action-transitions';
import type { ActionStatus, OrganizationContext, UserRole } from '@/types';
import { Types } from 'mongoose';

const context = (role: UserRole): OrganizationContext => ({
  organizationId: new Types.ObjectId(),
  organizationName: 'Test',
  organizationSlug: 'test',
  role,
  userId: new Types.ObjectId(),
  userName: 'Tester',
});

describe('role ranking', () => {
  it('orders OWNER > ADMIN > MEMBER > VIEWER', () => {
    expect(roleRank('OWNER')).toBeGreaterThan(roleRank('ADMIN'));
    expect(roleRank('ADMIN')).toBeGreaterThan(roleRank('MEMBER'));
    expect(roleRank('MEMBER')).toBeGreaterThan(roleRank('VIEWER'));
  });

  it('validates role strings', () => {
    expect(isUserRole('OWNER')).toBe(true);
    expect(isUserRole('SUPERADMIN')).toBe(false);
    expect(isUserRole(null)).toBe(false);
  });

  it('compares roles by rank', () => {
    expect(hasAtLeastRole('ADMIN', 'MEMBER')).toBe(true);
    expect(hasAtLeastRole('VIEWER', 'MEMBER')).toBe(false);
    expect(hasAtLeastRole('MEMBER', 'MEMBER')).toBe(true);
  });
});

describe('capabilities per role', () => {
  it('grants read access to every role', () => {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as UserRole[]) {
      expect(canViewContent(role)).toBe(true);
    }
  });

  it('gives VIEWER no write capability at all', () => {
    expect(canWriteContent('VIEWER')).toBe(false);
    expect(canReviewSuggestions('VIEWER')).toBe(false);
    expect(canDeleteContent('VIEWER')).toBe(false);
    expect(canManageMembers('VIEWER')).toBe(false);
    expect(canManageOrganization('VIEWER')).toBe(false);
    expect(canManageOthersWork('VIEWER')).toBe(false);
  });

  it('lets MEMBER work on content but not manage the organization', () => {
    expect(canWriteContent('MEMBER')).toBe(true);
    expect(canReviewSuggestions('MEMBER')).toBe(true);
    expect(canDeleteContent('MEMBER')).toBe(false);
    expect(canManageMembers('MEMBER')).toBe(false);
    expect(canManageOrganization('MEMBER')).toBe(false);
  });

  it('lets ADMIN manage members and delete content but not own the organization', () => {
    expect(canDeleteContent('ADMIN')).toBe(true);
    expect(canManageMembers('ADMIN')).toBe(true);
    expect(canManageOthersWork('ADMIN')).toBe(true);
    expect(canManageOrganization('ADMIN')).toBe(false);
  });

  it('lets OWNER do everything', () => {
    expect(canManageOrganization('OWNER')).toBe(true);
    expect(canManageMembers('OWNER')).toBe(true);
    expect(canDeleteContent('OWNER')).toBe(true);
  });
});

describe('assertRole', () => {
  it('allows sufficient roles and rejects insufficient ones', () => {
    expect(() => assertRole(context('ADMIN'), 'MEMBER')).not.toThrow();
    expect(() => assertRole(context('VIEWER'), 'MEMBER')).toThrow(ForbiddenError);
    expect(() => assertRole(context('MEMBER'), 'OWNER')).toThrow(ForbiddenError);
  });
});

describe('action status transitions', () => {
  it('allows exactly the documented transitions', () => {
    expect(canTransition('TODO', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('TODO', 'CANCELLED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'TODO')).toBe(true);
    expect(canTransition('COMPLETED', 'TODO')).toBe(true);
    expect(canTransition('CANCELLED', 'TODO')).toBe(true);
  });

  it('rejects jumps that skip the workflow', () => {
    expect(canTransition('TODO', 'COMPLETED')).toBe(false);
    expect(canTransition('CANCELLED', 'COMPLETED')).toBe(false);
    expect(canTransition('CANCELLED', 'IN_PROGRESS')).toBe(false);
  });

  it('treats a no-op transition as invalid', () => {
    for (const status of Object.keys(ALLOWED_TRANSITIONS) as ActionStatus[]) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('throws a ValidationError describing the allowed targets', () => {
    expect(() => assertTransition('TODO', 'COMPLETED')).toThrow(/Cannot move an action/);
    expect(() => assertTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();
  });

  it('sets completedAt on completion and clears it on reopen', () => {
    const now = new Date('2026-04-18T12:00:00Z');
    expect(transitionTimestamps('COMPLETED', now)).toEqual({ completedAt: now });
    expect(transitionTimestamps('TODO', now)).toEqual({ completedAt: null });
    expect(transitionTimestamps('CANCELLED', now)).toEqual({ completedAt: null });
  });

  it('keeps every status reachable from TODO through valid steps', () => {
    const seen = new Set<ActionStatus>(['TODO']);
    let frontier: ActionStatus[] = ['TODO'];
    while (frontier.length > 0) {
      const next: ActionStatus[] = [];
      for (const status of frontier) {
        for (const target of ALLOWED_TRANSITIONS[status]) {
          if (!seen.has(target)) {
            seen.add(target);
            next.push(target);
          }
        }
      }
      frontier = next;
    }
    expect([...seen].sort()).toEqual(['CANCELLED', 'COMPLETED', 'IN_PROGRESS', 'TODO']);
  });
});