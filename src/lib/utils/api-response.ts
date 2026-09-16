import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, isAppError, RateLimitedError } from '@/lib/errors';

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error: {
    code: string;
    message: string;
    details?: { path?: string; message: string }[];
  };
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json<ApiSuccess<T>>({ data }, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/**
 * Convert any thrown value into a sanitised, consistent JSON error response.
 * Stack traces and driver internals are logged server-side only.
 */
export function errorResponse(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    return NextResponse.json<ApiFailure>(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The submitted data is invalid.',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  if (isAppError(error)) {
    const response = NextResponse.json<ApiFailure>(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details?.length ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );

    if (error instanceof RateLimitedError) {
      response.headers.set('Retry-After', String(Math.ceil(error.retryAfterSeconds)));
    }

    if (error.status >= 500) {
      console.error('[api] application error', { code: error.code, message: error.message, ...error.logContext });
    }
    return response;
  }

  console.error('[api] unhandled error', error);
  return NextResponse.json<ApiFailure>(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
    { status: 500 },
  );
}

/**
 * Wrap a route handler so that thrown errors always become consistent JSON.
 */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export type { AppError };