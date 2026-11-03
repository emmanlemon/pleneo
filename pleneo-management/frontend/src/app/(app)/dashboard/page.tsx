import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-zinc-600">
        Manage your work from the{' '}
        <Link href="/projects" className="underline">
          projects
        </Link>{' '}
        area.
      </p>
    </div>
  );
}
