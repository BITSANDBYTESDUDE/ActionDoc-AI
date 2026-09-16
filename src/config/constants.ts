export const APP_NAME = 'ActionDoc AI';
export const APP_TAGLINE = 'Turn documents into actionable work.';
export const APP_DESCRIPTION =
  'ActionDoc AI is an AI-powered document intelligence platform that transforms business documents into actionable tasks, assignments, deadlines, and workflows.';

export const MAX_UPLOAD_BYTES_DEFAULT = 25 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const;

export const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

/** Hard cap on stored extracted text so a single document cannot blow up a BSON doc. */
export const MAX_EXTRACTED_TEXT_CHARS = 900_000;

/** Maximum number of suggested actions sent to the model / kept per extraction. */
export const MAX_SUGGESTIONS = 40;

export const EXTRACTION_VERSION = '1.0.0';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export const ROLE_RANK: Record<(typeof ROLES)[number], number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};