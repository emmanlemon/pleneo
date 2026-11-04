import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm } from './confirm-dialog';

function Harness() {
  const confirm = useConfirm();
  const [outcome, setOutcome] = useState('untouched');
  return (
    <button
      onClick={async () =>
        setOutcome(
          (await confirm({
            title: 'Delete it?',
            description: 'Gone for good.',
            confirmLabel: 'Delete',
            destructive: true,
          }))
            ? 'confirmed'
            : 'cancelled',
        )
      }
    >
      {outcome}
    </button>
  );
}

describe('useConfirm', () => {
  it('resolves false on cancel and true on confirm', async () => {
    render(
      <ConfirmProvider>
        <Harness />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'untouched' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Gone for good.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'cancelled' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'cancelled' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('button', { name: 'confirmed' })).toBeInTheDocument();
  });
});
