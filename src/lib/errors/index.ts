/**
 * Consistent application error taxonomy.
 *
 * Every error carries a stable machine-readable `code`, an HTTP status and a
 * list of safe-to-expose details. Stack traces are never serialised to clients.
 */

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR';

export interface AppErrorDetail {
  path?: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: AppErrorCode;
  readonly details?: AppErrorDetail[];
  /** Extra context for logs only - never returned to clients. */
  readonly logContext?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: AppErrorCode;
      status: number;
      details?: AppErrorDetail[];
      logContext?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.logContext = options.logContext;
    if (options.cause !== undefined) this.cause = options.cause;
    Error.captureStackTrace?.(this, new.target);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details?.length ? { details: this.details } : {}),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The submitted data is invalid.', details?: AppErrorDetail[]) {
    super(message, { code: 'VALIDATION_ERROR', status: 422, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super(message, { code: 'UNAUTHORIZED', status: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, { code: 'FORBIDDEN', status: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', message?: string) {
    super(message ?? `${resource} was not found.`, { code: 'NOT_FOUND', status: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The resource already exists.', details?: AppErrorDetail[]) {
    super(message, { code: 'CONFLICT', status: 409, details });
  }
}

export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = 'Too many requests. Please slow down.') {
    super(message, { code: 'RATE_LIMITED', status: 429 });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'The uploaded file is too large.') {
    super(message, { code: 'PAYLOAD_TOO_LARGE', status: 413 });
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'This file type is not supported.') {
    super(message, { code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 });
  }
}

export class ExternalServiceError extends AppError {
  readonly service: string;
  constructor(service: string, message: string, logContext?: Record<string, unknown>) {
    super(message, { code: 'EXTERNAL_SERVICE_ERROR', status: 502, logContext });
    this.service = service;
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred.', logContext?: Record<string, unknown>) {
    super(message, { code: 'INTERNAL_ERROR', status: 500, logContext });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}