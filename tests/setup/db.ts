/**
 * Integration-test harness.
 *
 * Starts a real in-memory MongoDB (replica-set mode so transactions work) and
 * exposes helpers for building organization/user fixtures. Tests run against
 * the *real* Mongoose models and services - nothing is mocked.
 */
import { MongoMemoryReplSet, type MongoMemoryReplSet as ReplSet } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import { hashPassword } from '@/lib/auth/password';
import { User } from '@/models/User';
import { Organization } from '@/models/Organization';
import { Membership } from '@/models/Membership';
import type { OrganizationContext, UserRole } from '@/types';

let replSet: ReplSet | null = null;

/** Boot the in-memory replica set. Safe to call once per test file. */
export async function startTestDatabase(): Promise<void> {
  if (replSet) return;

  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri;

  // The cached connection in lib/db/connect belongs to a previous URI during
  // watch mode, so reset it explicitly.
  await mongoose.disconnect().catch(() => undefined);
  const globalCache = (globalThis as { __actionDocMongoose?: { conn: unknown; promise: unknown } })
    .__actionDocMongoose;
  if (globalCache) {
    globalCache.conn = null;
    globalCache.promise = null;
  }

  await mongoose.connect(uri, { maxPoolSize: 5 });
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect().catch(() => undefined);
  if (replSet) {
    await replSet.stop().catch(() => undefined);
    replSet = null;
  }
}

/** Wipe every collection. Used in `beforeEach` so tests never leak state. */
export async function resetDatabase(): Promise<void> {
  const collections = await mongoose.connection.db?.collections();
  if (!collections) return;
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export interface TestUser {
  id: string;
  objectId: Types.ObjectId;
  email: string;
  name: string;
  password: string;
}

let userCounter = 0;

export async function createTestUser(overrides: Partial<{ name: string; email: string }> = {}): Promise<TestUser> {
  userCounter += 1;
  const password = 'TestPassword123!';
  const email = overrides.email ?? `user${userCounter}@example.test`;
  const name = overrides.name ?? `Test User ${userCounter}`;

  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
  });

  return { id: String(user._id), objectId: user._id, email, name, password };
}

export interface TestOrganization {
  id: string;
  objectId: Types.ObjectId;
  name: string;
  slug: string;
  owner: TestUser;
}

export async function createTestOrganization(params: {
  owner: TestUser;
  name?: string;
}): Promise<TestOrganization> {
  const name = params.name ?? `Test Org ${new Types.ObjectId().toHexString().slice(0, 6)}`;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;

  const organization = await Organization.create({
    name,
    slug,
    createdById: params.owner.objectId,
  });

  await Membership.create({
    userId: params.owner.objectId,
    organizationId: organization._id,
    role: 'OWNER',
    isPrimaryOwner: true,
  });

  return { id: String(organization._id), objectId: organization._id, name, slug, owner: params.owner };
}

export async function addMember(params: {
  organizationId: Types.ObjectId;
  user: TestUser;
  role: UserRole;
  isPrimaryOwner?: boolean;
}) {
  return Membership.create({
    userId: params.user.objectId,
    organizationId: params.organizationId,
    role: params.role,
    isPrimaryOwner: params.isPrimaryOwner ?? false,
  });
}

/** Build the context object normally produced by `requireOrganizationMembership`. */
export function contextFor(params: {
  organization: TestOrganization;
  user: TestUser;
  role: UserRole;
}): OrganizationContext {
  return {
    organizationId: params.organization.objectId,
    organizationName: params.organization.name,
    organizationSlug: params.organization.slug,
    role: params.role,
    userId: params.user.objectId,
    userName: params.user.name,
  };
}

export { mongoose, Types };
