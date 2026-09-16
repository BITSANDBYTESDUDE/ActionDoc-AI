import mongoose, { Types, type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Organization } from '@/models/Organization';
import { Membership } from '@/models/Membership';
import { User } from '@/models/User';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { recordAuditEvent } from '@/services/audit.service';
import { isUserRole } from '@/lib/permissions';
import type { MembershipDocument } from '@/models/Membership';
import type { UserRole } from '@/types';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: UserRole;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Derive a slug that is unique, appending a short random suffix on collision. */
async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'organization';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
    const existing = await Organization.exists({ slug: candidate });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listOrganizationsForUser(userId: string): Promise<OrganizationSummary[]> {
  await connectToDatabase();
  const memberships = (await Membership.find({ userId: new Types.ObjectId(userId) })
    .populate<{ organizationId: { _id: Types.ObjectId; name: string; slug: string; archivedAt: Date | null } }>(
      'organizationId',
      'name slug archivedAt',
    )
    .sort({ createdAt: 1 })
    .lean()
    .exec()) as unknown as (MembershipDocument & {
    organizationId: { _id: Types.ObjectId; name: string; slug: string; archivedAt: Date | null } | null;
  })[];

  return memberships
    .filter((membership) => membership.organizationId && !membership.organizationId.archivedAt)
    .map((membership) => ({
      id: String(membership.organizationId!._id),
      name: membership.organizationId!.name,
      slug: membership.organizationId!.slug,
      role: membership.role as UserRole,
    }));
}

/**
 * Create an organization and its OWNER membership.
 *
 * Uses a transaction when the deployment supports it (replica sets / Atlas) so
 * an organization can never exist without an owner. Falls back to a compensating
 * delete on standalone mongod, where transactions are unavailable.
 */
export async function createOrganization(params: {
  userId: string;
  userName: string;
  name: string;
}): Promise<OrganizationSummary> {
  await connectToDatabase();

  const name = params.name.trim();
  if (name.length < 2) throw new ValidationError('Organization name must be at least 2 characters.');

  const slug = await generateUniqueSlug(name);
  const userId = new Types.ObjectId(params.userId);

  const session = await safeStartSession();
  let organizationId: Types.ObjectId;
  let slugValue = slug;

  try {
    if (session) {
      const created = await Organization.create(
        [{ name, slug, createdById: userId }],
        { session },
      );
      organizationId = created[0]!._id;
      await Membership.create(
        [{ userId, organizationId, role: 'OWNER', isPrimaryOwner: true }],
        { session },
      );
      await session.commitTransaction();
    } else {
      const created = await Organization.create({ name, slug, createdById: userId });
      organizationId = created._id;
      try {
        await Membership.create({ userId, organizationId, role: 'OWNER', isPrimaryOwner: true });
      } catch (error) {
        // Compensating action: no org may exist without its owner membership.
        await Organization.deleteOne({ _id: organizationId });
        throw error;
      }
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      // Extremely unlikely slug race - retry once with a randomised slug.
      slugValue = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
      const created = await Organization.create({ name, slug: slugValue, createdById: userId });
      organizationId = created._id;
      await Membership.create({ userId, organizationId, role: 'OWNER', isPrimaryOwner: true });
    } else {
      throw error;
    }
  } finally {
    if (session) await session.endSession();
  }

  await recordAuditEvent({
    organizationId,
    actorId: userId,
    actorName: params.userName,
    action: 'ORGANIZATION_CREATED',
    entityType: 'ORGANIZATION',
    entityId: organizationId,
    metadata: { name, slug: slugValue },
  });

  return { id: String(organizationId), name, slug: slugValue, role: 'OWNER' };
}

export async function getOrganization(organizationId: Types.ObjectId) {
  await connectToDatabase();
  const organization = await Organization.findById(organizationId).lean();
  if (!organization) throw new NotFoundError('Organization');
  return organization;
}

export async function updateOrganization(params: {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  name?: string;
  dueSoonWindowDays?: number;
  notificationsEnabled?: boolean;
}): Promise<void> {
  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (params.name !== undefined) {
    const name = params.name.trim();
    if (name.length < 2) throw new ValidationError('Organization name must be at least 2 characters.');
    update.name = name;
  }
  if (params.dueSoonWindowDays !== undefined) {
    if (params.dueSoonWindowDays < 1 || params.dueSoonWindowDays > 30) {
      throw new ValidationError('The due-soon window must be between 1 and 30 days.');
    }
    update['settings.dueSoonWindowDays'] = params.dueSoonWindowDays;
  }
  if (params.notificationsEnabled !== undefined) {
    update['settings.notificationsEnabled'] = params.notificationsEnabled;
  }

  if (Object.keys(update).length === 0) return;

  const result = await Organization.updateOne({ _id: params.organizationId }, { $set: update });
  if (result.matchedCount === 0) throw new NotFoundError('Organization');

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'ORGANIZATION_UPDATED',
    entityType: 'ORGANIZATION',
    entityId: params.organizationId,
    metadata: { fields: Object.keys(update) },
  });
}

