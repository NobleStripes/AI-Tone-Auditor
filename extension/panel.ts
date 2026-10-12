import { localHeuristicProvider } from '../src/services/providers/localHeuristicProvider';
import { applyLocalPromptComparison } from '../src/services/localPromptComparison';
import { ANALYSIS_PROMPT_VERSION } from '../src/services/promptBuilder';
import { createAnalysisProvenance } from '../src/services/auditProvenance';
import { createAuditExport } from '../src/services/exportReport';
import { applyAnthropomorphismGuard } from '../src/services/anthropomorphismGuard';
import { suggestPassageRewrites, checkedRewritePassage, passageDiff, applyPassageRewrite } from '../src/services/passageRewrite';
import { ANALYSIS_SOURCES, DEFAULT_LOCAL_RUNTIME_META, type AnalyzeToneOutput } from '../src/types/provider';
import type { AnalysisResult } from '../src/types/analysis';
import { validateResponseText } from '../src/services/comparisonValidation';
import { validateAnalysisResult } from '../src/services/validation/analysisValidator';
import { normalizeProviderMeta } from '../src/services/auditProvenance';
import type { snapshotWire } from './extraction';
import { CATEGORY_REGISTRY } from '../src/constants';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const preview = element<HTMLTextAreaElement>('preview'); const source = element<HTMLSelectElement>('source');
const prompt = element<HTMLTextAreaElement>('prompt'); const reviewed = element<HTMLInputElement>('reviewed');
const useServer = element<HTMLInputElement>('server'); const status = element('status'); const results = element('results');
const auditButton = element<HTMLButtonElement>('audit'); const watchButton = element<HTMLButtonElement>('watch');
const stopButton = element<HTMLButtonElement>('stop'); const exportButton = element<HTMLButtonElement>('export');
const rewriteButton = element<HTMLButtonElement>('rewrite'); const rewriteArea = element('rewrites');
let snapshot: ReturnType<typeof snapshotWire> | undefined; let completed: AnalyzeToneOutput | undefined;
let stale = false; let watching = false; let busy = false; let generation = 0; let controller: AbortController | undefined;
let permission = false; let port: AuditExtensionPort | undefined;
function controls() {
  auditButton.disabled = !snapshot || stale || !reviewed.checked || watching || busy;
  watchButton.disabled = !snapshot || stale || !reviewed.checked || snapshot.mode !== 'response' || watching || busy;
  stopButton.disabled = !watching; exportButton.disabled = !completed || stale || watching;
  rewriteButton.disabled = !snapshot || stale || watching;
}
function invalidate() { generation++; controller?.abort(); busy = false; completed = undefined; exportButton.disabled = true; results.replaceChildren(); rewriteArea.replaceChildren(); }
function say(message: string) { status.textContent = message; controls(); }
function send(message: unknown) { try { if (!port) throw new Error('No connection.'); port.postMessage(message); } catch { stale = true; invalidate(); say('Page connection ended. Invoke the extension again.'); } }
function node(tag: string, text: string, parent: HTMLElement) { const child = document.createElement(tag); child.textContent = text; parent.append(child); return child; }
function render(result: AnalysisResult, provisional: boolean) {
  results.replaceChildren(); node('h2', provisional ? 'Provisional local findings' : 'Completed snapshot audit', results);
  node('p', provisional ? 'The response is changing. These local wording findings are provisional, use no API calls, and cannot be exported as a completed audit.' : result.summary, results);
  if (!provisional && completed) node('p', `Auditor: ${completed.meta.providerLabel} / ${completed.meta.model}${completed.meta.usedFallback ? ' (fallback)' : ''}`, results);
  if (!provisional) {
    const assessments = node('details', '', results); node('summary', 'Assessment coverage and indices', assessments);
    for (const category of CATEGORY_REGISTRY) {
      const assessment = result.assessments[category.id];
      node('p', `${category.label}: ${assessment.status === 'assessed' ? `${result.scores[category.id]} (${category.kind} index)` : assessment.status}; ${assessment.method}, ${assessment.confidence} confidence. ${assessment.reason}`, assessments);
    }
  }
  const findings = result.findings.filter(item => item.evidence?.verification === 'verified');
  for (const finding of findings) {
    const card = node('article', '', results); node('strong', `${finding.category}${finding.evidence.eligibility === 'excluded' ? ' — inspection only' : ''}`, card);
    node('blockquote', finding.text, card); node('p', finding.explanation, card);
    const button = node('button', 'Show passage on page', card) as HTMLButtonElement;
    button.disabled = finding.evidence.kind === 'response_scope';
    button.addEventListener('click', () => send({ type: 'highlight', id: snapshot.id, evidence: finding.evidence }));
  }
  const guard = result.anthropomorphismGuard;
  if (guard) {
    node('h3', 'Anthropomorphism safeguard', results);
    for (const claim of guard.sourceClaims) {
      const card = node('article', '', results); node('strong', claim.disposition === 'flagged' ? 'AI-feelings claim requiring review' : 'Context-only wording', card);
      node('blockquote', claim.evidence.matchedText, card); node('p', claim.reason, card);
      node('button', 'Show passage on page', card).addEventListener('click', () => send({ type: 'highlight', id: snapshot.id, evidence: claim.evidence }));
    }
    if (guard.blockedFields.length) node('p', `Generated wording withheld: ${guard.blockedFields.join(', ')}`, results);
  }
  if (!findings.length && !guard?.sourceClaims.length) node('p', 'No known wording rule matched. This is not proof of safety or absence of other patterns.', results);
}
async function audit() {
  if (!snapshot || stale || !reviewed.checked || watching || busy) return;
  const captured = snapshot; const selectedSource = ANALYSIS_SOURCES.find(item => item === source.value) ?? 'unknown';
  const originalPrompt = prompt.value;
  const textError = validateResponseText(captured.text); if (textError) { say(textError); return; }
  invalidate(); const currentTicket = generation; completed = undefined; busy = true;
  const requestController = new AbortController(); controller = requestController; say('Auditing the reviewed snapshot…');
  try {
    let output: AnalyzeToneOutput;
    if (useServer.checked) {
      if (!permission) { permission = await chrome.permissions.request({ origins: ['http://127.0.0.1/*'] }); if (!permission) throw new Error('Local API permission was not granted.'); }
      if (currentTicket !== generation) return;
      requestController.signal.throwIfAborted();
      const response = await fetch('http://127.0.0.1:3001/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: captured.text, sourceModel: selectedSource, auditContext: originalPrompt }),
        signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(60_000)]) });
      if (!response.ok) throw new Error(`Local API audit failed (${response.status}).`);
      const data = await response.json(); const meta = normalizeProviderMeta(data.meta);
      if (!meta) throw new Error('Local API did not report its auditing provider.');
      output = { result: applyLocalPromptComparison(validateAnalysisResult(data.result, { responseText: captured.text, assessmentMethod: meta.providerId === 'local' ? 'lexical_rule' : 'semantic' }),
        captured.text, originalPrompt, selectedSource), meta, provenance: data.provenance };
    } else {
      const base = await localHeuristicProvider.analyzeTone({ text: captured.text, context: { promptVersion: ANALYSIS_PROMPT_VERSION, sourceModel: selectedSource } });
      output = { result: applyLocalPromptComparison(base, captured.text, originalPrompt, selectedSource), meta: DEFAULT_LOCAL_RUNTIME_META,
        provenance: createAnalysisProvenance(DEFAULT_LOCAL_RUNTIME_META, selectedSource) };
    }
    if (currentTicket !== generation || stale || snapshot.id !== captured.id) return;
    completed = output; render(output.result, false); say('Audit completed for this captured snapshot.');
  } catch (error) { if (currentTicket === generation) say(error instanceof Error ? error.message : 'Audit failed.'); }
  finally { if (currentTicket === generation) { busy = false; controls(); } }
}

