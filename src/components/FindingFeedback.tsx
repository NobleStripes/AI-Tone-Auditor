import { useState } from 'react';
import { CATEGORY_REGISTRY, type ScoreId } from '../constants';
import type { Finding } from '../types/analysis';
import type { Evidence } from '../types/evidence';
import { FEEDBACK_KINDS, FEEDBACK_LABELS, type AuditSnapshot, type FeedbackKind } from '../types/feedback';
import { checkedPassage, saveFeedbackReport } from '../services/feedbackStore';
import { useAuditFeedback, useFeedback } from './FeedbackContext';

const inputClass = 'w-full rounded bg-zinc-950 border border-zinc-700 p-2 text-xs';

export function CategoryOptions() {
  return <>{CATEGORY_REGISTRY.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</>;
}

export function FeedbackEditor({ snapshot, targetId, initialCategory, passage, initialKind, onClose }: {
  snapshot: AuditSnapshot; targetId: string; initialCategory?: ScoreId; passage?: Evidence;
  initialKind: FeedbackKind; onClose: () => void;
}) {
  const { store, update } = useFeedback();
  const saved = store.reports.find(report => report.auditId === snapshot.auditId && report.targetId === targetId);
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [category, setCategory] = useState<ScoreId | ''>(saved?.categoryId ?? initialCategory ?? '');
  const [intended, setIntended] = useState<ScoreId | ''>(saved?.intendedCategoryId ?? '');
  const [note, setNote] = useState(saved?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!category || !note.trim() || (kind === 'wrong_category' && (!intended || intended === category))) {
      setError('Select a category, add a reason, and select a different intended category for Wrong category.');
      return;
    }
    if (kind === 'missed_signal' && passage?.verification !== 'verified') {
      setError('A missed signal requires an exact selected passage.');
      return;
    }
    const now = new Date().toISOString();
    const success = update(previous => saveFeedbackReport(previous, snapshot, {
      id: saved?.id ?? crypto.randomUUID(), auditId: snapshot.auditId, targetId, kind, categoryId: category,
      ...(kind === 'wrong_category' && intended ? { intendedCategoryId: intended } : {}),
      note, ...(passage ? { passage } : {}), createdAt: saved?.createdAt ?? now, updatedAt: now,
    }));
    if (success) onClose();
  };
  return <fieldset className="space-y-2 border border-zinc-700 rounded p-3">
    <legend className="text-xs">Human feedback (automated result unchanged)</legend>
    <label className="block text-xs">Feedback
      <select className={inputClass} value={kind} onChange={event => {
        const value = FEEDBACK_KINDS.find(kind => kind === event.target.value);
        if (value) setKind(value);
      }}>
        {Object.entries(FEEDBACK_LABELS).filter(([key]) => initialKind === 'missed_signal' ? key === 'missed_signal' : key !== 'missed_signal')
          .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <label className="block text-xs">Reported category
      <select className={inputClass} value={category} onChange={event => setCategory(CATEGORY_REGISTRY.find(item => item.id === event.target.value)?.id ?? '')}>
        <option value="">Select category</option><CategoryOptions />
      </select>
    </label>
    {kind === 'wrong_category' && <label className="block text-xs">Intended category
      <select className={inputClass} value={intended} onChange={event => setIntended(CATEGORY_REGISTRY.find(item => item.id === event.target.value)?.id ?? '')}>
        <option value="">Select intended category</option><CategoryOptions />
      </select>
    </label>}
    {passage && <p className="text-xs">Passage: "{passage.matchedText}" ({passage.verification}; original automated evidence status is not changed)</p>}
    <label className="block text-xs">Reason / review notes
      <textarea className={inputClass} maxLength={5000} value={note} onChange={event => setNote(event.target.value)} />
    </label>
    {error && <p role="alert" className="text-red-400 text-xs">{error}</p>}
    <button type="button" className="text-xs underline mr-4" onClick={save}>Save feedback locally</button>
    <button type="button" className="text-xs underline" onClick={onClose}>Cancel feedback</button>
  </fieldset>;
}

function FindingFeedbackActions({ finding, targetId, snapshot }: { finding: Finding; targetId: string; snapshot: AuditSnapshot }) {
  const { store, update } = useFeedback();
  const [editing, setEditing] = useState<FeedbackKind | null>(null);
  const saved = store.reports.find(report => report.auditId === snapshot.auditId && report.targetId === targetId);
  const category = CATEGORY_REGISTRY.find(item => item.label === finding.category || item.id === finding.category)?.id;
  return <div className="mt-3 space-y-2">
    <div className="flex flex-wrap gap-3" aria-label="Finding feedback">
      {(['supported', 'false_positive', 'ambiguous', 'wrong_category'] as const).map(kind =>
        <button type="button" key={kind} className="text-xs underline text-zinc-300" onClick={() => setEditing(kind)}>{FEEDBACK_LABELS[kind]}</button>)}
    </div>
    {saved && <div className="text-xs">
      <p role="status">Saved human feedback: {FEEDBACK_LABELS[saved.kind]} - {saved.note}</p>
      <button type="button" className="underline" onClick={() => update(previous => ({
        ...previous, reports: previous.reports.filter(report => report.id !== saved.id),
      }))}>Delete feedback</button>
    </div>}
    {editing && <FeedbackEditor key={`${targetId}:${editing}`} snapshot={snapshot} targetId={targetId}
      initialCategory={category} passage={finding.evidence} initialKind={editing} onClose={() => setEditing(null)} />}
  </div>;
}

export function FindingFeedback({ finding, targetId }: { finding: Finding; targetId: string }) {
  const context = useAuditFeedback();
  return context ? <FindingFeedbackActions key={context.snapshot.auditId} snapshot={context.snapshot} finding={finding} targetId={targetId} /> : null;
}

function MissedSignalSelector({ snapshot }: { snapshot: AuditSnapshot }) {
  const { store, update } = useFeedback();
  const [selection, setSelection] = useState<Evidence | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [editingPassage, setEditingPassage] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reports = store.reports.filter(report => report.auditId === snapshot.auditId && report.kind === 'missed_signal');
  return <details className="border border-zinc-700 rounded p-3 text-xs">
    <summary>Report a missed signal</summary>
    <p className="my-2">Select an unflagged passage below using mouse or keyboard (Shift + arrow keys), then report its category. This does not create an automated finding.</p>
    <textarea aria-label="Audited response passage selector" readOnly className={`${inputClass} h-36`} value={snapshot.response}
      onSelect={event => {
        const element = event.currentTarget;
        if (element.selectionStart === element.selectionEnd) { setSelection(null); return; }
        try { setSelection(checkedPassage(snapshot.response, element.selectionStart, element.selectionEnd)); setError(null); }
        catch (failure) { setSelection(null); setError(failure instanceof Error ? failure.message : 'Invalid passage selection.'); }
      }} />
    <button type="button" className="underline my-2" disabled={!selection} onClick={() => {
      setEditingPassage(selection); setTargetId(`missed:${crypto.randomUUID()}`);
    }}>Report selected passage</button>
    {error && <p role="alert">{error}</p>}
    {targetId && editingPassage && <FeedbackEditor key={targetId} snapshot={snapshot} targetId={targetId} passage={editingPassage}
      initialKind="missed_signal" onClose={() => setTargetId(null)} />}
    {reports.map(report => <div key={report.id} className="my-3">
      <p>Missed signal ({report.categoryId}): "{report.passage?.matchedText}" - {report.note}</p>
      <button type="button" className="underline mr-3" onClick={() => { setEditingPassage(report.passage); setTargetId(report.targetId); }}>Edit missed report</button>
      <button type="button" className="underline" onClick={() => update(previous => ({
        ...previous, reports: previous.reports.filter(item => item.id !== report.id),
      }))}>Delete missed report</button>
    </div>)}
  </details>;
}

export function MissedSignalFeedback() {
  const context = useAuditFeedback();
  return context ? <MissedSignalSelector key={context.snapshot.auditId} snapshot={context.snapshot} /> : null;
}
