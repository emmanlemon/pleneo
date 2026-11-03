import type { Metadata } from 'next';
import { ProjectList } from '@/components/projects/project-list';

export const metadata: Metadata = { title: 'Projects' };

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <ProjectList />
    </div>
  );
}
