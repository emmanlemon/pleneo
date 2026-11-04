'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'pleneo.sidebar';
const listeners = new Set<() => void>();
let collapsed = false;
let hydrated = false;

const read = () => {
  try {
    return window.localStorage.getItem(KEY) === 'collapsed';
  } catch {
    return false;
  }
};

const subscribe = (listener: () => void) => {
  if (!hydrated) {
    collapsed = read();
    hydrated = true;
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function toggleSidebar() {
  collapsed = !collapsed;
  try {
    window.localStorage.setItem(KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {}
  listeners.forEach((listener) => listener());
}

export const useSidebarCollapsed = () =>
  useSyncExternalStore(
    subscribe,
    () => collapsed,
    () => false,
  );
