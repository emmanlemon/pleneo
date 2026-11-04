'use client';

import type { Role } from '@/lib/access/api';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';

export const BASE_ROLE = 'user';

type Props = {
  roles: Role[];
  selected: string[];
  onChange: (roles: string[]) => void;
  disabled?: (role: Role) => boolean;
  busy?: boolean;
};

export function RolePicker({ roles, selected, onChange, disabled, busy }: Props) {
  const toggle = (name: string, checked: boolean) =>
    onChange(checked ? [...new Set([...selected, name])] : selected.filter((r) => r !== name));

  return (
    <ul className="divide-y rounded-md border" aria-label="Roles">
      {roles.map((role) => {
        const base = role.name === BASE_ROLE;
        const checked = base || selected.includes(role.name);
        const locked = base || busy || disabled?.(role) === true;
        return (
          <li key={role.name}>
            <label className={cn('flex cursor-pointer items-start gap-3 px-3 py-2.5', locked && 'cursor-default')}>
              <input
                type="checkbox"
                className="mt-1 size-4 cursor-pointer disabled:cursor-default"
                checked={checked}
                disabled={locked}
                onChange={(e) => toggle(role.name, e.target.checked)}
                aria-label={role.name}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {role.name}
                  <Badge variant="outline">{role.permissions.length} permissions</Badge>
                </span>
                {role.description && <span className="text-muted-foreground block text-xs">{role.description}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
