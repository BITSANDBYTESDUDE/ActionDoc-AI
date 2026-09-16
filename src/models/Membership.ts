import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';
import { ROLES } from '@/config/constants';

/**
 * Join table between users and organizations carrying the user's role.
 * The unique compound index is the authoritative guard against duplicate
 * memberships.
 */
const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    role: { type: String, enum: ROLES, required: true, default: 'MEMBER' },
    invitedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, default: () => new Date() },
    /** Prevents the last owner from being demoted or removed. */
    isPrimaryOwner: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'memberships' },
);

membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, role: 1 });
membershipSchema.index({ organizationId: 1, createdAt: -1 });

export type MembershipDocument = InferSchemaType<typeof membershipSchema> & { _id: Types.ObjectId };
export type MembershipModel = Model<MembershipDocument>;

export const Membership: MembershipModel =
  (mongoose.models.Membership as MembershipModel) ??
  mongoose.model<MembershipDocument>('Membership', membershipSchema);