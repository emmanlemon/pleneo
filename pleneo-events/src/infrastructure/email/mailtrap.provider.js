import { MailtrapClient } from 'mailtrap';
import { config } from '#config';

const BARE = /^[^\s<>@]+@[^\s<>@]+$/;
const ANGLED = /^(?:"(?<quoted>[^"]*)"|(?<plain>[^<]*?))\s*<\s*(?<email>[^\s<>@]+@[^\s<>@]+)\s*>$/;

export function parseAddress(value) {
  const raw = String(value ?? '').trim();
  if (BARE.test(raw)) return { email: raw };

  const match = ANGLED.exec(raw);
  if (!match) throw new Error(`cannot parse email address: ${value}`);
  const name = (match.groups.quoted ?? match.groups.plain ?? '').trim();
  return name ? { email: match.groups.email, name } : { email: match.groups.email };
}

const recipients = (to) =>
  (Array.isArray(to) ? to : String(to).split(',')).map((entry) => parseAddress(entry)).filter(Boolean);

export function createMailtrapProvider() {
  const sandbox = Boolean(config.MAILTRAP_INBOX_ID);
  const client = new MailtrapClient({
    token: config.MAILTRAP_API_KEY,
    ...(sandbox ? { sandbox: true, testInboxId: config.MAILTRAP_INBOX_ID } : {}),
  });

  return {
    name: sandbox ? 'mailtrap-sandbox' : 'mailtrap',
    async send({ to, subject, text, html, replyTo, category }) {
      const result = await client.send({
        from: parseAddress(config.EMAIL_FROM),
        to: recipients(to),
        subject,
        ...(html ? { html, text } : { text }),
        ...(replyTo ? { reply_to: parseAddress(replyTo) } : {}),
        category: category ?? 'pleneo',
      });
      if (!result.success) throw new Error(result.errors?.join('; ') ?? 'mailtrap rejected the message');
      return { id: result.message_ids?.[0] ?? null };
    },
  };
}
