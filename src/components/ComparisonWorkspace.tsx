import { useEffect, useRef, useState } from 'react';
import { compareToneResponses } from '../services/analyzeClient';
import { validateComparisonRequest } from '../services/comparisonValidation';
import { comparisonDifferences } from '../services/comparisonDifferences';
import {
  COMPARISON_SOURCES, MIN_COMPARISON_RESPONSES, MAX_COMPARISON_RESPONSES,
  MAX_RESPONSE_LENGTH, MAX_ORIGINAL_PROMPT_LENGTH,
  type ComparisonResponse, type ComparisonResult,
} from '../types/comparison';
import { SOURCE_MODEL_LABELS } from '../types/provider';
import { DIAGNOSTIC_GROUPS, formatDiagnosticScore } from '../types/diagnostics';
import { ResponseDiagnostics } from './ResponseDiagnostics';
import { FindingCard } from './FindingCard';
import { ExportButton } from './ExportButton';
import { downloadJson } from '../lib/download';

interface ComparisonWorkspaceProps {
  active: boolean;
  onBusyChange: (busy: boolean) => void;
  onCompleted: () => void;
}

export function ComparisonWorkspace({ active, onBusyChange, onCompleted }: ComparisonWorkspaceProps) {
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [responses, setResponses] = useState<ComparisonResponse[]>([
    { id: 'response-1', sourceModel: 'chatgpt', text: '' },
    { id: 'response-2', sourceModel: 'claude', text: '' },
  ]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(3);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => {
    if (!active) controller.current?.abort();
  }, [active]);
  useEffect(() => () => controller.current?.abort(), []);

  const invalidate = () => {
    setComparison(null);
    setError(null);
  };
  const updateResponse = (id: string, change: Partial<Pick<ComparisonResponse, 'sourceModel' | 'text'>>) => {
    invalidate();
    setResponses((items) => items.map((item) => item.id === id ? { ...item, ...change } : item));
  };
  const runComparison = async () => {
    const validated = validateComparisonRequest({ originalPrompt, responses });
    if (validated.valid === false) {
      setError(validated.error);
      return;
    }
    const requestController = new AbortController();
    controller.current = requestController;
    invalidate();
    setBusy(true);
    try {
      const data = await compareToneResponses(validated.value, requestController.signal);
      if (requestController.signal.aborted) {
        setError('Comparison canceled. No incomplete batch is shown.');
      } else {
        setComparison(data);
        onCompleted();
      }
    } catch (failure) {
      if (requestController.signal.aborted || (failure instanceof Error && failure.name === 'AbortError')) {
        setError('Comparison canceled. No incomplete batch is shown.');
      } else {
        console.error('[comparison] request failed:', failure);
        setError(failure instanceof Error ? failure.message : 'Comparison failed.');
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  const differences = comparison ? comparisonDifferences(comparison) : [];
  const hasCompleted = comparison?.items.some((item) => item.status === 'completed');

  return (
    <section aria-label="Multi-model comparison" className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Compare responses to one prompt</h2>
        <p className="text-xs text-zinc-400">
          Paste 2 to 5 responses. Every response uses the same model-agnostic universal rubric;
          eligible Claude and Grok lenses run locally. No overall ranking is calculated.
          Response texts go to the configured auditor; the original prompt stays local to the app/server comparison path.
          Comparison drafts are not saved in audit history.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="comparison-prompt" className="text-sm text-zinc-300">Original prompt (shared)</label>
        <textarea id="comparison-prompt" value={originalPrompt} disabled={busy} maxLength={MAX_ORIGINAL_PROMPT_LENGTH}
          onChange={(event) => { invalidate(); setOriginalPrompt(event.target.value); }}
          className="w-full h-28 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-red-500" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {responses.map((response, index) => (
          <fieldset key={response.id} disabled={busy} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <legend className="px-1 text-sm">Response {index + 1}</legend>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-xs text-zinc-400" htmlFor={`${response.id}-source`}>Source for response {index + 1}</label>
              <select id={`${response.id}-source`} value={response.sourceModel}
                onChange={(event) => {
                  const sourceModel = COMPARISON_SOURCES.find((source) => source === event.target.value);
                  if (sourceModel) updateResponse(response.id, { sourceModel });
                }}
                className="bg-zinc-950 border border-zinc-800 rounded p-2 text-xs">
                {COMPARISON_SOURCES.map((source) => <option key={source} value={source}>{SOURCE_MODEL_LABELS[source]}</option>)}
              </select>
            </div>
            <label htmlFor={`${response.id}-text`} className="sr-only">Response {index + 1} text</label>
            <textarea id={`${response.id}-text`} value={response.text} maxLength={MAX_RESPONSE_LENGTH}
              onChange={(event) => updateResponse(response.id, { text: event.target.value })}
              className="w-full h-36 bg-zinc-950 border border-zinc-800 rounded p-3 text-sm focus:outline-none focus:border-red-500" />
            <button type="button" disabled={responses.length <= MIN_COMPARISON_RESPONSES}
              onClick={() => { invalidate(); setResponses((items) => items.filter(({ id }) => id !== response.id)); }}
              aria-label={`Remove response ${index + 1}`} className="text-xs text-zinc-400 disabled:opacity-40">Remove</button>
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={busy || responses.length >= MAX_COMPARISON_RESPONSES}
          onClick={() => {
            invalidate();
            setResponses((items) => [...items, { id: `response-${nextId.current++}`, sourceModel: COMPARISON_SOURCES[items.length], text: '' }]);
          }}
          className="px-4 py-2 border border-zinc-700 rounded text-xs disabled:opacity-40">Add response</button>
        <button disabled={busy} onClick={runComparison} className="px-4 py-2 bg-red-600 rounded text-sm disabled:opacity-40">Compare responses</button>
        {busy && <button onClick={() => controller.current?.abort()} className="text-sm text-zinc-400">Cancel comparison</button>}
        {busy && <p role="status" className="text-xs text-zinc-400">Auditing responses sequentially with the shared rubric...</p>}
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {comparison && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-lg font-semibold">Observed differences</h3>
            <button onClick={() => downloadJson(comparison, `tone-comparison-${Date.now()}.json`)}
              className="text-xs px-3 py-2 border border-zinc-700 rounded">Export comparison JSON</button>
          </div>
          <p className="text-xs text-zinc-400">
            Rubric {comparison.rubricVersion}; local rules {comparison.localRuleVersion}.
            Scores are indices, not probabilities. Source-specific lenses and different auditors are not treated as directly comparable.
            Quality indices have the opposite direction to risk indices.
          </p>
          {!hasCompleted && <p role="alert" className="text-sm text-red-400">All response audits failed; no comparison is available.</p>}
          {hasCompleted && <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <caption className="sr-only">Category-by-category response differences without an aggregate ranking</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="p-3">Diagnostic</th>
                  {comparison.items.map((item, index) => <th scope="col" key={item.id} className="p-3 min-w-36">{SOURCE_MODEL_LABELS[item.sourceModel]} #{index + 1}</th>)}
                  <th scope="col" className="p-3 min-w-40">Observed spread</th>
                </tr>
              </thead>
              {DIAGNOSTIC_GROUPS.map((group) => (
                <tbody key={group.id}>
                  <tr><th scope="colgroup" colSpan={comparison.items.length + 2} className="p-3 text-left bg-zinc-900">{group.label}</th></tr>
                  {differences.filter(({ category }) => category.group === group.id).map(({ category, spread, note }) => (
                    <tr key={category.id} className="border-b border-zinc-800 align-top">
                      <th scope="row" className="p-3 text-left font-normal">{category.label}{category.kind === 'quality' && <span className="block text-zinc-500">Quality index (higher is better)</span>}</th>
                      {comparison.items.map((item) => (
                        <td key={item.id} className="p-3">
                          {item.status === 'failed' ? <span className="text-red-400">Audit failed</span> : (
                            <>
                              <span>{formatDiagnosticScore(item.analysis.result.scores[category.id], item.analysis.result.assessments[category.id])}</span>
                              {item.analysis.result.assessments[category.id].status === 'assessed' && (
                                <span className="block text-zinc-500 mt-1">
                                  {item.analysis.result.assessments[category.id].method === 'lexical_rule' ? 'Heuristic; match' : 'Evidence'} confidence: {item.analysis.result.assessments[category.id].confidence}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      ))}
                      <td className="p-3">{spread === null ? 'Not compared' : `${spread} index points`}<span className="block mt-1 text-zinc-500">{note}</span></td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>}
          {comparison.items.map((item, index) => item.status === 'failed' ? (
            <p role="alert" key={item.id} className="text-sm text-red-400">{SOURCE_MODEL_LABELS[item.sourceModel]} #{index + 1}: {item.error}</p>
          ) : (
            <details key={item.id} className="border border-zinc-800 rounded-lg p-4">
              <summary className="cursor-pointer text-sm">Inspect {SOURCE_MODEL_LABELS[item.sourceModel]} response #{index + 1}</summary>
              <div className="mt-4 space-y-4">
                <p className="text-xs text-zinc-400">Auditor: {item.analysis.meta.providerLabel} / {item.analysis.meta.model}{item.analysis.meta.usedFallback ? ' (fallback)' : ''}</p>
                <p className="text-sm whitespace-pre-wrap break-words">{item.text}</p>
                <p className="text-xs text-zinc-400">{item.analysis.result.summary}</p>
                <ExportButton result={item.analysis.result} />
                <ResponseDiagnostics result={item.analysis.result} />
                {item.analysis.result.findings.map((finding, findingIndex) => <FindingCard key={findingIndex} finding={finding} index={index * 1000 + findingIndex} />)}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
