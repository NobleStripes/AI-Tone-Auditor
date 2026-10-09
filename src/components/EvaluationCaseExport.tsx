import { useState } from 'react';
import { CATEGORY_REGISTRY, type ScoreId } from '../constants';
import { COMPARISON_SOURCES, MAX_ORIGINAL_PROMPT_LENGTH, MAX_RESPONSE_LENGTH, type ComparisonSource } from '../types/comparison';
import { SOURCE_MODEL_LABELS } from '../types/provider';
import type { AuditSnapshot } from '../types/feedback';
import type { IntendedSignal } from '../types/evaluation';
import { evaluationContentHash, suggestExpectations, validateEvaluationExport, type ExpectationDraft } from '../services/evaluationExport';
import { downloadJson } from '../lib/download';
import { useAuditFeedback, useFeedback } from './FeedbackContext';
import { CategoryOptions } from './FindingFeedback';

const inputClass = 'w-full rounded bg-zinc-950 border border-zinc-700 p-2 text-xs';
const newVersion = () => `review-${crypto.randomUUID()}`;

function EvaluationPreview({ snapshot, originalPrompt, onClose }: {
  snapshot: AuditSnapshot; originalPrompt: string; onClose: () => void;
}) {
  const { store, update } = useFeedback();
  const reports = store.reports.filter(report => report.auditId === snapshot.auditId);
  const [caseId, setCaseId] = useState(() => store.receipts.find(receipt => receipt.auditId === snapshot.auditId)?.caseId ?? `case-${crypto.randomUUID()}`);
  const [version, setVersion] = useState(newVersion);
  const [origin, setOrigin] = useState<'synthetic' | 'real_world' | ''>('');
  const [source, setSource] = useState<ComparisonSource | ''>(snapshot.sourceModel === 'unknown' ? '' : snapshot.sourceModel);
  const [model, setModel] = useState('');
  const [collectedAt, setCollectedAt] = useState('');
  const [prompt, setPrompt] = useState(originalPrompt);
  const [response, setResponse] = useState(snapshot.response);
  const [expectations, setExpectations] = useState<ExpectationDraft[]>(() => suggestExpectations(reports));
  const [categoryToAdd, setCategoryToAdd] = useState<ScoreId | ''>('');
  const [privacyNote, setPrivacyNote] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edited = response !== snapshot.response || prompt !== originalPrompt;
  const change = (updateDraft: () => void, changesText = false, renewVersion = true) => {
    updateDraft();
    setReviewed(false);
    setError(null);
    if (changesText) setExpectations(previous => previous.map(item => ({ ...item, confirmed: false })));
    if (exported) { if (renewVersion) setVersion(newVersion()); setExported(false); }
  };
  const payload = {
    schemaVersion: '1.0.0', version,
    ...(origin === 'synthetic' ? { datasetKind: 'synthetic' } : {}),
    cases: [{
      id: caseId, sourceModel: source, model: model.trim() || null, collectedAt: collectedAt.trim() || null,
      originalPrompt: prompt, response,
      privacyReview: { confirmed: reviewed, note: privacyNote },
      expectations: expectations.map(({ categoryId, intendedSignal, note }) => ({ categoryId, intendedSignal, note })),
      baseline: null,
    }],
  };
  const exportCase = async () => {
    setError(null);
    if (!origin || !source) { setError('Select the example origin and response source explicitly.'); return; }
    setBusy(true);
    try {
      const dataset = validateEvaluationExport(payload, origin, expectations);
      const contentHash = await evaluationContentHash(dataset);
      const previous = store.receipts.find(receipt => receipt.origin === origin && receipt.version === version);
      if (previous && previous.contentHash !== contentHash) {
        throw new Error('This dataset version was already exported with different content. Use a new version and retain the old file for replay.');
      }
      if (store.audits.some(audit => audit.auditId === snapshot.auditId
        && JSON.stringify(audit) !== JSON.stringify(snapshot))) throw new Error('Audit snapshot mismatch; export canceled.');
      downloadJson(dataset, `evaluation-${origin}-${caseId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
      const saved = update(current => ({
        ...current,
        audits: current.audits.some(audit => audit.auditId === snapshot.auditId) ? current.audits : [...current.audits, structuredClone(snapshot)],
        receipts: [...current.receipts.filter(receipt => !(receipt.origin === origin && receipt.version === version)),
          { auditId: snapshot.auditId, caseId, version, origin, reportIds: reports.map(report => report.id),
            exportedAt: new Date().toISOString(), contentHash }],
      }));
      setExported(true);
      if (!saved) setError('Download initiated, but its local reference receipt was not saved. The storage error is shown above.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Evaluation export failed.');
    } finally { setBusy(false); }
  };
  const updateExpectation = (index: number, updateDraft: Partial<ExpectationDraft>) => change(() =>
    setExpectations(previous => previous.map((item, i) => i === index ? { ...item, ...updateDraft } : item)));

  return <section aria-label="Evaluation case preview" className="space-y-3 border border-zinc-700 rounded p-4">
    <h3 className="font-semibold">Privacy-reviewed evaluation case</h3>
    <p className="text-xs">Draft stays in memory. Nothing is collected automatically. Download intentionally includes the sanitized prompt and response.
      Local feedback retains the original response/snapshot; exported cases never change automated scores.</p>
    <p className="text-xs">Audit reference: {snapshot.auditId}. Reports: {reports.map(report => report.id).join(', ') || 'none'}.
      These references are not added to the strict dataset payload.</p>
    {edited && <p role="status" className="text-xs text-amber-300">Reviewed derivative: original evidence offsets apply only to the original audit, not this edited case.</p>}
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-xs">Example origin
        <select className={inputClass} value={origin} onChange={event => change(() => setOrigin(
          event.target.value === 'synthetic' ? 'synthetic' : event.target.value === 'real_world' ? 'real_world' : ''))}>
          <option value="">Select origin</option><option value="real_world">Genuine model response (manually verified origin)</option>
          <option value="synthetic">Synthetic / authored example</option>
        </select>
      </label>
      <label className="block text-xs">Dataset version <input className={inputClass} maxLength={128} value={version} onChange={event => change(() => setVersion(event.target.value), false, false)} /></label>
      <label className="block text-xs">Case ID <input className={inputClass} maxLength={128} value={caseId} onChange={event => change(() => setCaseId(event.target.value))} /></label>
      <label className="block text-xs">Response source
        <select className={inputClass} value={source} onChange={event => change(() => setSource(COMPARISON_SOURCES.find(item => item === event.target.value) ?? ''), true)}>
          <option value="">Select response source</option>{COMPARISON_SOURCES.map(item => <option key={item} value={item}>{SOURCE_MODEL_LABELS[item]}</option>)}
        </select>
      </label>
      <label className="block text-xs">Response model/version (unknown: leave blank)
        <input className={inputClass} value={model} maxLength={5000} onChange={event => change(() => setModel(event.target.value))} />
      </label>
      <label className="block text-xs">Collection date (UTC ISO; unknown: leave blank)
        <input className={inputClass} value={collectedAt} placeholder="YYYY-MM-DDTHH:mm:ssZ" onChange={event => change(() => setCollectedAt(event.target.value))} />
      </label>
      <label className="block text-xs">Sanitized original prompt {originalPrompt ? '' : '(unavailable; supply explicitly or leave empty)'}
        <textarea className={`${inputClass} h-24`} maxLength={MAX_ORIGINAL_PROMPT_LENGTH} value={prompt} onChange={event => change(() => setPrompt(event.target.value), true)} />
      </label>
      <label className="block text-xs">Sanitized response
        <textarea className={`${inputClass} h-36`} maxLength={MAX_RESPONSE_LENGTH} value={response} onChange={event => change(() => setResponse(event.target.value), true)} />
      </label>
      <p className="text-xs">Confirm labels for the full response. A false-positive passage can coexist with valid signals elsewhere.
        Refusal Quality means positive quality at index &gt;=60, not deficiency. Unsupported or contextless checks can remain unassessed in local replay.</p>
      {expectations.map((item, index) => <fieldset key={item.categoryId} className="border border-zinc-700 p-3 space-y-2 text-xs">
        <legend>{CATEGORY_REGISTRY.find(category => category.id === item.categoryId)?.label}</legend>
        {item.conflict && <p className="text-amber-300">Conflicting passage feedback: resolve the whole-response label explicitly.</p>}
        {item.reportIds.length > 0 && <p>Contributing reports: {item.reportIds.join(', ')}</p>}
        <label className="block">Whole-response signal
          <select className={inputClass} value={item.intendedSignal} onChange={event => {
            const signal = (['present', 'absent', 'ambiguous'] as const).find(value => value === event.target.value);
            if (signal) updateExpectation(index, { intendedSignal: signal, confirmed: false });
          }}><option value="present">Present</option><option value="absent">Absent</option><option value="ambiguous">Ambiguous</option></select>
        </label>
        <label className="block">Expectation notes
          <textarea className={inputClass} maxLength={5000} value={item.note} onChange={event => updateExpectation(index, { note: event.target.value, confirmed: false })} />
        </label>
        <label><input type="checkbox" checked={item.confirmed} onChange={event => updateExpectation(index, { confirmed: event.target.checked })} /> I reviewed this category across the full edited response.</label>
        <button type="button" className="block underline" onClick={() => change(() => setExpectations(previous => previous.filter((_, i) => i !== index)))}>Remove expectation</button>
      </fieldset>)}
      <label className="block text-xs">Add expectation category
        <select className={inputClass} value={categoryToAdd} onChange={event => setCategoryToAdd(CATEGORY_REGISTRY.find(item => item.id === event.target.value)?.id ?? '')}>
          <option value="">Select category</option><CategoryOptions />
        </select>
      </label>
      <button type="button" className="text-xs underline" disabled={!categoryToAdd || expectations.some(item => item.categoryId === categoryToAdd)}
        onClick={() => { if (categoryToAdd) change(() => setExpectations(previous => [...previous, {
          categoryId: categoryToAdd, intendedSignal: 'ambiguous' as IntendedSignal, note: '', confirmed: false, conflict: false, reportIds: [],
        }])); }}>Add expectation</button>
      <p className="text-xs">Baseline: null. Response model and collection date remain null when unknown; auditor metadata is not source metadata.</p>
      <label className="block text-xs">Privacy review notes
        <textarea className={inputClass} maxLength={5000} value={privacyNote} onChange={event => change(() => setPrivacyNote(event.target.value))} />
      </label>
      <label className="block text-xs"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I completed privacy review of the prompt, response, identifiers, metadata and all notes; I verified the stated origin.</label>
      <details><summary className="text-xs">Exact dataset preview</summary><pre className="overflow-auto max-h-64 text-xs whitespace-pre-wrap">{JSON.stringify(payload, null, 2)}</pre></details>
      {error && <p role="alert" className="text-red-400 text-xs">{error}</p>}
      {exported && <p role="status" className="text-xs">Evaluation case download initiated. Retain this version for replay; edited exports need a new version.</p>}
      <button type="button" className="text-xs underline mr-4" disabled={!reviewed || !privacyNote.trim() || !origin || !source || !expectations.length || expectations.some(item => !item.confirmed)}
        onClick={exportCase}>Download evaluation case</button>
      <button type="button" className="text-xs underline" onClick={onClose}>Cancel evaluation draft</button>
    </fieldset>
  </section>;
}

export function EvaluationCaseExport() {
  const context = useAuditFeedback();
  const [open, setOpen] = useState(false);
  if (!context) return null;
  return <div className="space-y-3">
    <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>Export evaluation case</button>
    {open && <EvaluationPreview key={context.snapshot.auditId} snapshot={context.snapshot} originalPrompt={context.originalPrompt} onClose={() => setOpen(false)} />}
  </div>;
}
