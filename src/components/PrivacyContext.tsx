import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PROVIDER_IDS, type ProviderId } from '../types/provider';
import { apiHeaders, rejectApiAccess } from '../services/apiAccess';
import { useApiAccess } from './ApiAccess';

export interface ProcessingInfo { primary: ProviderId; fallback: ProviderId | null }
const LABELS: Record<ProviderId, string> = {
  local: 'Local heuristic (configured server)', openai: 'OpenAI', anthropic: 'Anthropic',
  gemini: 'Google Gemini', grok: 'xAI Grok',
};
interface PrivacyState {
  privateSession: boolean;
  generation: number;
  processing: ProcessingInfo | null;
  processingError: string | null;
  external: boolean;
  autoAllowed: boolean;
  autoConsent: boolean;
  setAutoConsent: (allowed: boolean) => void;
  togglePrivate: () => void;
  resetSession: () => void;
  cancelOnChange: (cancel: () => void) => () => void;
  retryProcessing: () => void;
}
const PrivacyContext = createContext<PrivacyState>({
  privateSession: false, generation: 0, processing: null, processingError: null,
  external: false, autoAllowed: false, autoConsent: false, setAutoConsent: () => {},
  togglePrivate: () => {}, resetSession: () => {}, cancelOnChange: () => () => {}, retryProcessing: () => {},
});
export function usePrivacy() { return useContext(PrivacyContext); }

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const access = useApiAccess();
  const [privateSession, setPrivate] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [processing, setProcessing] = useState<ProcessingInfo | null>(null);
  const [processingError, setError] = useState<string | null>(null);
  const [autoConsent, setConsent] = useState(false);
  const [retry, setRetry] = useState(0);
  const cancellations = useRef(new Set<() => void>());
  const cancel = useCallback(() => { for (const fn of cancellations.current) fn(); }, []);
  const cancelOnChange = useCallback((fn: () => void) => {
    cancellations.current.add(fn);
    return () => { cancellations.current.delete(fn); };
  }, []);
  useEffect(() => {
    cancel();
    setConsent(false);
    setProcessing(null);
    setError(null);
    if (access.locked) return;
    const controller = new AbortController();
    fetch('/api/processing', { headers: apiHeaders(), signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (response.status === 401) rejectApiAccess();
        if (!response.ok) throw new Error('Data-processing configuration is unavailable.');
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object' || !('primary' in value) || !('fallback' in value)
          || !PROVIDER_IDS.some(id => id === value.primary)
          || !(value.fallback === null || PROVIDER_IDS.some(id => id === value.fallback))) {
          throw new Error('Data-processing configuration is invalid.');
        }
        const primary = PROVIDER_IDS.find(id => id === value.primary)!;
        const fallback = PROVIDER_IDS.find(id => id === value.fallback) ?? null;
        if (!controller.signal.aborted) setProcessing({ primary, fallback });
      }).catch(() => {
        if (!controller.signal.aborted) setError('Data-processing configuration could not be verified. Auditing is disabled; retry before sending text.');
      });
    return () => controller.abort();
  }, [access.locked, retry, cancel]);
  const external = Boolean(processing && (processing.primary !== 'local' || (processing.fallback && processing.fallback !== 'local')));
  return <PrivacyContext.Provider value={{
    privateSession, generation, processing, processingError, external, autoConsent,
    autoAllowed: Boolean(processing) && (!external || autoConsent),
    setAutoConsent: allowed => { cancel(); setConsent(allowed); },
    togglePrivate: () => { cancel(); setPrivate(value => !value); setGeneration(value => value + 1); },
    resetSession: () => { cancel(); setGeneration(value => value + 1); },
    cancelOnChange,
    retryProcessing: () => setRetry(value => value + 1),
  }}>{children}</PrivacyContext.Provider>;
}

export function PrivacyControls() {
  const privacy = usePrivacy();
  return <section aria-label="Privacy and data processing" className="mb-4 space-y-2 text-xs text-zinc-300">
    <label className="flex gap-2"><input type="checkbox" checked={privacy.privateSession} onChange={privacy.togglePrivate} />Private Session</label>
    <p>{privacy.privateSession
      ? 'Private Session: new audits and feedback stay in page memory only. Switching modes discards drafts and private results; existing saved records are unchanged.'
      : 'Normal session: completed single audits are saved in browser history. Feedback snapshots are saved only when you submit feedback or an evaluation export.'}</p>
    <p>Private Session does not disable external providers or control server/provider retention. Downloads and clipboard copies leave the app.</p>
    {privacy.processing ? <>
      <p>Auditor: {LABELS[privacy.processing.primary]}. Fallback: {privacy.processing.fallback ? LABELS[privacy.processing.fallback] : 'none'}.
        {' '}The source-model selection is not the auditor.</p>
      <p>{privacy.external
        ? 'Audits send response text to the configured server and may send it to the third-party auditors listed above, including fallback. External calls may incur charges and are subject to provider retention policies.'
        : 'Audits stay on the configured server; no third-party semantic provider is configured. This is not necessarily your browser or your own computer.'}
        {' '}Original prompts are sent to the server for local context checks, not to semantic providers.</p>
      {privacy.external && <label className="flex gap-2"><input type="checkbox" checked={privacy.autoConsent}
        onChange={event => privacy.setAutoConsent(event.target.checked)} />I allow automatic external audits and possible paid calls for this page session.</label>}
    </> : <p role="status">Auditing is disabled until data-processing information is verified.</p>}
    {privacy.processingError && <><p role="alert">{privacy.processingError}</p><button onClick={privacy.retryProcessing} className="underline">Retry processing information</button></>}
  </section>;
}
