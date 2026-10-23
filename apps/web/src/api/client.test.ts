import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, getCsrfTokenFromCookie } from './client.js';

describe('API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { document: { cookie: string } }).document = {
      cookie: '',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('correctly extracts csrf token from cookie string', () => {
    globalThis.document.cookie = 'foo=bar; csrf=my-csrf-token-123; other=val';
    expect(getCsrfTokenFromCookie()).toBe('my-csrf-token-123');
  });

  it('returns null when csrf cookie is absent', () => {
    globalThis.document.cookie = 'foo=bar; other=val';
    expect(getCsrfTokenFromCookie()).toBeNull();
  });

  it('performs GET request without X-CSRF-Token header', async () => {
    const mockResponse = { data: { status: 'ok' } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });
    global.fetch = fetchMock;

    const res = await api.get('/api/v1/health');
    expect(res).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }));
  });

  it('performs POST request with X-CSRF-Token header', async () => {
    globalThis.document.cookie = 'csrf=test-token-456';

    const mockResponse = { data: { success: true } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockResponse)),
    });
    global.fetch = fetchMock;

    const res = await api.post('/api/v1/auth/logout');
    expect(res).toEqual(mockResponse);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-CSRF-Token': 'test-token-456',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('parses structured API errors into ApiError', async () => {
    globalThis.document.cookie = 'csrf=test-token-456';

    const errorPayload = {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect username or password.',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve(JSON.stringify(errorPayload)),
    });

    await expect(api.post('/api/v1/auth/employee-login', { username: 'test', password: 'bad' }))
      .rejects.toThrow(ApiError);

    try {
      await api.post('/api/v1/auth/employee-login', { username: 'test', password: 'bad' });
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe('INVALID_CREDENTIALS');
      expect(apiErr.status).toBe(401);
      expect(apiErr.message).toBe('Incorrect username or password.');
    }
  });
});