export interface MemberListItem {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  joinedAt: Date | null;
  isPrimaryOwner: boolean;
}

export async function listMembers(organizationId: Types.ObjectId): Promise<MemberListItem[]> {
  await connectToDatabase();
  const memberships = await Membership.find({ organizationId })
    .populate<{ userId: { _id: Types.ObjectId; name: string; email: string } | null }>('userId', 'name email')
    .sort({ createdAt: 1 })
    .lean()
    .exec();

  return memberships
    .filter((membership) => membership.userId)
    .map((membership) => {
      const user = membership.userId as unknown as { _id: Types.ObjectId; name: string; email: string };
      return {
        membershipId: String(membership._id),
        userId: String(user._id),
        name: user.name,
        email: user.email,
        role: membership.role as UserRole,
        joinedAt: membership.joinedAt ?? null,
        isPrimaryOwner: Boolean(membership.isPrimaryOwner),
      };
    });
}

/**
 * Verify that a user id belongs to the organization before it is used as an
 * assignee. This is the single guard against cross-organization assignment.
 */
export async function assertMemberOfOrganization(params: {
  organizationId: Types.ObjectId;
  userId: string | Types.ObjectId;
}): Promise<void> {
  await connectToDatabase();
  const userId = typeof params.userId === 'string' ? new Types.ObjectId(params.userId) : params.userId;
  const membership = await Membership.exists({ organizationId: params.organizationId, userId });
  if (!membership) {
    throw new ValidationError('The selected user is not a member of this organization.');
  }
}

export async function getMemberUserIds(organizationId: Types.ObjectId): Promise<Types.ObjectId[]> {
  await connectToDatabase();
  const memberships = await Membership.find({ organizationId }).select('userId').lean();
  return memberships.map((membership) => membership.userId as Types.ObjectId);
}

export async function addMember(params: {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  email: string;
  role: UserRole;
}): Promise<MemberListItem> {
  await connectToDatabase();

  if (!isUserRole(params.role)) throw new ValidationError('Invalid role.');
  if (params.role === 'OWNER') {
    throw new ForbiddenError('Ownership can only be transferred by the current owner.');
  }

  const email = params.email.toLowerCase().trim();
  const user = await User.findOne({ email }).lean();
  if (!user) {
    throw new NotFoundError('User', 'No ActionDoc AI account exists for that email address.');
  }

  const existing = await Membership.findOne({
    organizationId: params.organizationId,
    userId: user._id,
  });
  if (existing) throw new ConflictError('That user is already a member of this organization.');

  const membership = await Membership.create({
    organizationId: params.organizationId,
    userId: user._id,
    role: params.role,
    invitedById: params.actorId,
  });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'MEMBER_ADDED',
    entityType: 'MEMBERSHIP',
    entityId: membership._id,
    metadata: { role: params.role, userId: String(user._id) },
  });

  return {
    membershipId: String(membership._id),
    userId: String(user._id),
    name: user.name,
    email: user.email,
    role: params.role,
    joinedAt: membership.joinedAt ?? null,
    isPrimaryOwner: false,
  };
}

export async function updateMemberRole(params: {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  membershipId: string;
  role: UserRole;
}): Promise<void> {
  await connectToDatabase();
  if (!isUserRole(params.role)) throw new ValidationError('Invalid role.');
  if (params.role === 'OWNER') {
    throw new ForbiddenError('Ownership can only be transferred by the current owner.');
  }

  const membership = await Membership.findOne({
    _id: new Types.ObjectId(params.membershipId),
    organizationId: params.organizationId,
  });
  if (!membership) throw new NotFoundError('Membership');

  if (membership.role === 'OWNER' || membership.isPrimaryOwner) {
    throw new ForbiddenError('The organization owner role cannot be changed here.');
  }

  membership.role = params.role;
  await membership.save();

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'MEMBER_ROLE_CHANGED',
    entityType: 'MEMBERSHIP',
    entityId: membership._id,
    metadata: { role: params.role },
  });
}

export async function removeMember(params: {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  membershipId: string;
}): Promise<void> {
  await connectToDatabase();

  const membership = await Membership.findOne({
    _id: new Types.ObjectId(params.membershipId),
    organizationId: params.organizationId,
  });
  if (!membership) throw new NotFoundError('Membership');

  if (membership.role === 'OWNER' || membership.isPrimaryOwner) {
    throw new ForbiddenError('The organization owner cannot be removed.');
  }

  await Membership.deleteOne({ _id: membership._id, organizationId: params.organizationId });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'MEMBER_REMOVED',
    entityType: 'MEMBERSHIP',
    entityId: membership._id,
    metadata: { userId: String(membership.userId) },
  });
}

// --- helpers ---------------------------------------------------------------

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

/** Transactions require a replica set; degrade gracefully on standalone. */
async function safeStartSession(): Promise<ClientSession | null> {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    return session;
  } catch (error) {
    console.warn('[organization] transactions unavailable, using compensating writes', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}