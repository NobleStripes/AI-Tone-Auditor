import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, within, cleanup, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import App from '../../src/App';
import { emptyAnalysisResult } from '../../src/types/analysis';
import type { HistoryEntry } from '../../src/types/history';
import * as analyzeClient from '../../src/services/analyzeClient';
import { createAnalysisProvenance } from '../../src/services/auditProvenance';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { FEEDBACK_STORAGE_KEY, parseFeedbackStore } from '../../src/services/feedbackStore';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  RadarChart: ({ data }: { data: { subject: string }[] }) => <div data-testid="risk-radar">{data.map(({ subject }) => <span key={subject}>{subject}</span>)}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  Radar: () => null,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('a repeated single audit gets a new stable reference and removes the replaced history feedback', async () => {
  const result = emptyAnalysisResult();
  result.findings = [{ category: 'Forced De-escalation', text: 'Calm down', explanation: 'Authored test finding', severity: 'low' }];
  const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
  vi.spyOn(analyzeClient, 'analyzeTone').mockResolvedValue({ result, meta });
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'AI response to audit' }), { target: { value: 'Calm down. Authored single-audit regression input.' } });
  await user.click(screen.getByRole('button', { name: 'Run Audit' }));
  await user.click(await screen.findByRole('button', { name: 'False positive' }));
  await user.type(screen.getByRole('textbox', { name: 'Reason / review notes' }), 'Human test judgment.');
  await user.click(screen.getByRole('button', { name: 'Save feedback locally' }));
  const before = parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY));
  expect(before.reports).toHaveLength(1);
  expect(before.audits[0].historyId).toBe(JSON.parse(localStorage.getItem('audit-history'))[0].id);
  await user.click(screen.getByRole('button', { name: 'Run Audit' }));
  const afterId = JSON.parse(localStorage.getItem('audit-history'))[0].id;
  expect(afterId).not.toBe(before.audits[0].historyId);
  expect(parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY)).reports).toEqual([]);
});

test('deleting the selected history audit deletes its feedback snapshot without changing the original result', async () => {
  const data = emptyAnalysisResult();
  data.findings = [{ category: 'Forced De-escalation', text: 'Calm down', explanation: 'Saved test finding', severity: 'low' }];
  localStorage.setItem('audit-history', JSON.stringify([{
    id: 'stable-legacy', title: 'Authored history', timestamp: 123, sourceModel: 'other', responseText: 'Calm down. Authored history.',
    data, meta: null,
  }]));
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Load audit: Authored history' }));
  await user.click(screen.getByRole('button', { name: 'Supported' }));
  await user.type(screen.getByRole('textbox', { name: 'Reason / review notes' }), 'Human interpretation only.');
  await user.click(screen.getByRole('button', { name: 'Save feedback locally' }));
  const stored = parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY));
  expect(stored.audits[0].automatedResultJson).toBe(JSON.stringify(data));
  await user.click(screen.getByRole('button', { name: 'Delete audit entry: Authored history' }));
  expect(parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY)).audits).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Export evaluation case' })).not.toBeInTheDocument();
});

