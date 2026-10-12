import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { ApiPolicyError, providerLimits, readBoundedInteger } from '../src/services/apiPolicy';
import { ProviderWork } from '../src/services/providerWork';

export interface ServerPolicy {
  host: string;
  port: number;
  publicMode: boolean;
  accessKey: string;
  allowedOrigins: string[];
  trustedProxies: string[];
  rateLimit: number;
  concurrency: number;
}

const localNames = new Set(['localhost', '127.0.0.1', '[::1]']);
const localPeers = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function readServerPolicy(env: Record<string, string | undefined> = process.env): ServerPolicy {
  providerLimits(env);
  if (env.API_PUBLIC_MODE && !['true', 'false'].includes(env.API_PUBLIC_MODE)) throw new Error('Invalid configuration: API_PUBLIC_MODE');
  const publicMode = env.API_PUBLIC_MODE === 'true';
  const host = env.API_HOST || '127.0.0.1';
  if (!isIP(host) || (!publicMode && !localPeers.has(host))) throw new Error('Non-loopback API_HOST requires API_PUBLIC_MODE=true');
  const accessKey = env.API_ACCESS_KEY || '';
  if ((accessKey || publicMode) && (accessKey.length < 32 || accessKey.length > 512 || !/^[\x21-\x7e]+$/.test(accessKey))) {
    throw new Error('API_ACCESS_KEY must contain 32 to 512 printable non-space ASCII characters');
  }
  const allowedOrigins = (env.API_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  for (const origin of allowedOrigins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('Invalid configuration: API_ALLOWED_ORIGINS'); }
    if (url.origin !== origin || url.protocol !== 'https:') throw new Error('API_ALLOWED_ORIGINS must contain exact HTTPS origins');
  }
  const trustedProxies = (env.API_TRUSTED_PROXIES || '').split(',').map(value => value.trim()).filter(Boolean);
  for (const proxy of trustedProxies) {
    const [address, prefix, extra] = proxy.split('/');
    const family = isIP(address);
    if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('API_TRUSTED_PROXIES must contain explicit IP addresses or subnets');
    }
    if (prefix === '0') throw new Error('API_TRUSTED_PROXIES cannot trust every address');
  }
  if (publicMode && (!accessKey || !allowedOrigins.length || !trustedProxies.length)) {
    throw new Error('Public mode requires API_ACCESS_KEY, API_ALLOWED_ORIGINS and API_TRUSTED_PROXIES');
  }
  if (!publicMode && trustedProxies.length) throw new Error('Trusted proxies require API_PUBLIC_MODE=true');
  return {
    host, publicMode, accessKey, allowedOrigins, trustedProxies,
    port: readBoundedInteger(env, 'PORT', 3001, 1, 65535),
    rateLimit: readBoundedInteger(env, 'API_RATE_LIMIT', 20, 1, 10_000),
    concurrency: readBoundedInteger(env, 'API_MAX_CONCURRENCY', 2, 1, 32),
  };
}

function safeHost(host: string | undefined): string | undefined {
  if (!host || /[\/\\@?#\s]/.test(host)) return;
  try { return new URL(`http://${host}`).hostname; } catch { return; }
}

export function sendApiError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: message, code, requestId: res.locals.requestId });
}

export function requestBoundary(policy: ServerPolicy): RequestHandler {
  return (req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-Id', res.locals.requestId);
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (policy.publicMode) {
      if (!req.secure) return sendApiError(res, 403, 'HTTPS_REQUIRED', 'HTTPS is required.');
      const allowedHosts = policy.allowedOrigins.map(value => new URL(value).host);
      if (!req.headers.host || !allowedHosts.includes(req.headers.host)) return sendApiError(res, 403, 'ORIGIN_DENIED', 'Request origin is not allowed.');
      if (origin !== undefined && !policy.allowedOrigins.includes(origin)) return sendApiError(res, 403, 'ORIGIN_DENIED', 'Request origin is not allowed.');
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.vary('Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'Retry-After, X-Request-Id');
      }
    } else {
      if (!localPeers.has(req.socket.remoteAddress || '') || !localNames.has(safeHost(req.headers.host) || '')) {
        return sendApiError(res, 403, 'ORIGIN_DENIED', 'Local API requests must use a loopback host and connection.');
      }
      if (origin !== undefined) {
        let url: URL;
        try { url = new URL(origin); } catch { return sendApiError(res, 403, 'ORIGIN_DENIED', 'Request origin is not allowed.'); }
        if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || !localNames.has(url.hostname)) {
          return sendApiError(res, 403, 'ORIGIN_DENIED', 'Request origin is not allowed.');
        }
      }
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  };
}

