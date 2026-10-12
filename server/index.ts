import 'dotenv/config';
import { createApp } from './app';
import { readServerPolicy } from './security';

try {
  const policy = readServerPolicy();
  const app = createApp(policy);
  const server = app.listen(policy.port, policy.host, () => {
    console.log(`API server listening on ${policy.publicMode ? 'protected' : 'local'} interface, port ${policy.port}`);
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('error', () => { console.error('API server could not start. Check listener configuration.'); process.exitCode = 1; });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid server configuration.');
  process.exitCode = 1;
}
