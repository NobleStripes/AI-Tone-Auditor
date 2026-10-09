import { createContext, useContext, useState, type ReactNode } from 'react';
import type { AuditSnapshot, FeedbackStore } from '../types/feedback';
import { emptyFeedbackStore, FEEDBACK_STORAGE_KEY, parseFeedbackStore } from '../services/feedbackStore';

type StoreContext = {
  store: FeedbackStore;
  error: string | null;
  update: (change: (previous: FeedbackStore) => FeedbackStore) => boolean;
  clear: () => boolean;
};
const FeedbackContext = createContext<StoreContext | null>(null);
export const AuditFeedbackContext = createContext<{ snapshot: AuditSnapshot; originalPrompt: string } | null>(null);

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : 'Local feedback storage failed.';
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    try { return { store: parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY)), error: null }; }
    catch (error) { return { store: emptyFeedbackStore(), error: `Could not load feedback: ${failureText(error)}` }; }
  });
  const [store, setStore] = useState(initial.store);
  const [error, setError] = useState<string | null>(initial.error);
  const [blocked, setBlocked] = useState(Boolean(initial.error));
  const update = (change: (previous: FeedbackStore) => FeedbackStore) => {
    if (blocked) {
      setError('Saved feedback could not be loaded. Explicitly clear feedback before saving new reports.');
      return false;
    }
    try {
      const latest = parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY));
      const next = parseFeedbackStore(JSON.stringify(change(latest)));
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next));
      setStore(next);
      setError(null);
      return true;
    } catch (failure) {
      setError(`Feedback was not saved: ${failureText(failure)}`);
      return false;
    }
  };
  const clear = () => {
    try {
      localStorage.removeItem(FEEDBACK_STORAGE_KEY);
      setStore(emptyFeedbackStore());
      setError(null);
      setBlocked(false);
      return true;
    } catch (failure) {
      setError(`Could not clear feedback: ${failureText(failure)}`);
      return false;
    }
  };
  return <FeedbackContext.Provider value={{ store, error, update, clear }}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('Feedback controls require a FeedbackProvider.');
  return context;
}

export function useOptionalFeedback() { return useContext(FeedbackContext); }

export function useAuditFeedback() { return useContext(AuditFeedbackContext); }

export function FeedbackStorageControls() {
  const { store, error, clear } = useFeedback();
  return <div className="text-xs text-zinc-400 space-y-2">
    <p>Feedback is local to this browser. Saving a report retains its original response and automated snapshot, never the private prompt.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <button type="button" className="underline" disabled={!error && !store.audits.length}
      onClick={() => { if (window.confirm('Clear all local feedback, automated snapshots and export receipts?')) clear(); }}>Clear feedback</button>
  </div>;
}
