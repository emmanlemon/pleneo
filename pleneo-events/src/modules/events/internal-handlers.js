import { enqueue } from '#queue/queue.service.js';

const emailJob = (template) => async (event, client) => {
  const { email } = event.payload;
  if (!email) return null;
  const { job } = await enqueue(
    {
      queue: 'email',
      type: 'email.send',
      payload: { to: email, template, data: event.payload },
      eventId: event.id,
      idempotencyKey: `email:${event.id}:${template}`,
      createdBy: 'internal',
    },
    client,
  );
  return job?.id ?? null;
};

const handlers = {
  'auth.user.registered': [emailJob('auth.verify-email')],
  'auth.user.email_verification_requested': [emailJob('auth.verify-email')],
  'auth.user.invited': [emailJob('auth.invite')],
  'auth.user.password_reset_requested': [emailJob('auth.reset-password')],
  'auth.user.password_changed': [emailJob('auth.password-changed')],
  'auth.user.locked': [emailJob('auth.account-locked')],
  'auth.user.mfa_enabled': [emailJob('auth.mfa-changed')],
  'auth.user.mfa_disabled': [emailJob('auth.mfa-changed')],
  'auth.user.registration_attempt_existing': [emailJob('auth.registration-attempt')],
};

export async function runInternalHandlers(event, client) {
  const jobIds = [];
  for (const handler of handlers[event.type] ?? []) {
    const id = await handler(event, client);
    if (id) jobIds.push(id);
  }
  return jobIds;
}

export const internalEventTypes = () => Object.keys(handlers);
