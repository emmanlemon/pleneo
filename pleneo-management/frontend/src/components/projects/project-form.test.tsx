import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/problem';
import { toFormValues } from '@/lib/projects/schemas';
import { renderWithProviders } from '@/test-utils';
import { ProjectForm } from './project-form';

const setup = (onSubmit = vi.fn().mockResolvedValue(undefined)) => {
  renderWithProviders(
    <ProjectForm defaultValues={toFormValues()} submitLabel="Create project" pending={false} onSubmit={onSubmit} />,
  );
  return onSubmit;
};

describe('ProjectForm', () => {
  it('requires a name and keeps dates optional', async () => {
    const onSubmit = setup();
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));
    expect(await screen.findByText(/enter a project name/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date client-side', async () => {
    const onSubmit = setup();
    await userEvent.type(screen.getByLabelText(/name/i), 'Launch');
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-03-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-02-01');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));
    expect(await screen.findByText(/on or after the start date/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits normalised values with empty dates as null', async () => {
    const onSubmit = setup();
    await userEvent.type(screen.getByLabelText(/name/i), '  Launch ');
    await userEvent.type(screen.getByLabelText(/description/i), 'Q3 launch');
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-03-01');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Launch',
      description: 'Q3 launch',
      status: 'planning',
      startsOn: '2026-03-01',
      endsOn: null,
    });
  });

  it('maps server-side date range errors to the end date field', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        type: 'x',
        title: 'Bad Request',
        status: 400,
        code: 'INVALID_DATE_RANGE',
        detail: 'End date must not be before start date',
      }),
    );
    setup(onSubmit);
    await userEvent.type(screen.getByLabelText(/name/i), 'Launch');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));
    expect(await screen.findByText(/must not be before start date/i)).toBeInTheDocument();
  });
});
