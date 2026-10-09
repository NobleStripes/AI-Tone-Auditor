import { CATEGORY_REGISTRY, type ScoreId } from '../constants';
import type { FeedbackReport } from '../types/feedback';
import type { EvaluationDataset, IntendedSignal } from '../types/evaluation';
import { parseRealWorldDataset, parseSyntheticDataset } from './evaluationValidation';

export interface ExpectationDraft {
  categoryId: ScoreId;
  intendedSignal: IntendedSignal;
  note: string;
  confirmed: boolean;
  conflict: boolean;
  reportIds: string[];
}

export function suggestExpectations(reports: readonly FeedbackReport[]): ExpectationDraft[] {
  const suggestions = new Map<ScoreId, { signal: IntendedSignal; report: FeedbackReport }[]>();
  const add = (categoryId: ScoreId, signal: IntendedSignal, report: FeedbackReport) => {
    const quality = CATEGORY_REGISTRY.find(item => item.id === categoryId)?.kind === 'quality';
    const entries = suggestions.get(categoryId) ?? [];
    entries.push({ signal: quality ? 'ambiguous' : signal, report });
    suggestions.set(categoryId, entries);
  };
  for (const report of reports) {
    if (report.kind === 'wrong_category') {
      add(report.categoryId, 'absent', report);
      if (report.intendedCategoryId) add(report.intendedCategoryId, 'present', report);
    } else add(report.categoryId, report.kind === 'ambiguous' ? 'ambiguous'
      : report.kind === 'false_positive' ? 'absent' : 'present', report);
  }
  return [...suggestions].map(([categoryId, entries]) => {
    const conflict = new Set(entries.map(entry => entry.signal)).size > 1;
    return { categoryId, intendedSignal: conflict ? 'ambiguous' : entries[0].signal,
      note: entries.map(entry => `${entry.report.kind}: ${entry.report.note}`).join('\n'),
      confirmed: false, conflict, reportIds: [...new Set(entries.map(entry => entry.report.id))] };
  });
}

export function validateEvaluationExport(value: unknown, origin: 'synthetic' | 'real_world', expectations: readonly ExpectationDraft[]): EvaluationDataset {
  if (!expectations.length || expectations.some(item => !item.confirmed)) {
    throw new Error('Confirm every category expectation for the full edited response, not just a reported passage.');
  }
  const dataset = origin === 'synthetic' ? parseSyntheticDataset(value) : parseRealWorldDataset(value);
  if (dataset.cases.length !== 1 || JSON.stringify(dataset.cases[0].expectations) !== JSON.stringify(
    expectations.map(({ categoryId, intendedSignal, note }) => ({ categoryId, intendedSignal, note })))) {
    throw new Error('Confirmed expectation labels do not match this one-case export.');
  }
  if (dataset.cases.some(item => item.baseline !== null)) throw new Error('Evaluation exports require a null baseline.');
  return dataset;
}

export async function evaluationContentHash(dataset: EvaluationDataset): Promise<string> {
  if (!crypto.subtle) throw new Error('Evaluation export requires a secure browser context: use localhost or HTTPS.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(dataset)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
