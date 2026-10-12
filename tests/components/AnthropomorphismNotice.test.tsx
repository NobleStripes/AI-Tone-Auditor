import { expect, test } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { applyAnthropomorphismGuard } from '../../src/services/anthropomorphismGuard';
import { ResponseEvidence } from '../../src/components/ResponseEvidence';

test('flags literal claims and navigates to their exact source passage', () => {
  const text = 'Claude has feelings. A factual explanation follows.';
  const result = applyAnthropomorphismGuard(emptyAnalysisResult(), text);
  render(<ResponseEvidence text={text} result={result} indexBase={0} />);
  const panel = screen.getByRole('region', { name: 'Anthropomorphism safeguard' });
  expect(within(panel).getByText('Claims requiring review (1)')).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: 'Inspect anthropomorphism passage' }));
  expect(document.querySelector('[data-selected="true"]')).toHaveTextContent('Claude has feelings');
  expect(document.activeElement).toBe(document.querySelector('[data-selected="true"]'));
  expect(panel).toHaveTextContent('does not determine consciousness');
});

test('reports withheld generated fields and keeps quotation/fiction records in a separate disclosure', () => {
  const text = 'The response says: "Claude has feelings."';
  const raw = emptyAnalysisResult(); raw.summary = 'AI systems have emotions.';
  const result = applyAnthropomorphismGuard(raw, text);
  render(<ResponseEvidence text={text} result={result} indexBase={0} />);
  const panel = screen.getByRole('region', { name: 'Anthropomorphism safeguard' });
  expect(panel).toHaveTextContent('Generated auditor wording was withheld in 1 field(s)');
  expect(within(panel).getByText('summary')).toBeInTheDocument();
  expect(within(panel).getByText('Context-only passages (1)').closest('details')).not.toHaveAttribute('open');
  expect(within(panel).queryByText(/Claims requiring review/)).not.toBeInTheDocument();
});

test('an unmatched or legacy result does not display a clean or passed safeguard claim', () => {
  render(<ResponseEvidence text="A neutral explanation." result={emptyAnalysisResult()} indexBase={0} />);
  expect(screen.queryByRole('region', { name: 'Anthropomorphism safeguard' })).not.toBeInTheDocument();
});
