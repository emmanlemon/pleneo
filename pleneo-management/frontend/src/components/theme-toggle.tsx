'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Button } from './ui/button';

const ORDER = ['light', 'dark', 'system'] as const;
type Theme = (typeof ORDER)[number];
const ICONS = { light: Sun, dark: Moon, system: Monitor };
const isTheme = (value: string | undefined): value is Theme => ORDER.includes(value as Theme);
const noop = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const current: Theme = mounted && isTheme(theme) ? theme : 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
  const Icon = ICONS[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${current}. Switch to ${next}`}
      title={`Theme: ${current}`}
      onClick={() => setTheme(next)}
    >
      <Icon />
    </Button>
  );
}
