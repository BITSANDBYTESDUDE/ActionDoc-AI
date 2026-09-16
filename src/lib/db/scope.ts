/**
 * All multi-tenant queries in this codebase MUST include the organisation
 * scope. These helpers centralise filter construction so no route handler can
 * accidentally query organisation-owned data without isolation.
 */
import mongoose, { type QueryFilter, type Model, type Types } from 'mongoose';
import { isValidObjectId } from '@/lib/validation/common';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

export type OrgId = string | Types.ObjectId;

export function toObjectId(value: OrgId, field = 'organizationId'): Types.ObjectId {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!isValidObjectId(value)) throw new ValidationError(`Invalid ${field}.`);
  return new mongoose.Types.ObjectId(value);
}

export function orgScope(organizationId: OrgId): { organizationId: Types.ObjectId } {
  return { organizationId: toObjectId(organizationId) };
}

/**
 * Look up one document strictly inside an organisation. Throws NotFoundError so
 * the existence of cross-organisation resources is never leaked.
 */
export async function findOneScoped<T>(
  model: Model<T>,
  organizationId: Types.ObjectId,
  filter: QueryFilter<T> = {},
): Promise<T> {
  const doc = (await model.findOne({ ...filter, organizationId }).exec()) as T | null;
  if (!doc) throw new NotFoundError('Resource');
  return doc;
}

export function assertOrganizationAccess(resourceOrgId: Types.ObjectId, currentOrgId: Types.ObjectId): void {
  if (String(resourceOrgId) !== String(currentOrgId)) {
    throw new ForbiddenError('This resource belongs to another organization.');
  }
}