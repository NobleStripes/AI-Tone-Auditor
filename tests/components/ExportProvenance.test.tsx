import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '../../src/components/ExportButton';
import { createAnalysisProvenance, AUDITOR_VERSION } from '../../src/services/auditProvenance';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { ANALYSIS_PROMPT_VERSION } from '../../src/services/promptBuilder';
import { LOCAL_RULE_VERSION } from '../../src/services/localRuleVersion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('JSON and Markdown include the actual audit provenance and assessed/N/A categories', async () => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), 'You should verify this yourself.', 'Look this up.', 'grok');
  const provenance = createAnalysisProvenance(
    { providerId: 'anthropic', providerLabel: 'Anthropic', model: 'actual-fallback-model', usedFallback: true },
    'grok', 'comparison-session',
  );
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:provenance');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<ExportButton result={result} provenance={provenance} />);
  await user.click(screen.getByRole('button', { name: 'Export result as JSON' }));
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Expected JSON text'));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(createObjectURL.mock.calls[0][0]);
  });
  const json = JSON.parse(text);
  expect(json.exportMetadata).toMatchObject({
    auditorVersion: AUDITOR_VERSION, promptVersion: ANALYSIS_PROMPT_VERSION, localRuleVersion: LOCAL_RULE_VERSION,
    selectedSourceModel: 'grok', analyzedAt: provenance.analyzedAt, comparisonSessionId: 'comparison-session',
    analysisProvider: { providerId: 'anthropic', model: 'actual-fallback-model', usedFallback: true },
  });
  expect(json.assessments.grounding_avoidance.status).toBe('assessed');
  expect(json.assessments.unsupported_certainty.status).toBe('not_assessed');
  expect(Number.isNaN(Date.parse(json.exportMetadata.exportedAt))).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Copy result as Markdown' }));
  const markdown = writeText.mock.calls[0][0];
  for (const line of [
    `**Auditor version:** ${AUDITOR_VERSION}`,
    `**Prompt version:** ${ANALYSIS_PROMPT_VERSION}`,
    '**Analysis provider ID:** anthropic',
    '**Analysis model:** actual-fallback-model',
    '**Selected source model:** grok',
    '**Comparison session ID:** comparison-session',
    `**Analyzed at (UTC):** ${provenance.analyzedAt}`,
    '**Exported at (UTC):**',
    'assessment state: assessed',
    'assessment state: not_assessed',
  ]) expect(markdown).toContain(line);
});

test('legacy exports identify unknown provenance instead of using the current auditor as historical fact', async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<ExportButton result={emptyAnalysisResult()} />);
  await user.click(screen.getByRole('button', { name: 'Copy result as Markdown' }));
  expect(writeText.mock.calls[0][0]).toContain('**Auditor version:** Unknown (legacy or unrecorded)');
  expect(writeText.mock.calls[0][0]).toContain('**Analysis model:** Unknown (legacy or unrecorded)');
  expect(writeText.mock.calls[0][0]).toContain(`**Exporter version:** ${AUDITOR_VERSION}`);
});
