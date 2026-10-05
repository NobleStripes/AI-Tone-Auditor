import express from 'express';
import { analyzeRoute } from './routes/analyze';
import { compareRoute } from './routes/compare';

export function createApp() {
  const app = express();
  app.post('/api/compare', express.json({ limit: '2mb' }), compareRoute);
  app.use(express.json({ limit: '512kb' }));
  app.post('/api/analyze', analyzeRoute);
  return app;
}