const params = new URLSearchParams(location.search); const tabId = params.has('tab') ? Number(params.get('tab')) : NaN;
if (params.get('error')) say(params.get('error'));
else if (!Number.isInteger(tabId) || tabId < 0) say('Invoke the extension from the page you want to audit.');
else {
  port = chrome.tabs.connect(tabId, { name: 'tone-audit-session' });
  port.onMessage.addListener(message => {
    if (message.type === 'snapshot') {
      const captured = message.snapshot;
      if (!captured || typeof captured.id !== 'string' || typeof captured.text !== 'string' || captured.text.length > 50_000
        || !['selection', 'response'].includes(captured.mode)) { stale = true; invalidate(); say('Invalid capture.'); return; }
      invalidate(); snapshot = captured; stale = false; preview.value = captured.text; reviewed.checked = false;
      if (!watching) source.value = captured.sourceModel;
      element('capture-info').textContent = `${captured.adapter} / ${captured.mode}; extraction ${captured.version}. Review the canonical text; code and quotations retain exclusion markers.`;
      say(watching ? 'Response updated; provisional checks are running.' : 'Capture ready. Review the response before auditing.');
    } else if (message.type === 'invalidated') { stale = true; invalidate(); say('The page response changed; prior passages and results are unavailable. Capture again or wait for the active watch.'); }
    else if (message.type === 'provisional' && watching && snapshot?.id === message.id && !stale) {
      render(applyAnthropomorphismGuard(message.result, snapshot.text), true); say('Provisional local findings. Stop watching and review the final snapshot before completing an audit.');
    } else if (message.type === 'error' || message.type === 'waiting') { if (message.type === 'error') { watching = false; stale = true; invalidate(); } say(String(message.message)); }
  });
  port.onDisconnect.addListener(() => { stale = true; watching = false; invalidate(); say('Page connection ended. Invoke the extension again.'); });
}
element('selection').addEventListener('click', () => { watching = false; stale = true; reviewed.checked = false; invalidate(); send({ type: 'capture-selection' }); say('Capturing the selected passage…'); });
element('pick').addEventListener('click', () => { watching = false; stale = true; reviewed.checked = false; invalidate(); send({ type: 'start-pick' }); say('Click a supported assistant response on the page.'); });
element('cancel').addEventListener('click', () => { watching = false; invalidate(); snapshot = undefined; preview.value = ''; reviewed.checked = false; send({ type: 'clear' }); say('Capture cleared.'); });
reviewed.addEventListener('change', () => { if (!reviewed.checked) invalidate(); controls(); });
source.addEventListener('change', () => { invalidate(); reviewed.checked = false; if (watching) { watching = false; send({ type: 'stop-watch' }); } controls(); });
prompt.addEventListener('input', () => { invalidate(); controls(); });
useServer.addEventListener('change', () => { invalidate(); controls(); });
auditButton.addEventListener('click', () => void audit());
watchButton.addEventListener('click', () => { if (watchButton.disabled) return; invalidate(); watching = true; send({ type: 'watch', sourceModel: source.value }); controls(); });
stopButton.addEventListener('click', () => { watching = false; invalidate(); send({ type: 'stop-watch' }); say('Watch stopped; review the current snapshot and audit it explicitly.'); });
exportButton.addEventListener('click', () => {
  if (!completed || !snapshot || stale || watching) return;
  const data = { ...createAuditExport(completed.result, completed.provenance), browserCapture: {
    extractionVersion: snapshot.version, adapter: snapshot.adapter, mode: snapshot.mode, snapshotId: snapshot.id, text: snapshot.text } };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'browser-tone-audit.json'; link.click(); URL.revokeObjectURL(url);
});
rewriteButton.addEventListener('click', () => {
  if (!snapshot || stale || watching) return;
  rewriteArea.replaceChildren();
  try {
    const selected = checkedRewritePassage(snapshot.text, preview.selectionStart, preview.selectionEnd);
    const suggestions = suggestPassageRewrites(snapshot.text, selected.startOffset, selected.endOffset);
    const captured = snapshot;
    node('p', 'Local draft only. Review the diff; the page response and original audit stay unchanged.', rewriteArea);
    const proposed = node('textarea', '', rewriteArea) as HTMLTextAreaElement; proposed.maxLength = 2000; proposed.value = suggestions[0]?.replacement ?? selected.matchedText;
    const diff = node('div', '', rewriteArea); diff.setAttribute('aria-label', 'Passage rewrite diff');
    const draw = () => { diff.replaceChildren(); for (const part of passageDiff(selected.matchedText, proposed.value)) node(part.kind === 'delete' ? 'del' : part.kind === 'insert' ? 'ins' : 'span', part.text, diff); };
    for (const suggestion of suggestions) node('button', suggestion.label, rewriteArea).addEventListener('click', () => { proposed.value = suggestion.replacement; draw(); });
    if (!suggestions.length) node('p', 'No conservative template fits. Draft an alternative manually.', rewriteArea);
    proposed.addEventListener('input', draw); draw();
    node('button', 'Copy revised response', rewriteArea).addEventListener('click', () => void (async () => {
      try {
        if (stale || snapshot?.id !== captured.id) throw new Error('Capture changed; select the passage again.');
        await navigator.clipboard.writeText(applyPassageRewrite(captured.text, { startOffset: selected.startOffset, endOffset: selected.endOffset, original: selected.matchedText, replacement: proposed.value }));
        say('Revised draft copied. The original response is unchanged.');
      } catch (error) { say(error instanceof Error ? error.message : 'Copy failed.'); }
    })());
  } catch (error) { say(error instanceof Error ? error.message : 'Select a passage in the preview.'); }
});
window.addEventListener('unload', () => { controller?.abort(); port?.disconnect(); });
controls();
