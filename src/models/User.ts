import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** Null for OAuth-only accounts. Never selected by default. */
    passwordHash: { type: String, select: false },
    image: { type: String, default: null },
    emailVerified: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    /** Soft-disable an account without deleting audit history. */
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ createdAt: -1 });

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export type UserModel = Model<UserDocument>;

export const User: UserModel =
  (mongoose.models.User as UserModel) ?? mongoose.model<UserDocument>('User', userSchema);