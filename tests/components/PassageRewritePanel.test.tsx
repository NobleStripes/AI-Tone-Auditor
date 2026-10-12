import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PassageRewritePanel } from '../../src/components/PassageRewritePanel';
import { verifyEvidence } from '../../src/services/evidence';

test('finding-selected passage produces a reviewable diff and copies a draft without changing the source', async () => {
  const response = 'Calm down. Answer the question directly.';
  const writeText = vi.fn().mockResolvedValue(undefined);
  const old = navigator.clipboard; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    const { rerender } = render(<PassageRewritePanel response={response} selectedEvidence={verifyEvidence(response, 'Calm down. ')} />);
    fireEvent.click(screen.getByText('Rewrite a selected passage'));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest passage rewrites' }));
    expect(screen.getByLabelText('Passage rewrite diff').querySelector('del')).toHaveTextContent('Calm down.');
    fireEvent.click(screen.getByRole('button', { name: 'Copy revised response' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Answer the question directly.'));
    expect(screen.getByLabelText('Rewrite passage selector')).toHaveValue(response);
    rerender(<PassageRewritePanel response="Different response now." selectedEvidence={null} />);
    expect(screen.queryByRole('button', { name: 'Copy revised response' })).not.toBeInTheDocument();
  } finally { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: old }); }
});
