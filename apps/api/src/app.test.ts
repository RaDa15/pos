import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('returns status 200 with ok status and version', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('database', 'connected');
    expect(res.body).toHaveProperty('version', '1.0.0');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('root /health returns database connected and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('database', 'connected');
    expect(res.body).toHaveProperty('uptime');
  });

  it('enforces AC-64 security headers (CSP, X-Frame-Options DENY, nosniff)', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });
});
