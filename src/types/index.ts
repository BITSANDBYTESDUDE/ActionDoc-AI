import type { Types } from 'mongoose';

export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type DocumentStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'ANALYZING'
  | 'REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export type ExtractionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ActionStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ActionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ActionType = 'TASK' | 'DECISION' | 'FOLLOW_UP' | 'DEADLINE' | 'REMINDER';

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export type NotificationType =
  | 'ACTION_ASSIGNED'
  | 'ACTION_DUE_SOON'
  | 'ACTION_OVERDUE'
  | 'ACTION_COMPLETED'
  | 'DOCUMENT_READY'
  | 'AI_REVIEW_REQUIRED';

export type AuditEntityType =
  | 'ORGANIZATION'
  | 'MEMBERSHIP'
  | 'DOCUMENT'
  | 'EXTRACTION'
  | 'ACTION'
  | 'PROJECT'
  | 'USER'
  | 'SETTINGS';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface OrganizationContext {
  organizationId: Types.ObjectId;
  organizationName: string;
  organizationSlug: string;
  role: UserRole;
  userId: Types.ObjectId;
  /** Display name of the signed-in user, used in audit logs and notifications. */
  userName: string;
}