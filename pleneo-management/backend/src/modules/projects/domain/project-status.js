export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'];

const TRANSITIONS = {
  planning: ['active', 'on_hold', 'archived'],
  active: ['on_hold', 'completed', 'archived'],
  on_hold: ['active', 'completed', 'archived'],
  completed: ['active', 'archived'],
  archived: ['planning', 'active'],
};

export const isStatus = (value) => PROJECT_STATUSES.includes(value);

export const allowedNextStatuses = (from) => (isStatus(from) ? [from, ...TRANSITIONS[from]] : []);

export const canTransition = (from, to) => from === to || Boolean(TRANSITIONS[from]?.includes(to));

export const OPEN_STATUSES = ['planning', 'active', 'on_hold'];
