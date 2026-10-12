import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { discoverApiAccess, rejectApiAccess, setApiAccessKey, subscribeToAccessRejection, unlockApi } from '../services/apiAccess';

interface AccessState {
  locked: boolean;
  requiresKey: boolean;
  checking: boolean;
  error: string | null;
  unlock: (key: string) => Promise<void>;
  lock: () => void;
  retry: () => void;
}
const ApiAccessContext = createContext<AccessState>({
  locked: false, requiresKey: false, checking: false, error: null,
  unlock: async () => {}, lock: () => {}, retry: () => {},
});

export function useApiAccess(): AccessState { return useContext(ApiAccessContext); }

export function ApiAccessProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(true);
  const [requiresKey, setRequiresKey] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const verification = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setApiAccessKey('');
    setChecking(true);
    setLocked(true);
    discoverApiAccess(controller.signal).then(required => {
      if (controller.signal.aborted) return;
      setRequiresKey(required);
      setLocked(required);
      setError(null);
      setChecking(false);
    }, failure => {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'API access configuration is unavailable.');
      setChecking(false);
    });
    return () => { controller.abort(); verification.current?.abort(); setApiAccessKey(''); };
  }, [generation]);
  useEffect(() => subscribeToAccessRejection(() => { verification.current?.abort(); setRequiresKey(true); setLocked(true); }), []);
  const unlock = async (key: string) => {
    verification.current?.abort();
    const controller = new AbortController();
    verification.current = controller;
    await unlockApi(key, controller.signal);
    controller.signal.throwIfAborted();
    setError(null);
    setLocked(false);
  };
  return <ApiAccessContext.Provider value={{
    locked, requiresKey, checking, error, unlock, lock: rejectApiAccess, retry: () => setGeneration(value => value + 1),
  }}>{children}</ApiAccessContext.Provider>;
}

export function ApiAccessPanel() {
  const access = useApiAccess();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <section aria-label="API access" className="mb-4 space-y-2 text-xs">
    {access.checking ? <p role="status">Checking API access...</p> : access.requiresKey ? <>
      <p>{access.locked ? 'Auditing is locked. Enter the operator access key.' : 'API unlocked for this page only.'} Keys are never saved in browser storage.</p>
      {access.locked ? <form onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try { await access.unlock(key); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'API unlock failed.'); }
        finally { setKey(''); setBusy(false); }
      }} className="flex gap-2">
        <label htmlFor="api-access-key">API access key</label>
        <input id="api-access-key" type="password" autoComplete="off" value={key} maxLength={512}
          onChange={event => setKey(event.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2" />
        <button disabled={busy || !key} className="border border-zinc-700 rounded px-3">{busy ? 'Verifying...' : 'Unlock API'}</button>
      </form> : <button onClick={access.lock} className="border border-zinc-700 rounded px-3 py-1">Lock API</button>}
    </> : null}
    {(error || access.error) && <p role="alert">{error || access.error}</p>}
    {access.error && <button onClick={access.retry}>Retry API access check</button>}
  </section>;
}
