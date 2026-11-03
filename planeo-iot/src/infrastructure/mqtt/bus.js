import { LEAF, topicFor } from './topics.js';

let publish = null;

export const setPublisher = (fn) => {
  publish = fn;
};

const send = (externalId, leaf, body, options) =>
  publish && externalId ? publish(topicFor(externalId, leaf), JSON.stringify(body), options) : false;

export const publishCommand = (externalId, command) =>
  send(externalId, LEAF.commands, {
    id: command.id,
    type: command.type,
    payload: command.payload ?? {},
    expiresAt: command.expires_at,
  });

export const publishDesired = (externalId, state) =>
  send(externalId, LEAF.desired, { desired: state.desired ?? {}, version: state.desired_version ?? 0 });

export const publishStatus = (externalId, status) =>
  send(externalId, LEAF.status, { status, at: new Date().toISOString() }, { retain: true });

export const isConnected = (externalId) => Boolean(publish) && externalId !== undefined;
