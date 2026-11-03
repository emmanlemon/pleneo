const ROOT = 'devices';

export const LEAF = {
  telemetry: 'telemetry',
  reported: 'state/reported',
  desired: 'state/desired',
  commands: 'commands',
  ack: 'commands/ack',
  status: 'status',
};

export const PUBLISHABLE = new Set([LEAF.telemetry, LEAF.reported, LEAF.ack, LEAF.status]);
export const SUBSCRIBABLE = new Set([LEAF.commands, LEAF.desired]);

export const topicFor = (externalId, leaf) => `${ROOT}/${externalId}/${leaf}`;

export function parseTopic(topic) {
  const parts = String(topic ?? '').split('/');
  if (parts.length < 3 || parts[0] !== ROOT) return null;
  const externalId = parts[1];
  if (!externalId || externalId.includes('+') || externalId.includes('#')) return null;
  return { externalId, leaf: parts.slice(2).join('/') };
}
