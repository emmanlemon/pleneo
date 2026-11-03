import nodemailer from 'nodemailer';
import { config } from '#config';

const auth = () =>
  config.GMAIL_APP_PASSWORD
    ? { user: config.GMAIL_USER, pass: config.GMAIL_APP_PASSWORD }
    : {
        type: 'OAuth2',
        user: config.GMAIL_USER,
        clientId: config.GMAIL_CLIENT_ID,
        clientSecret: config.GMAIL_CLIENT_SECRET,
        refreshToken: config.GMAIL_REFRESH_TOKEN,
      };

export function createGmailProvider() {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: auth(),
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    name: 'gmail',
    async send({ to, subject, text, html, replyTo }) {
      const info = await transport.sendMail({ from: config.EMAIL_FROM, to, subject, text, html, replyTo });
      return { id: info.messageId };
    },
    verify: () => transport.verify(),
    close: () => transport.close(),
  };
}
