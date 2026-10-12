import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../../src/App';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';
import { getProviderTelemetrySnapshot } from '../../src/services/analyzeClient';
import { FEEDBACK_STORAGE_KEY, parseFeedbackStore } from '../../src/services/feedbackStore';
import { ExportButton } from '../../src/components/ExportButton';
import { FeedbackProvider, useFeedback } from '../../src/components/FeedbackContext';
import { PrivacyControls, PrivacyProvider, usePrivacy } from '../../src/components/PrivacyContext';
import { checkedPassage, saveFeedbackReport } from '../../src/services/feedbackStore';

vi.mock('recharts', () => ({
  ResponsiveContainer: () => null, RadarChart: () => null, PolarGrid: () => null, PolarAngleAxis: () => null, Radar: () => null,
}));
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const responseText = 'Private response text, which must never be persisted.';
function output() {
  return { result: emptyAnalysisResult(), meta: DEFAULT_LOCAL_RUNTIME_META, telemetry: getProviderTelemetrySnapshot() };
}
function mockServer(primary: string, fallback: string | null = null) {
  const requests: string[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const path = String(url);
    requests.push(path);
    if (path === '/api/access') return new Response(JSON.stringify({ requiresKey: false }));
    if (path === '/api/processing') return new Response(JSON.stringify({ primary, fallback }));
    if (path === '/api/analyze') return new Response(JSON.stringify(output()));
    throw new Error('Unexpected test request');
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, fetchMock };
}
async function pause() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); }); }

test.each([['openai', 'local'], ['local', 'anthropic']])('external auto-audit requires session consent for primary %s and fallback %s', async (primary, fallback) => {
  const server = mockServer(primary, fallback);
  const view = render(<App />);
  const consent = await screen.findByLabelText(/I allow automatic external audits/);
  fireEvent.change(screen.getByLabelText('AI response to audit'), { target: { value: responseText } });
  await pause();
  expect(server.requests.filter(path => path === '/api/analyze')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Run Audit' })).toBeEnabled();
  fireEvent.click(consent);
  await waitFor(() => expect(server.requests.filter(path => path === '/api/analyze')).toHaveLength(1), { timeout: 2500 });
  expect(localStorage.getItem('external-auto-consent')).toBeNull();
  view.unmount();
  render(<App />);
  expect(await screen.findByLabelText(/I allow automatic external audits/)).not.toBeChecked();
});

test('unknown processing configuration fails closed and displays a safe retry action', async () => {
  const server = mockServer('invalid-provider');
  render(<App />);
  await screen.findByRole('button', { name: 'Retry processing information' });
  fireEvent.change(screen.getByLabelText('AI response to audit'), { target: { value: responseText } });
  expect(screen.getByRole('button', { name: 'Run Audit' })).toBeDisabled();
  await pause();
  expect(server.requests).not.toContain('/api/analyze');
});

test('private auditing writes no history and never saves a result later when switched back', async () => {
  const server = mockServer('local');
  render(<App />);
  await screen.findByText(/Auditor: Local heuristic/);
  fireEvent.click(screen.getByLabelText('Private Session'));
  fireEvent.change(screen.getByLabelText('AI response to audit'), { target: { value: responseText } });
  fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }));
  await screen.findByRole('navigation', { name: 'Single-audit result sections' });
  expect(localStorage.getItem('audit-history')).toBeNull();
  expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).toBeNull();
  fireEvent.click(screen.getByLabelText('Private Session'));
  expect(screen.getByLabelText('AI response to audit')).toHaveValue('');
  await pause();
  expect(localStorage.getItem('audit-history')).toBeNull();
  expect(server.requests.filter(path => path === '/api/analyze')).toHaveLength(1);
});

