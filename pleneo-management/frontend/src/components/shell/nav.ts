import {
  Cpu,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Session } from '@/lib/auth/api';
import { hasPermission } from '../admin/admin-guard';

export type NavItem = { href: string; label: string; icon: LucideIcon; permission?: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Operate',
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/devices', label: 'Devices', icon: Cpu },
    ],
  },
  {
    label: 'Access',
    items: [
      { href: '/admin/users', label: 'Users', icon: Users, permission: 'users:read' },
      { href: '/admin/roles', label: 'Roles', icon: ShieldCheck, permission: 'users:read' },
      { href: '/admin/clients', label: 'API clients', icon: KeyRound, permission: 'clients:manage' },
      { href: '/admin/audit', label: 'Audit log', icon: ScrollText, permission: 'audit:read' },
    ],
  },
  {
    label: 'Platform',
    items: [{ href: '/admin/queues', label: 'Queues', icon: ListChecks, permission: 'platform:manage' }],
  },
];

const TITLES: Record<string, string> = {
  '/settings/security': 'Security',
  '/notifications': 'Notifications',
};

export const visibleGroups = (session: Session | null | undefined): NavGroup[] =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(session, item.permission)),
  })).filter((group) => group.items.length > 0);

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function pageTitle(pathname: string): string {
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => isActive(pathname, i.href));
  if (item) return item.label;
  const known = Object.keys(TITLES).find((p) => isActive(pathname, p));
  return known ? TITLES[known] : 'Pleneo';
}