describe('saved audit presentation', () => {
  test('provides keyboard-operable links to the rendered single-audit sections', async () => {
    const result = emptyAnalysisResult();
    result.euphemisms.push({ term: 'policy', translation: 'rule', context: 'Example context.' });
    const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
    vi.spyOn(analyzeClient, 'analyzeTone').mockResolvedValue({ result, meta });
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'AI response to audit' }), {
      target: { value: 'A response that is long enough for an audit.' },
    });
    await user.click(screen.getByRole('button', { name: 'Run Audit' }));

    const navigation = await screen.findByRole('navigation', { name: 'Single-audit result sections' });
    for (const { label, id } of [
      { label: 'Summary', id: 'audit-summary' },
      { label: 'Findings', id: 'audit-findings' },
      { label: 'Recommendations', id: 'audit-recommendations' },
      { label: 'Personalization', id: 'audit-personalization' },
      { label: 'Diagnostics', id: 'audit-diagnostics' },
      { label: 'Heatmap', id: 'audit-heatmap' },
      { label: 'Glossary', id: 'audit-glossary' },
      { label: 'Trigger analysis', id: 'audit-triggers' },
    ]) {
      expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute('href', `#${id}`);
      expect(document.getElementById(id)).toBeInTheDocument();
    }

    const summaryLink = within(navigation).getByRole('link', { name: 'Summary' });
    summaryLink.focus();
    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('#audit-summary');
  });

  test('omits the glossary jump link when the glossary is not rendered', async () => {
    const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
    vi.spyOn(analyzeClient, 'analyzeTone').mockResolvedValue({ result: emptyAnalysisResult(), meta });
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'AI response to audit' }), {
      target: { value: 'A response that is long enough for an audit.' },
    });
    await user.click(screen.getByRole('button', { name: 'Run Audit' }));

    const navigation = await screen.findByRole('navigation', { name: 'Single-audit result sections' });
    expect(within(navigation).queryByRole('link', { name: 'Glossary' })).not.toBeInTheDocument();
    expect(document.getElementById('audit-glossary')).not.toBeInTheDocument();
  });

  test('auto-audits each response and settings combination only once', async () => {
    vi.useFakeTimers();
    const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
    const analyze = vi.spyOn(analyzeClient, 'analyzeTone').mockResolvedValue({
      result: emptyAnalysisResult(),
      meta,
    });
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'AI response to audit' }), {
      target: { value: 'A long enough response to trigger automatic auditing.' },
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => { await Promise.resolve(); });
    expect(analyze).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    await act(async () => { await Promise.resolve(); });
    expect(analyze).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('combobox', { name: 'Source model' }), {
      target: { value: 'chatgpt' },
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => { await Promise.resolve(); });
    expect(analyze).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    await act(async () => { await Promise.resolve(); });
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  test('explains the minimum length and disables manual audit for shorter input', async () => {
    render(<App />);
    const user = userEvent.setup();
    const response = screen.getByRole('textbox', { name: 'AI response to audit' });
    expect(screen.getByRole('button', { name: 'Run Audit' })).toBeDisabled();
    await user.type(response, '123456789');
    expect(screen.getByRole('button', { name: 'Run Audit' })).toBeDisabled();
    expect(screen.getByText('Enter at least 10 characters to run an audit.')).toBeInTheDocument();
    expect(screen.getByText(/Audits require at least 10; auto-audit starts at 20 characters/)).toBeInTheDocument();
  });

  test('marks results stale when the response changes and keeps result text aligned with its audit', async () => {
    const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
    vi.spyOn(analyzeClient, 'analyzeTone').mockResolvedValue({
      result: emptyAnalysisResult(),
      meta,
    });
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
    const response = screen.getByRole('textbox', { name: 'AI response to audit' });
    const originalText = 'Please calm down; this original response is ready for an audit.';
    await user.type(response, originalText);
    await user.click(screen.getByRole('button', { name: 'Run Audit' }));
    expect(await screen.findByText('Results match the current response and audit settings.')).toBeInTheDocument();

    await user.type(response, ' Edited.');
    expect(screen.getByText(/Results shown below are from the audited response and settings, not the current editor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run new audit' })).toBeEnabled();
    expect(screen.getByText('calm down', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run new audit' }));
    expect(await screen.findByText('Results match the current response and audit settings.')).toBeInTheDocument();
  });

  test('exports the captured audit source, not edited inputs, and resets context when loading a fresh history entry', async () => {
    const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
    const provenance = createAnalysisProvenance(meta, 'chatgpt');
    const text = 'You should look this up yourself.';
    const privatePrompt = 'Search the web for the current Moonlight product rate.';
    const result = applyLocalPromptComparison(emptyAnalysisResult(), text, privatePrompt, 'chatgpt');
    vi.spyOn(analyzeClient, 'analyzeTone').mockResolvedValue({ result, meta, provenance });
    render(<App />);
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Source model' }), 'chatgpt');
    await user.type(screen.getByRole('textbox', { name: 'Original prompt and source context (optional)' }), privatePrompt);
    await user.type(screen.getByPlaceholderText('Paste the AI response here for tone auditing...'), text);
    await user.click(screen.getByRole('button', { name: 'Run Audit' }));
    expect(await screen.findByTestId('diagnostic-grounding_avoidance')).toHaveTextContent('75/100');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Source model' }), 'claude');
    await user.click(screen.getByRole('button', { name: 'Copy result as Markdown' }));
    expect(writeText.mock.calls[0][0]).toContain('**Selected source model:** chatgpt');
    expect(writeText.mock.calls[0][0]).toContain(`**Analyzed at (UTC):** ${provenance.analyzedAt}`);
    expect(writeText.mock.calls[0][0]).not.toContain(privatePrompt);
    await user.click(screen.getByRole('button', { name: `Load audit: ${text.slice(0, 30)}...` }));
    expect(screen.getByTestId('diagnostic-grounding_avoidance')).toHaveTextContent('Insufficient context');
    await user.click(screen.getByRole('button', { name: /Markdown copied|Copy result as Markdown/ }));
    expect(writeText.mock.calls[1][0]).toContain('**Assessment context:** restored_without_prompt');
    expect(writeText.mock.calls[1][0]).toContain(`**Analyzed at (UTC):** ${provenance.analyzedAt}`);
    expect(writeText.mock.calls[1][0]).toContain('assessment state: insufficient_context');
  });
  test('switches between single and comparison modes while retaining single-response drafts', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
    const text = 'A single-response draft to preserve.';
    await user.type(screen.getByPlaceholderText('Paste the AI response here for tone auditing...'), text);
    await user.click(screen.getByRole('tab', { name: 'Multi-model comparison' }));
    expect(screen.getByRole('tabpanel', { name: 'Multi-model comparison' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Original prompt (shared)' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Single response' }));
    expect(screen.getByPlaceholderText('Paste the AI response here for tone auditing...')).toHaveValue(text);
  });

  test('supports keyboard navigation between audit-mode tabs', async () => {
    render(<App />);
    const user = userEvent.setup();
    const single = screen.getByRole('tab', { name: 'Single response' });
    single.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Multi-model comparison' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Multi-model comparison' })).toBeVisible();
    await user.keyboard('{Home}');
    expect(single).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Single response' })).toBeVisible();
  });

  test.each([0, 100])('restores full response without prompt context and separates refusal quality (%s)', async (quality) => {
    const data = emptyAnalysisResult();
    data.scores.refusal_quality = quality;
    for (const key of ['gaslighting', 'infantilizing', 'hedging'] as const) {
      data.assessments[key] = { status: 'assessed', reason: 'Checked response wording.', confidence: 'medium', method: 'semantic' };
    }
    data.assessments.refusal_quality = { status: 'assessed', reason: 'Compared to the original prompt.', confidence: 'medium', method: 'lexical_rule' };
    const entry: HistoryEntry = {
      id: 'saved', title: 'Saved response...', timestamp: 123, sourceModel: 'claude',
      responseText: 'This is the full response, not a truncated title.', data,
      meta: { providerId: 'openai', providerLabel: 'OpenAI', model: 'test', usedFallback: false },
    };
    localStorage.setItem('audit-history', JSON.stringify([entry]));
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
    await user.type(screen.getByRole('textbox', { name: 'Original prompt and source context (optional)' }), 'Private context');
    await user.click(screen.getByRole('button', { name: 'Load audit: Saved response...' }));

    expect(screen.getByPlaceholderText('Paste the AI response here for tone auditing...')).toHaveValue(entry.responseText);
    expect(screen.getByRole('textbox', { name: 'Original prompt and source context (optional)' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Source model' })).toHaveValue('claude');
    expect(within(screen.getByTestId('risk-radar')).queryByText('Refusal Quality')).not.toBeInTheDocument();
    const qualityPanel = screen.getByRole('region', { name: 'Response quality' });
    expect(within(qualityPanel).getByText('Refusal Quality')).toBeInTheDocument();
    expect(within(qualityPanel).getByText('Insufficient context')).toBeInTheDocument();
    expect(screen.getByText('Response Diagnostics')).toBeInTheDocument();
  });
});