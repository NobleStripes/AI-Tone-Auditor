import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FindingCard } from '../../src/components/FindingCard';

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('explains reader impact without claiming to inspect hidden alignment mechanisms', async () => {
  render(<FindingCard index={0} finding={{
    category: 'Forced De-escalation', text: 'Calm down', explanation: 'May read as tone policing in a neutral exchange.',
    severity: 'high', confidence: 'high', method: 'lexical_rule',
    rlhfLogic: 'A possible communication signal; no hidden intent or cause is established.',
  }} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Explain wording signal' }));
  expect(screen.getByText('Wording and reader impact')).toBeInTheDocument();
  expect(screen.getByText('A possible communication signal; no hidden intent or cause is established.')).toBeInTheDocument();
  expect(screen.queryByText(/Nanny|safety-alignment weights|RLHF Alignment Logic/)).not.toBeInTheDocument();
});

test('legacy findings without a recorded explanation do not pretend a hidden analysis is running', async () => {
  render(<FindingCard index={1} finding={{ category: 'Hedging', text: 'Perhaps', explanation: 'A tentative qualifier.', severity: 'low' }} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Explain wording signal' }));
  expect(screen.getByText('No wording-based explanation was recorded for this finding.')).toBeInTheDocument();
});
