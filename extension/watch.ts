import { extractSnapshot, snapshotCurrent, type PageSnapshot } from './extraction';
import { localHeuristicProvider } from '../src/services/providers/localHeuristicProvider';
import { applyLocalPromptComparison } from '../src/services/localPromptComparison';
import { ANALYSIS_PROMPT_VERSION } from '../src/services/promptBuilder';
import type { AnalysisSource } from '../src/types/provider';
import type { AnalysisResult } from '../src/types/analysis';

export interface WatchCallbacks {
  snapshot(snapshot: PageSnapshot): void; invalidated(id: string): void;
  provisional(snapshot: PageSnapshot, result: AnalysisResult): void; error(message: string): void; waiting(message: string): void;
}
export function watchResponse(initial: PageSnapshot, callbacks: WatchCallbacks, source: AnalysisSource = initial.sourceModel,
  audit = async (text: string) => localHeuristicProvider.analyzeTone({ text, context: { promptVersion: ANALYSIS_PROMPT_VERSION } }),
  debounceMs = 250): { stop(): void } {
  if (initial.mode !== 'response' || !snapshotCurrent(initial)) throw new Error('Capture a supported complete response container before watching.');
  let current = initial; let generation = 0; let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { stopped = true; generation++; rootObserver.disconnect(); parentObserver.disconnect(); if (timer) clearTimeout(timer); };
  const update = async () => {
    const ticket = generation;
    try {
      if (!initial.root.isConnected) throw new Error('Response region disappeared; capture it again.');
      const next = extractSnapshot(initial.root, initial.root.ownerDocument.location.href, 'response');
      current = next; callbacks.snapshot(next);
      if (next.text.trim().length < 10) { callbacks.waiting('Waiting for a longer response sample.'); return; }
      const result = await audit(next.text);
      if (stopped || ticket !== generation || !snapshotCurrent(next)) return;
      callbacks.provisional(next, applyLocalPromptComparison(result, next.text, '', source));
    } catch (error) {
      if (stopped || ticket !== generation) return;
      callbacks.invalidated(current.id); stop(); callbacks.error(error instanceof Error ? error.message : 'Extraction failed.');
    }
  };
  const rootObserver = new MutationObserver(() => {
    if (stopped || snapshotCurrent(current)) return;
    generation++; callbacks.invalidated(current.id);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void update(), debounceMs);
  });
  const parentObserver = new MutationObserver(records => {
    if (!stopped && !initial.root.isConnected) { callbacks.invalidated(current.id); stop(); callbacks.error('Response region disappeared; capture it again.'); }
    else if (!stopped && records.some(record => record.type === 'attributes' && record.target !== initial.root && record.target.contains(initial.root)) && !snapshotCurrent(current)) {
      callbacks.invalidated(current.id); stop(); callbacks.error('Response ancestry changed; capture and review it again.');
    }
  });
  rootObserver.observe(initial.root, { subtree: true, childList: true, characterData: true, attributes: true });
  parentObserver.observe(initial.root.ownerDocument.body, { childList: true, subtree: true, attributes: true });
  void update();
  return { stop };
}
