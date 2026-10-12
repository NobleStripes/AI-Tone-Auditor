let accessKey = '';
let rejected = false;
const listeners = new Set<() => void>();

export function apiHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(accessKey ? { Authorization: `Bearer ${accessKey}` } : {}) };
}

export function setApiAccessKey(key: string): void {
  accessKey = key;
  rejected = false;
}

export function rejectApiAccess(): void {
  accessKey = '';
  rejected = true;
  for (const listener of listeners) listener();
}

export function accessWasRejected(): boolean { return rejected; }

export function subscribeToAccessRejection(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function discoverApiAccess(signal: AbortSignal): Promise<boolean> {
  const response = await fetch('/api/access', { signal });
  if (!response.ok) throw new Error('API access configuration is unavailable. Check the server or proxy.');
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error('API access configuration is invalid.'); }
  if (!body || typeof body !== 'object' || !('requiresKey' in body) || typeof body.requiresKey !== 'boolean') {
    throw new Error('API access configuration is invalid.');
  }
  return body.requiresKey;
}

export async function unlockApi(key: string, signal?: AbortSignal): Promise<void> {
  if (!key || key.length > 512) throw new Error('Enter a valid API access key.');
  const response = await fetch('/api/access/check', { headers: { Authorization: `Bearer ${key}` }, signal });
  signal?.throwIfAborted();
  if (!response.ok) throw new Error(response.status === 401 ? 'API access key rejected.' : 'API access verification failed. Try again later.');
  setApiAccessKey(key);
}
