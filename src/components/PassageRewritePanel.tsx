import { useEffect, useState } from 'react';
import type { Evidence } from '../types/evidence';
import { applyPassageRewrite, checkedRewritePassage, passageDiff, suggestPassageRewrites, type PassageRewrite } from '../services/passageRewrite';

export function PassageRewritePanel({ response, selectedEvidence }: {
  response: string; selectedEvidence?: Evidence | null;
}) {
  const [selection, setSelection] = useState<Evidence | null>(null);
  const [suggestions, setSuggestions] = useState<PassageRewrite[]>([]);
  const [replacement, setReplacement] = useState('');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setSuggestions([]); setEditing(false); setNotice('');
    try {
      if (selectedEvidence?.verification === 'verified' && response.slice(selectedEvidence.startOffset, selectedEvidence.endOffset) === selectedEvidence.matchedText) {
        setSelection(checkedRewritePassage(response, selectedEvidence.startOffset, selectedEvidence.endOffset));
      } else setSelection(null);
    } catch { setSelection(null); }
  }, [response, selectedEvidence]);
  const choose = (start: number, end: number) => {
    setSuggestions([]); setEditing(false); setNotice('');
    if (start === end) { setSelection(null); return; }
    try { setSelection(checkedRewritePassage(response, start, end)); }
    catch (error) { setSelection(null); setNotice(error instanceof Error ? error.message : 'Invalid passage.'); }
  };
  const prepare = () => {
    if (!selection) return;
    const found = suggestPassageRewrites(response, selection.startOffset, selection.endOffset);
    setSuggestions(found); setReplacement(found[0]?.replacement ?? selection.matchedText); setEditing(true);
    if (!found.length) setNotice('No conservative local template fits this passage. You can draft an alternative and inspect the diff.');
  };
  const copy = async (whole: boolean) => {
    try {
      const updated = applyPassageRewrite(response, { startOffset: selection.startOffset, endOffset: selection.endOffset,
        original: selection.matchedText, replacement });
      await navigator.clipboard.writeText(whole ? updated : replacement);
      setNotice(whole ? 'Revised response copied. The original audit is unchanged.' : 'Replacement copied. The original audit is unchanged.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Copy failed.'); }
  };
  return <details className="border border-zinc-700 rounded-lg p-3 text-xs">
    <summary className="cursor-pointer">Rewrite a selected passage</summary>
    <p className="my-3 text-zinc-400">Select exact wording below or inspect a finding first. Suggestions use local templates, make no provider calls, and require your review. Copying creates a revised draft; it does not alter the response or audit.</p>
    <textarea aria-label="Rewrite passage selector" readOnly value={response} className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded p-2"
      onSelect={event => choose(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)} />
    {selection && <p className="my-2">Selected: {JSON.stringify(selection.matchedText)}</p>}
    <button type="button" disabled={!selection} className="underline disabled:opacity-40" onClick={prepare}>Suggest passage rewrites</button>
    {editing && selection && <div className="my-3 space-y-3">
      {suggestions.map(item => <div key={item.id}><button type="button" className="underline" onClick={() => setReplacement(item.replacement)}>{item.label}</button><p className="text-zinc-400">{item.rationale}</p></div>)}
      <label className="block">Proposed replacement<textarea aria-label="Proposed replacement" value={replacement} maxLength={2000}
        className="w-full h-24 bg-zinc-950 border border-zinc-700 rounded p-2" onChange={event => { setReplacement(event.target.value); setNotice(''); }} /></label>
      <div aria-label="Passage rewrite diff" className="whitespace-pre-wrap border border-zinc-700 p-2 rounded">
        {passageDiff(selection.matchedText, replacement).map((part, i) => part.kind === 'delete' ? <del key={i} className="bg-red-500/20">{part.text}</del>
          : part.kind === 'insert' ? <ins key={i} className="bg-emerald-500/20">{part.text}</ins> : <span key={i}>{part.text}</span>)}
      </div>
      <button type="button" className="underline mr-4" onClick={() => void copy(false)}>Copy replacement</button>
      <button type="button" className="underline" onClick={() => void copy(true)}>Copy revised response</button>
    </div>}
    {notice && <p role="status" className="mt-3 text-zinc-300">{notice}</p>}
  </details>;
}
