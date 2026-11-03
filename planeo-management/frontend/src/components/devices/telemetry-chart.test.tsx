import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Reading } from '@/lib/devices/api';
import { TelemetryChart } from './telemetry-chart';

const points = (count: number): Reading[] =>
  Array.from({ length: count }, (_, i) => ({
    metric: 'temperature',
    value: 4 + i * 0.5,
    ts: new Date(Date.UTC(2026, 0, 1, 10, i)).toISOString(),
  }));

describe('TelemetryChart', () => {
  it('shows an empty state with no readings', () => {
    render(<TelemetryChart points={[]} label="temperature" />);
    expect(screen.getByText(/no readings in this window/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws one path for the series and labels the chart for screen readers', () => {
    const { container } = render(<TelemetryChart points={points(5)} unit="C" label="temperature" />);
    expect(screen.getByRole('img', { name: /temperature over time, 5 readings/i })).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('renders a labelled threshold line when a rule applies', () => {
    render(<TelemetryChart points={points(4)} unit="C" threshold={{ value: 8, label: '> 8 C' }} label="temperature" />);
    expect(screen.getByText('> 8 C')).toBeInTheDocument();
  });

  it('offers a readings table as the non-visual alternative', async () => {
    render(<TelemetryChart points={points(3)} unit="C" label="temperature" />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show readings table/i }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(screen.getByRole('columnheader', { name: /value \(c\)/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hide readings table/i }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('handles a single reading without dividing by zero', () => {
    const { container } = render(<TelemetryChart points={points(1)} label="temperature" />);
    const path = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(path).not.toContain('NaN');
  });
});
