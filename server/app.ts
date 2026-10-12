import express from 'express';
import helmet from 'helmet';
import { resolveProvider, resolveFallbackProvider } from '../src/services/providers/factory';
import { analyzeRoute } from './routes/analyze';
import { compareRoute } from './routes/compare';
import { jobAdmission, parserErrors, rateAdmission, readServerPolicy, requestBoundary, requireAccess, requireJson, sendApiError, type ServerPolicy } from './security';

export function createApp(policy: ServerPolicy = readServerPolicy()) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', policy.trustedProxies.length ? policy.trustedProxies : false);
  app.use(helmet({ strictTransportSecurity: policy.publicMode ? undefined : false }));
  app.use('/api', requestBoundary(policy), rateAdmission(policy));
  app.get('/api/access', (_req, res) => { res.json({ requiresKey: Boolean(policy.accessKey) }); });
  app.use('/api', requireAccess(policy));
  app.get('/api/access/check', (_req, res) => { res.sendStatus(204); });
  app.get('/api/processing', (_req, res) => {
    const primary = resolveProvider(process.env.AI_PROVIDER);
    const fallback = resolveFallbackProvider(primary.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ primary: primary.id, fallback: fallback?.id ?? null });
  });
  const admit = jobAdmission(policy);
  app.post('/api/compare', requireJson, express.json({ limit: '2mb', inflate: false }), admit, compareRoute);
  app.post('/api/analyze', requireJson, express.json({ limit: '512kb', inflate: false }), admit, analyzeRoute);
  app.use('/api', (_req, res) => sendApiError(res, 404, 'NOT_FOUND', 'API endpoint not found.'));
  app.use(parserErrors);
  return app;
}