export function requireAccess(policy: ServerPolicy): RequestHandler {
  const expected = createHash('sha256').update(policy.accessKey).digest();
  return (req, res, next) => {
    if (!policy.accessKey) return next();
    const header = req.get('Authorization') || '';
    const key = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (key.length > 512 || !key || !timingSafeEqual(expected, createHash('sha256').update(key).digest())) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return sendApiError(res, 401, 'ACCESS_REQUIRED', 'API access key required or rejected.');
    }
    next();
  };
}

export function requireJson(req: Request, res: Response, next: () => void): void {
  if (!req.is('application/json') || (req.get('Content-Encoding') && req.get('Content-Encoding') !== 'identity')) {
    return sendApiError(res, 415, 'UNSUPPORTED_CONTENT_TYPE', 'Use uncompressed application/json.');
  }
  next();
}

export function rateAdmission(policy: ServerPolicy, now = Date.now): RequestHandler {
  const clients = new Map<string, { count: number; expires: number }>();
  let sweepAt = 0;
  return (req, res, next) => {
    const time = now();
    if (time >= sweepAt) {
      for (const [key, value] of clients) if (value.expires <= time) clients.delete(key);
      sweepAt = time + 60_000;
    }
    const key = ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown', 56);
    let client = clients.get(key);
    if (client && client.expires <= time) { clients.delete(key); client = undefined; }
    if (!client && clients.size < 10_000) {
      client = { count: 0, expires: time + 60_000 };
      clients.set(key, client);
    }
    if (!client || client.count >= policy.rateLimit) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil(((client?.expires ?? time + 60_000) - time) / 1000)));
      return sendApiError(res, 429, 'RATE_LIMITED', 'Too many API requests. Wait before retrying.');
    }
    client.count++;
    next();
  };
}

export function jobAdmission(policy: ServerPolicy): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= policy.concurrency) {
      res.setHeader('Retry-After', '1');
      return sendApiError(res, 503, 'SERVER_BUSY', 'Auditor is busy. Retry later.');
    }
    active++;
    let released = false;
    res.locals.releaseJob = () => {
      if (!released) { released = true; active--; }
    };
    next();
  };
}

export async function runAuditJob<T>(res: Response, operation: () => Promise<T>): Promise<T> {
  const work = new ProviderWork();
  try { return await work.run(operation); }
  finally {
    await work.settled();
    res.locals.releaseJob?.();
  }
}

export function reportApiFailure(res: Response, error: unknown): void {
  if (error instanceof ApiPolicyError) {
    res.setHeader('Retry-After', error.retryAfter);
    return sendApiError(res, error.status, error.code, error.message);
  }
  console.error('[api] audit failed', { requestId: res.locals.requestId, code: 'AUDIT_FAILED' });
  sendApiError(res, 500, 'AUDIT_FAILED', 'Audit failed. Check server configuration or try again later.');
}

export const parserErrors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
  if (type === 'entity.too.large') return sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', 'JSON payload is too large.');
  if (type === 'encoding.unsupported' || type === 'charset.unsupported') return sendApiError(res, 415, 'UNSUPPORTED_CONTENT_TYPE', 'Unsupported JSON encoding.');
  if (['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(String(type))) {
    return sendApiError(res, 400, 'INVALID_JSON', 'Malformed JSON request.');
  }
  reportApiFailure(res, error);
};
