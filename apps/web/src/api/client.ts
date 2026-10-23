/**
 * API client with automatic CSRF token handling and error parsing.
 * Uses native fetch with credentials: 'include'.
 */

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;
  readonly requestId?: string;

  constructor(status: number, message: string, code = 'API_ERROR', details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

let cachedCsrfToken: string | null = null;
type SessionExpiryHandler = () => void;
let sessionExpiryHandler: SessionExpiryHandler | null = null;

export function setOnSessionExpired(handler: SessionExpiryHandler | null) {
  sessionExpiryHandler = handler;
}


export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch('/api/v1/auth/csrf', {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to fetch CSRF token', 'CSRF_FETCH_FAILED');
  }
  const json = await res.json();
  const token = json.data?.token || getCsrfTokenFromCookie() || '';
  cachedCsrfToken = token;
  return token;
}

export async function getValidCsrfToken(): Promise<string> {
  const cookieToken = getCsrfTokenFromCookie();
  if (cookieToken) {
    cachedCsrfToken = cookieToken;
    return cookieToken;
  }
  if (cachedCsrfToken) {
    return cachedCsrfToken;
  }
  return fetchCsrfToken();
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (isMutation) {
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const token = await getValidCsrfToken();
    headers['X-CSRF-Token'] = token;
  }

  const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  let res = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include',
  });

  // If CSRF expired or invalid, refresh token and retry once
  if (res.status === 403 && isMutation) {
    try {
      const errorJson: ApiErrorResponse = await res.clone().json();
      if (errorJson.error?.code === 'CSRF_INVALID') {
        const freshToken = await fetchCsrfToken();
        headers['X-CSRF-Token'] = freshToken;
        res = await fetch(url, {
          ...options,
          method,
          headers,
          credentials: 'include',
        });
      }
    } catch {
      // Continue to standard error handling
    }
  }

  let json: unknown;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const errorBody = (json as ApiErrorResponse)?.error;
    const code = errorBody?.code || `HTTP_${res.status}`;
    const message = errorBody?.message || res.statusText || 'An error occurred';
    const details = errorBody?.details;
    const requestId = errorBody?.requestId;

    if (res.status === 401 && !url.includes('/api/v1/auth/')) {
      if (sessionExpiryHandler) {
        sessionExpiryHandler();
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('pos:session-expired', {
            detail: { message: 'Your session expired. Please sign in again.' },
          })
        );
      }
    }

    throw new ApiError(res.status, message, code, details, requestId);
  }

  return json as T;
}

export const api = {
  get: <T>(url: string, headers?: Record<string, string>) =>
    apiRequest<T>(url, { method: 'GET', headers }),
  post: <T>(url: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: 'POST',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    }),
  put: <T>(url: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: 'PUT',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    }),
  patch: <T>(url: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: 'PATCH',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    }),
  delete: <T>(url: string, headers?: Record<string, string>) =>
    apiRequest<T>(url, { method: 'DELETE', headers }),
};

export const apiClient = api;
