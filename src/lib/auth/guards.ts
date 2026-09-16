import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Membership } from '@/models/Membership';
import { Organization } from '@/models/Organization';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { requireAuth, readActiveOrganizationId } from '@/lib/auth/session';
import { isValidObjectId } from '@/lib/validation/common';
import { hasAtLeastRole } from '@/lib/permissions';
import type { OrganizationContext, SessionUser, UserRole } from '@/types';
import type { MembershipDocument } from '@/models/Membership';

/**
 * Resolve and verify the current organization context.
 *
 * The organization id is *never* trusted from a request body. It is either the
 * id stored in the (http-only, signed) active-org cookie or an explicit route
 * parameter - and in both cases membership is verified against MongoDB.
 */
export async function resolveOrganizationContext(
  options: { organizationId?: string | null; user?: SessionUser } = {},
): Promise<OrganizationContext> {
  const user = options.user ?? (await requireAuth());

  const explicit = options.organizationId ?? (await readActiveOrganizationId());
  if (explicit && !isValidObjectId(explicit)) {
    throw new ValidationError('Invalid organization id.');
  }

  await connectToDatabase();

  const userId = new Types.ObjectId(user.id);
  let candidate = explicit;

  if (!candidate) {
    // No (valid) selection yet - fall back to the caller's first membership so a
    // freshly registered user is never stuck on an empty shell. Membership is
    // still the source of truth, so this grants no extra access.
    const first = (await Membership.findOne({ userId })
      .sort({ createdAt: 1 })
      .select('organizationId')
      .lean()
      .exec()) as MembershipDocument | null;
    candidate = first ? String(first.organizationId) : null;
  }

  if (!candidate) {
    throw new ValidationError('No active organization selected.');
  }

  const membership = (await Membership.findOne({
    userId,
    organizationId: new Types.ObjectId(candidate),
  })
    .lean()
    .exec()) as MembershipDocument | null;

  if (!membership) {
    // Do not leak whether the organization exists at all.
    throw new ForbiddenError('You do not have access to this organization.');
  }

  const organization = await Organization.findById(candidate).select('name slug archivedAt').lean();
  if (!organization) throw new NotFoundError('Organization');
  if (organization.archivedAt) throw new ForbiddenError('This organization has been archived.');

  return {
    organizationId: membership.organizationId as Types.ObjectId,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    role: membership.role as UserRole,
    userId,
    userName: user.name || user.email,
  };
}

/** Throwing variant used by API routes that require a specific minimum role. */
export async function requireOrganizationMembership(
  minimumRole: UserRole = 'VIEWER',
  options: { organizationId?: string | null } = {},
): Promise<OrganizationContext> {
  const context = await resolveOrganizationContext(options);
  if (!hasAtLeastRole(context.role, minimumRole)) {
    throw new ForbiddenError(`This action requires the ${minimumRole} role or higher.`);
  }
  return context;
}

/** Alias kept for readability at call sites that only care about the role. */
export const requireRole = requireOrganizationMembership;

/**
 * Every organization-owned lookup goes through here so an id from one tenant
 * can never be used to reach another tenant's data.
 */
export function assertSameOrganization(
  resourceOrganizationId: unknown,
  context: OrganizationContext,
): void {
  if (String(resourceOrganizationId) !== String(context.organizationId)) {
    throw new NotFoundError('Resource');
  }
}