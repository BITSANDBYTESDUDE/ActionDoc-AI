import type { ApiFailure, ApiSuccess } from '@/lib/utils/api-response';

/**
 * Typed browser API client.
 *
 * All calls go through here so error handling, JSON parsing and the
 * `{ data }` envelope are handled consistently and components never have to
 * deal with raw fetch.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { path?: string; message: string }[];

  constructor(status: number, code: string, message: string, details?: { path?: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** First field-level message, useful for inline form errors. */
  get fieldMessage(): string | undefined {
    return this.details?.[0]?.message;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip JSON parsing for binary responses. */
  raw?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, raw, headers, ...rest } = options;
  const isFormData = body instanceof FormData;

  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(isFormData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  if (raw) {
    if (!response.ok) throw new ApiError(response.status, 'INTERNAL_ERROR', 'The request failed.');
    return response as unknown as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, 'INTERNAL_ERROR', 'The server returned an invalid response.');
  }

  if (!response.ok) {
    const failure = payload as ApiFailure;
    throw new ApiError(
      response.status,
      failure?.error?.code ?? 'INTERNAL_ERROR',
      failure?.error?.message ?? 'The request failed.',
      failure?.error?.details,
    );
  }

  return (payload as ApiSuccess<T>).data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};

/** Build a query string, omitting empty values. */
export function toQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}