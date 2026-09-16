import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    settings: {
      /** Days ahead used for "due soon" notifications. */
      dueSoonWindowDays: { type: Number, default: 3, min: 1, max: 30 },
      notificationsEnabled: { type: Boolean, default: true },
    },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'organizations' },
);

export type OrganizationDocument = InferSchemaType<typeof organizationSchema> & { _id: Types.ObjectId };
export type OrganizationModel = Model<OrganizationDocument>;

export const Organization: OrganizationModel =
  (mongoose.models.Organization as OrganizationModel) ??
  mongoose.model<OrganizationDocument>('Organization', organizationSchema);