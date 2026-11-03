import { NonRetryableError } from '#common/errors/domain-errors.js';
import { getEmailProvider } from '#infra/email/provider.js';
import { renderTemplate } from '#notifications/templates.js';

export async function emailSendHandler(job, { logger }) {
  const { to, subject, text, html, template, data } = job.payload;
  if (!to) throw new NonRetryableError('email job is missing a recipient');

  const message = template ? { to, ...renderTemplate(template, data ?? {}) } : { to, subject, text, html };
  if (!message.subject || !(message.text || message.html))
    throw new NonRetryableError('email job is missing subject or body');

  const provider = getEmailProvider();
  const result = await provider.send(message);
  logger.info({ provider: provider.name, messageId: result.id, to }, 'email sent');
}
