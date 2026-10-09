import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyAnalysisResult } from '../../src/types/analysis';
import type { AuditSnapshot } from '../../src/types/feedback';
import { AuditFeedbackContext, FeedbackProvider, FeedbackStorageControls } from '../../src/components/FeedbackContext';
import { FindingList } from '../../src/components/FindingList';
import { MissedSignalFeedback } from '../../src/components/FindingFeedback';
import { EvaluationCaseExport } from '../../src/components/EvaluationCaseExport';
import { FEEDBACK_STORAGE_KEY, parseFeedbackStore } from '../../src/services/feedbackStore';
import * as download from '../../src/lib/download';
import { parseSyntheticDataset } from '../../src/services/evaluationValidation';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const result = emptyAnalysisResult();
result.findings = [
  { category: 'Forced De-escalation', text: 'Calm down', explanation: 'First occurrence', severity: 'low',
    evidence: { matchedText: 'Calm down', startOffset: 0, endOffset: 9, verification: 'verified', eligibility: 'included' } },
  { category: 'Forced De-escalation', text: 'Calm down', explanation: 'Second occurrence', severity: 'low',
    evidence: { matchedText: 'Calm down', startOffset: 11, endOffset: 20, verification: 'verified', eligibility: 'included' } },
];
const snapshot: AuditSnapshot = { auditId: 'single:component-test', historyId: 'component-test',
  response: 'Calm down. Calm down.', sourceModel: 'unknown', automatedResultJson: JSON.stringify(result), provenanceJson: null, runtimeMetaJson: null };

function renderControls() {
  return render(<FeedbackProvider><AuditFeedbackContext.Provider value={{ snapshot, originalPrompt: 'Private in-memory test prompt.' }}>
    <FeedbackStorageControls /><FindingList result={result} onNavigate={() => {}} />
    <MissedSignalFeedback /><EvaluationCaseExport />
  </AuditFeedbackContext.Provider></FeedbackProvider>);
}

async function saveSecondFeedback(kind = 'False positive') {
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('button', { name: kind })[1]);
  await user.type(screen.getByRole('textbox', { name: 'Reason / review notes' }), 'Authored review note.');
  await user.click(screen.getByRole('button', { name: 'Save feedback locally' }));
  return user;
}

describe('feedback controls', () => {
  test('saving the second repeat persists its own original target, not the first, and never persists the prompt', async () => {
    const before = JSON.stringify(result);
    renderControls();
    await saveSecondFeedback();
    const store = parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY));
    expect(store.reports[0]).toMatchObject({ targetId: 'finding:1', kind: 'false_positive', passage: { startOffset: 11 } });
    expect(store.audits[0].automatedResultJson).toBe(before);
    expect(JSON.stringify(result)).toBe(before);
    expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).not.toContain('Private in-memory');
    cleanup();
    renderControls();
    expect(screen.getByText(/Saved human feedback: False positive/)).toBeInTheDocument();
  });
  test('wrong category requires intended category and a reason', async () => {
    renderControls();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Wrong category' })[0]);
    await user.click(screen.getByRole('button', { name: 'Save feedback locally' }));
    expect(screen.getByRole('alert')).toHaveTextContent('different intended category');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Intended category' }), 'infantilizing');
    await user.type(screen.getByRole('textbox', { name: 'Reason / review notes' }), 'The tone is patronizing, not calming.');
    await user.click(screen.getByRole('button', { name: 'Save feedback locally' }));
    expect(parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY)).reports[0]).toMatchObject({ kind: 'wrong_category', intendedCategoryId: 'infantilizing' });
  });
  test('keyboard-compatible selection preserves repeated phrase offsets and creates no automated finding', async () => {
    renderControls();
    const user = userEvent.setup();
    await user.click(screen.getByText('Report a missed signal', { selector: 'summary' }));
    const selector = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Audited response passage selector' });
    selector.focus();
    selector.setSelectionRange(11, 20);
    fireEvent.select(selector);
    await user.click(screen.getByRole('button', { name: 'Report selected passage' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Reported category' }), 'gaslighting');
    await user.type(screen.getByRole('textbox', { name: 'Reason / review notes' }), 'Authored missed-signal review.');
    await user.click(screen.getByRole('button', { name: 'Save feedback locally' }));
    const store = parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY));
    expect(store.reports[0]).toMatchObject({ kind: 'missed_signal', passage: { startOffset: 11, endOffset: 20, matchedText: 'Calm down' } });
    expect(JSON.parse(store.audits[0].automatedResultJson)).toEqual(result);
  });
  test('storage denial displays an explicit error rather than claiming feedback was saved', async () => {
    renderControls();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage quota exceeded'); });
    await saveSecondFeedback();
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(screen.queryByText(/Saved human feedback/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save feedback locally' })).toBeInTheDocument();
  });
  test('a corrupt feedback store is not automatically overwritten and can be explicitly cleared', async () => {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, '{ broken');
    renderControls();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load feedback');
    expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).toBe('{ broken');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear feedback' }));
    expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

async function completePreview() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Export evaluation case' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Example origin' }), 'synthetic');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Response source' }), 'other');
  await user.click(screen.getByRole('checkbox', { name: /reviewed this category/ }));
  await user.type(screen.getByRole('textbox', { name: 'Privacy review notes' }), 'Authored example with no personal identifiers.');
  await user.click(screen.getByRole('checkbox', { name: /completed privacy review/ }));
  return user;
}

test('privacy-reviewed download uses exact dataset schema, null baseline/metadata, and no feedback fields', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const downloadJson = vi.spyOn(download, 'downloadJson').mockImplementation(() => {});
  renderControls();
  await saveSecondFeedback();
  const user = await completePreview();
  await user.click(screen.getByRole('button', { name: 'Download evaluation case' }));
  await waitFor(() => expect(downloadJson).toHaveBeenCalledTimes(1));
  const dataset = parseSyntheticDataset(downloadJson.mock.calls[0][0]);
  expect(dataset.cases[0]).toMatchObject({
    originalPrompt: 'Private in-memory test prompt.', response: snapshot.response,
    model: null, collectedAt: null, baseline: null, expectations: [{ categoryId: 'de_escalation', intendedSignal: 'absent' }],
  });
  expect(dataset.cases[0]).not.toHaveProperty('auditId');
  await waitFor(() => expect(parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY)).receipts).toHaveLength(1));
  expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).not.toContain('Private in-memory');
});

test('edits invalidate privacy review and full-response labels; cancel never persists a draft', async () => {
  renderControls();
  await saveSecondFeedback();
  const user = await completePreview();
  expect(screen.getByRole('button', { name: 'Download evaluation case' })).toBeEnabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Sanitized response' }), { target: { value: 'Edited reviewed response.' } });
  expect(screen.getByRole('checkbox', { name: /completed privacy review/ })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /reviewed this category/ })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Download evaluation case' })).toBeDisabled();
  expect(screen.getByText(/Reviewed derivative:/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel evaluation draft' }));
  expect(screen.queryByRole('region', { name: 'Evaluation case preview' })).not.toBeInTheDocument();
  expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).not.toContain('Edited reviewed response');
  expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).not.toContain('Private in-memory');
});

test('changing metadata after privacy confirmation requires another review', async () => {
  renderControls();
  await saveSecondFeedback('Ambiguous');
  await completePreview();
  fireEvent.change(screen.getByRole('textbox', { name: /Response model/ }), { target: { value: 'known-model' } });
  expect(screen.getByRole('checkbox', { name: /completed privacy review/ })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Download evaluation case' })).toBeDisabled();
});