test.each(['Private Session', 'external consent'])('%s changes abort in-flight auto-audits and reject late results', async change => {
  const server = mockServer('openai');
  let finish!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  server.fetchMock.mockImplementation(async (url, options) => {
    if (String(url) === '/api/access') return new Response(JSON.stringify({ requiresKey: false }));
    if (String(url) === '/api/processing') return new Response(JSON.stringify({ primary: 'openai', fallback: null }));
    signal = options?.signal;
    return new Promise(resolve => { finish = resolve; });
  });
  render(<App />);
  const consent = await screen.findByLabelText(/I allow automatic external audits/);
  fireEvent.click(consent);
  fireEvent.change(screen.getByLabelText('AI response to audit'), { target: { value: responseText } });
  await waitFor(() => expect(signal).toBeDefined(), { timeout: 2500 });
  fireEvent.click(change === 'Private Session' ? screen.getByLabelText('Private Session') : consent);
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(new Response(JSON.stringify(output()))));
  expect(localStorage.getItem('audit-history')).toBeNull();
  expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).toBeNull();
  expect(screen.queryByRole('navigation', { name: 'Single-audit result sections' })).not.toBeInTheDocument();
});

test('delete-all cancels pending work, removes only app data and cannot be undone by late results', async () => {
  const server = mockServer('local');
  localStorage.setItem('unrelated-origin-setting', 'keep');
  localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify({ schemaVersion: '1.0.0', audits: [], reports: [], receipts: [] }));
  let finish: (response: Response) => void;
  server.fetchMock.mockImplementation(async url => {
    if (String(url) === '/api/access') return new Response(JSON.stringify({ requiresKey: false }));
    if (String(url) === '/api/processing') return new Response(JSON.stringify({ primary: 'local', fallback: null }));
    return new Promise(resolve => { finish = resolve; });
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<App />);
  await screen.findByText(/Auditor: Local heuristic/);
  fireEvent.change(screen.getByLabelText('AI response to audit'), { target: { value: responseText } });
  fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete all stored app data' }));
  await act(async () => finish(new Response(JSON.stringify(output()))));
  expect(localStorage.getItem('audit-history')).toBeNull();
  expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem('unrelated-origin-setting')).toBe('keep');
  expect(screen.queryByRole('navigation', { name: 'Single-audit result sections' })).not.toBeInTheDocument();
});

function FeedbackHarness() {
  const feedback = useFeedback();
  const snapshot = { auditId: 'private-snapshot', response: responseText, sourceModel: 'other' as const,
    automatedResultJson: JSON.stringify(emptyAnalysisResult()), provenanceJson: null, runtimeMetaJson: null };
  return <><PrivacyControls /><button onClick={() => feedback.update(store => saveFeedbackReport(store, snapshot, {
    id: 'human-review', auditId: snapshot.auditId, targetId: 'missed:0', kind: 'missed_signal', categoryId: 'hedging',
    note: 'Human judgment, not automated evidence.', passage: checkedPassage(responseText, 0, 7),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }))}>Save human feedback</button><p>Reports: {feedback.store.reports.length}</p></>;
}
function FeedbackSession() {
  const privacy = usePrivacy();
  return <FeedbackProvider key={privacy.generation}><FeedbackHarness /></FeedbackProvider>;
}
test('private feedback and automated snapshots stay isolated from saved data and are discarded on exit', async () => {
  mockServer('local');
  const original = JSON.stringify({ schemaVersion: '1.0.0', audits: [], reports: [], receipts: [] });
  localStorage.setItem(FEEDBACK_STORAGE_KEY, original);
  render(<PrivacyProvider><FeedbackSession /></PrivacyProvider>);
  fireEvent.click(screen.getByLabelText('Private Session'));
  fireEvent.click(screen.getByRole('button', { name: 'Save human feedback' }));
  expect(screen.getByText('Reports: 1')).toBeInTheDocument();
  expect(localStorage.getItem(FEEDBACK_STORAGE_KEY)).toBe(original);
  fireEvent.click(screen.getByLabelText('Private Session'));
  expect(screen.getByText('Reports: 0')).toBeInTheDocument();
  expect(parseFeedbackStore(localStorage.getItem(FEEDBACK_STORAGE_KEY)).audits).toEqual([]);
});

test('declining export privacy confirmation creates no download or clipboard copy', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<ExportButton result={emptyAnalysisResult()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export result as JSON' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy result as Markdown' }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Original prompts are excluded'));
  expect(click).not.toHaveBeenCalled();
});
