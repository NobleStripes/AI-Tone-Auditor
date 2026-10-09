import { expect, test } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ResponseEvidence } from '../../src/components/ResponseEvidence';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { collectOccurrences, verifyEvidence } from '../../src/services/evidence';

test('navigates to the second repeat and shows its sentence, not the first', async () => {
  const text = 'Calm down first. Then, calm down again.';
  const result = await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });
  render(<ResponseEvidence text={text} result={result} indexBase={0} />);
  const actions = screen.getAllByRole('button', { name: 'Show passage and surrounding sentence' });
  fireEvent.click(actions[1]);
  expect(document.querySelector('[data-selected="true"]')).toHaveTextContent('calm down');
  expect(document.activeElement).toBe(document.querySelector('[data-selected="true"]'));
  expect(within(screen.getByRole('tooltip')).getByText(/Then, calm down again/)).toBeInTheDocument();
  actions[1].focus();
  fireEvent.click(actions[1]);
  expect(document.activeElement).toBe(document.querySelector('[data-selected="true"]'));
});

test('exposes excluded matches without alarming diagnostic styling or score contributions', async () => {
  const text = '`calm down`';
  const result = await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });
  render(<ResponseEvidence text={text} result={result} indexBase={0} />);
  expect(screen.getByText(/Excluded or unverified evidence \(1\)/)).toBeInTheDocument();
  expect(screen.getByText('EXCLUDED')).toBeInTheDocument();
  expect(screen.getByText(/Inside inline code/)).toBeInTheDocument();
  expect(document.querySelector('.bg-red-500\\/20')).toBeNull();
});

test('unverified semantic quotations have no source navigation action', () => {
  const result = emptyAnalysisResult();
  result.findings = [{ category: 'Hedging', text: 'Invented quote', explanation: 'Claim', severity: 'high',
    evidence: verifyEvidence('Actual text.', 'Invented quote') }];
  render(<ResponseEvidence text="Actual text." result={result} indexBase={0} />);
  expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show passage and surrounding sentence' })).not.toBeInTheDocument();
});

test('semantic passages without dictionary matches can be selected', () => {
  const text = 'A specific unsupported statement.';
  const result = emptyAnalysisResult();
  result.findings = [{ category: 'Dismissive', text, explanation: 'Interpretation', severity: 'medium',
    evidence: verifyEvidence(text, text) }];
  render(<ResponseEvidence text={text} result={result} indexBase={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show passage and surrounding sentence' }));
  expect(document.querySelector('[data-selected="true"]')).toHaveTextContent(text);
});

test('overlapping cross-category markers stay inspectable and preserve the whole response', () => {
  const text = "I understand you're frustrated.";
  const result = emptyAnalysisResult();
  result.occurrences = collectOccurrences(text);
  render(<ResponseEvidence text={text} result={result} indexBase={0} />);
  fireEvent.click(screen.getByRole('button', { name: `Inspect passage: ${text.slice(0, -1)}` }));
  const tooltip = screen.getByRole('tooltip');
  const categories = result.occurrences.map(record => record.category);
  categories.forEach(category => expect(within(tooltip).getAllByText(category).length).toBeGreaterThan(0));
  expect(tooltip).toHaveTextContent(text);
});

test('identical quotes in comparison responses select only the requested response', async () => {
  const text = 'Calm down. Calm down.';
  const result = await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });
  const { container } = render(<div>
    <section aria-label="First response"><ResponseEvidence text={text} result={result} indexBase={0} /></section>
    <section aria-label="Second response"><ResponseEvidence text={text} result={result} indexBase={100000} /></section>
  </div>);
  const first = screen.getByRole('region', { name: 'First response' });
  const second = screen.getByRole('region', { name: 'Second response' });
  fireEvent.click(within(second).getAllByRole('button', { name: 'Show passage and surrounding sentence' })[1]);
  expect(first.querySelector('[data-selected="true"]')).toBeNull();
  expect(second.querySelector('[data-selected="true"]')).not.toBeNull();
  expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
});

test('a disclosure keeps all repeated findings accessible beyond the initial eight', async () => {
  const text = 'Calm down. '.repeat(12);
  const result = await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });
  render(<ResponseEvidence text={text} result={result} indexBase={0} />);
  const summary = screen.getByText('More findings (4)');
  const disclosure = summary.closest('details');
  expect(disclosure).not.toHaveAttribute('open');
  expect(within(disclosure).getAllByRole('button', { name: 'Show passage and surrounding sentence' })).toHaveLength(4);
  fireEvent.click(summary);
  expect(disclosure).toHaveAttribute('open');
  expect(screen.getAllByRole('button', { name: 'Show passage and surrounding sentence' })).toHaveLength(12);
});
