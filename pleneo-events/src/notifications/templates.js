import { config } from '#config';
import { NonRetryableError } from '#common/errors/domain-errors.js';

const base = config.APP_BASE_URL.replace(/\/$/, '');
const link = (path, params) => `${base}${path}?${new URLSearchParams(params).toString()}`;

const layout = (title, lines) => ({
  text: [title, '', ...lines].join('\n'),
  html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">
  <h2 style="margin:0 0 16px">${title}</h2>${lines
    .map((l) =>
      l.startsWith('http')
        ? `<p><a href="${l}" style="color:#2563eb">${l}</a></p>`
        : `<p style="margin:0 0 12px">${l}</p>`,
    )
    .join('')}
  <p style="color:#71717a;font-size:12px;margin-top:24px">Pleneo</p></div>`,
});

const templates = {
  'auth.verify-email': (d) => ({
    subject: 'Verify your Pleneo email address',
    ...layout('Confirm your email', [
      `Hi${d.name ? ` ${d.name}` : ''}, use the link below to verify your email address.`,
      link('/verify-email', { token: d.verificationToken }),
      'If you did not create an account, you can ignore this message.',
    ]),
  }),
  'auth.invite': (d) => ({
    subject: 'You have been invited to Pleneo',
    ...layout('Join Pleneo', [
      `Hi${d.name ? ` ${d.name}` : ''}, ${d.invitedBy ?? 'an administrator'} invited you to the Pleneo console.`,
      'Use the link below to choose your password and activate your account.',
      link('/accept-invite', { token: d.inviteToken }),
      'The link is single-use and expires in a few days. If you were not expecting it, ignore this message.',
    ]),
  }),
  'auth.reset-password': (d) => ({
    subject: 'Reset your Pleneo password',
    ...layout('Reset your password', [
      'We received a request to reset your password. The link below expires shortly.',
      link('/reset-password', { token: d.resetToken }),
      'If you did not request this, no action is needed.',
    ]),
  }),
  'auth.password-changed': () => ({
    subject: 'Your Pleneo password was changed',
    ...layout('Password changed', [
      'Your password was just changed and other sessions were signed out.',
      'If this was not you, reset your password immediately.',
    ]),
  }),
  'auth.account-locked': (d) => ({
    subject: 'Your Pleneo account is temporarily locked',
    ...layout('Account locked', [
      `Too many failed sign-in attempts. The account is locked until ${d.lockedUntil ?? 'later'}.`,
      'If this was not you, consider resetting your password once the lock expires.',
    ]),
  }),
  'auth.mfa-changed': () => ({
    subject: 'Multi-factor authentication settings changed',
    ...layout('MFA settings changed', [
      'Multi-factor authentication was enabled or disabled on your account.',
      'If this was not you, contact support.',
    ]),
  }),
  'auth.registration-attempt': () => ({
    subject: 'Someone tried to register with your email',
    ...layout('Registration attempt', [
      'A sign-up was attempted with your email address, which already has an account.',
      link('/forgot-password', {}),
    ]),
  }),
  'iot.alert-raised': (d) => ({
    subject: `${d.severity === 'critical' ? 'Critical' : 'Alert'}: ${d.deviceName} ${d.metric}`,
    ...layout('Device alert', [
      d.message ?? `${d.metric} crossed its threshold on ${d.deviceName}.`,
      `Reading ${d.value} against a threshold of ${d.threshold}.`,
      link(`/devices/${d.deviceId}`, {}),
    ]),
  }),
  'iot.device-offline': (d) => ({
    subject: `${d.deviceName} stopped reporting`,
    ...layout('Device offline', [
      `${d.deviceName} (${d.externalId}) has not reported for ${d.offlineAfterSeconds ?? 'some'} seconds.`,
      `Last seen ${d.lastSeenAt ?? 'unknown'}.`,
      link(`/devices/${d.deviceId}`, {}),
    ]),
  }),
  'project.created': (d) => ({
    subject: `Project "${d.name}" was created`,
    ...layout('New project', [`The project "${d.name}" is now in planning.`, link(`/projects/${d.projectId}`, {})]),
  }),
  'project.status-changed': (d) => ({
    subject: `Project "${d.name}" is now ${d.status}`,
    ...layout('Project status changed', [`"${d.name}" moved to ${d.status}.`, link(`/projects/${d.projectId}`, {})]),
  }),
  'system.test-email': (d) => ({
    subject: `Pleneo email test${d.note ? `: ${d.note}` : ''}`,
    ...layout('Email delivery works', [
      'This message was sent from the Pleneo console to confirm the email pipeline.',
      `Requested by ${d.requestedBy ?? 'an administrator'} at ${d.sentAt ?? new Date().toISOString()}.`,
      ...(d.note ? [`Note: ${d.note}`] : []),
      'It travelled through the management API, the events queue and the configured provider.',
    ]),
  }),
};

export const templateNames = () => Object.keys(templates);

export function renderTemplate(name, data) {
  const render = templates[name];
  if (!render) throw new NonRetryableError(`unknown email template "${name}"`);
  return render(data);
}
