import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '../../src/components/ExportButton';
import { PersonalizationProfile } from '../../src/components/PersonalizationProfile';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test.each(['karenRemediation', 'stonewallingRemediation'])('displays and exports %s as stonewalling remediation', async (field) => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const result = validateAnalysisResult({
    scores: { karen_trigger: 70 },
    assessments: { karen_trigger: { status: 'assessed', reason: 'Verified wording.', confidence: 'medium', method: 'semantic' } },
    personalization: { [field]: 'Explain the concrete limit and offer a useful next step.' },
    findings: [{ category: 'Karen Trigger', text: 'Per policy', severity: 'medium', explanation: 'An unexplained barrier.' }],
  }, { responseText: 'Per policy', assessmentMethod: 'semantic' });
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<>
    <PersonalizationProfile personalization={result.personalization} />
    <ExportButton result={result} />
  </>);
  expect(screen.getByText('Stonewalling Remediation Strategy')).toBeInTheDocument();
  expect(screen.getByText(result.personalization.stonewallingRemediation)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Copy result as Markdown' }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining(
    '### Stonewalling Remediation\n\nExplain the concrete limit and offer a useful next step.',
  ));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('### Bureaucratic Stonewalling'));
  expect(JSON.parse(JSON.stringify(result)).personalization).toEqual(expect.objectContaining({
    stonewallingRemediation: 'Explain the concrete limit and offer a useful next step.',
  }));
  expect(JSON.stringify(result)).not.toContain('karenRemediation');
});
