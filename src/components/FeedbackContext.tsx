import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuditSnapshot, FeedbackStore } from '../types/feedback';
import { emptyFeedbackStore, FEEDBACK_STORAGE_KEY, parseFeedbackStore, removeHistoryFeedback } from '../services/feedbackStore';
import { usePrivacy } from './PrivacyContext';

type StoreContext = {
  store: FeedbackStore;
  error: string | null;
  update: (change: (previous: FeedbackStore) => FeedbackStore) => boolean;
  clear: () => boolean;
  clearSaved: () => boolean;
  removeHistory: (ids: string[]) => boolean;
};
const FeedbackContext = createContext<StoreContext | null>(null);
export const AuditFeedbackContext = createContext<{ snapshot: AuditSnapshot; originalPrompt: string } | null>(null);

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : 'Local feedback storage failed.';
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { privateSession } = usePrivacy();
  const [initial] = useState(() => {
    try { return { store: privateSession ? emptyFeedbackStore() : parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY)), error: null }; }
    catch (error) { return { store: emptyFeedbackStore(), error: `Could not load feedback: ${failureText(error)}` }; }
  });
  const [store, setStore] = useState(initial.store);
  const currentStore = useRef(initial.store);
  const acceptingUpdates = useRef(true);
  useEffect(() => {
    acceptingUpdates.current = true;
    return () => { acceptingUpdates.current = false; };
  }, []);
  const [error, setError] = useState<string | null>(initial.error);
  const [blocked, setBlocked] = useState(Boolean(initial.error));
  const update = (change: (previous: FeedbackStore) => FeedbackStore) => {
    if (!acceptingUpdates.current) {
      setError('Feedback operation canceled because session privacy or access changed. Run a new audit before saving.');
      return false;
    }
    if (blocked) {
      setError('Saved feedback could not be loaded. Explicitly clear feedback before saving new reports.');
      return false;
    }
    try {
      const latest = privateSession ? currentStore.current : parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY));
      const next = parseFeedbackStore(JSON.stringify(change(latest)));
      if (!privateSession) localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next));
      currentStore.current = next;
      setStore(next);
      setError(null);
      return true;
    } catch (failure) {
      setError(`Feedback was not saved: ${failureText(failure)}`);
      return false;
    }
  };
  const clearSaved = () => {
    try {
      localStorage.removeItem(FEEDBACK_STORAGE_KEY);
      currentStore.current = emptyFeedbackStore();
      setStore(emptyFeedbackStore());
      setError(null);
      setBlocked(false);
      return true;
    } catch (failure) {
      setError(`Could not clear feedback: ${failureText(failure)}`);
      return false;
    }
  };
  const clear = () => {
    if (!privateSession) return clearSaved();
    currentStore.current = emptyFeedbackStore();
    setStore(emptyFeedbackStore());
    setError(null);
    setBlocked(false);
    return true;
  };
  const removeHistory = (ids: string[]) => {
    try {
      const latest = parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY));
      const next = removeHistoryFeedback(latest, ids);
      if (next.audits.length !== latest.audits.length) localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next));
      if (!privateSession) { currentStore.current = next; setStore(next); }
      setError(null);
      return true;
    } catch (failure) {
      setError(`Associated feedback was not deleted: ${failureText(failure)}`);
      return false;
    }
  };
  return <FeedbackContext.Provider value={{ store, error, update, clear, clearSaved, removeHistory }}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('Feedback controls require a FeedbackProvider.');
  return context;
}

export function useOptionalFeedback() { return useContext(FeedbackContext); }

export function useAuditFeedback() { return useContext(AuditFeedbackContext); }

export function FeedbackStorageControls() {
  const { store, error, clear, update } = useFeedback();
  const { privateSession } = usePrivacy();
  return <div className="text-xs text-zinc-400 space-y-2">
    <p>{privateSession ? 'Private feedback stays in page memory and is discarded on mode change.' : 'Feedback is local to this browser. Saving a report retains its original response and automated snapshot, never the private prompt.'}
      {' '}Human corrections are separate annotations; they never rewrite automated scores or evidence.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <button type="button" className="underline" disabled={!error && !store.audits.length}
      onClick={() => { if (window.confirm('Clear all local feedback, automated snapshots and export receipts?')) clear(); }}>Clear feedback</button>
    <ul>{store.audits.map(audit => <li key={audit.auditId}>
      <span>{audit.response.slice(0, 40)}</span>{' '}
      <button className="underline" aria-label={`Delete feedback record: ${audit.auditId}`} onClick={() => {
        update(previous => ({ ...previous, audits: previous.audits.filter(item => item.auditId !== audit.auditId),
          reports: previous.reports.filter(item => item.auditId !== audit.auditId),
          receipts: previous.receipts.filter(item => item.auditId !== audit.auditId) }));
      }}>Delete feedback and snapshot</button>
    </li>)}</ul>
  </div>;
}
