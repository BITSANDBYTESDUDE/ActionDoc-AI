import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

const projectSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    status: { type: String, enum: PROJECT_STATUSES, default: 'PLANNING' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'projects' },
);

projectSchema.index({ organizationId: 1, createdAt: -1 });
projectSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
projectSchema.index({ organizationId: 1, name: 1 });

export type ProjectDocument = InferSchemaType<typeof projectSchema> & { _id: Types.ObjectId };
export type ProjectModel = Model<ProjectDocument>;

export const Project: ProjectModel =
  (mongoose.models.Project as ProjectModel) ?? mongoose.model<ProjectDocument>('Project', projectSchema);