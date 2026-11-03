import { beforeEach, describe, expect, it, vi } from 'vitest';

const { send, constructed } = vi.hoisted(() => ({ send: vi.fn(), constructed: [] }));
vi.mock('mailtrap', () => ({
  MailtrapClient: vi.fn(function MailtrapClient(options) {
    constructed.push(options);
    return { send };
  }),
}));

const { createMailtrapProvider, parseAddress } = await import('#infra/email/mailtrap.provider.js');
const { config } = await import('#config');

beforeEach(() => {
  constructed.length = 0;
  send.mockReset();
  send.mockResolvedValue({ success: true, message_ids: ['mt-1'] });
});

describe('address parsing', () => {
  it('splits a display name from the address', () => {
    expect(parseAddress('Pleneo <no-reply@pleneo.test>')).toEqual({ email: 'no-reply@pleneo.test', name: 'Pleneo' });
    expect(parseAddress('"Pleneo Ops" <ops@pleneo.test>')).toEqual({ email: 'ops@pleneo.test', name: 'Pleneo Ops' });
  });

  it('accepts a bare address', () => {
    expect(parseAddress('ops@pleneo.test')).toEqual({ email: 'ops@pleneo.test' });
  });

  it('refuses something that is not an address', () => {
    expect(() => parseAddress('nonsense')).toThrow(/cannot parse/i);
  });
});

describe('mailtrap provider', () => {
  it('sends with the configured sender and a parsed recipient', async () => {
    const provider = createMailtrapProvider();
    const result = await provider.send({ to: 'ops@pleneo.test', subject: 'Hi', text: 'Body' });

    expect(result).toEqual({ id: 'mt-1' });
    const [message] = send.mock.calls[0];
    expect(message).toMatchObject({
      from: expect.objectContaining({ email: expect.stringContaining('@') }),
      to: [{ email: 'ops@pleneo.test' }],
      subject: 'Hi',
      text: 'Body',
    });
  });

  it('carries the html part when a template rendered one', async () => {
    await createMailtrapProvider().send({ to: 'ops@pleneo.test', subject: 'Hi', text: 'Body', html: '<p>Body</p>' });
    expect(send.mock.calls[0][0]).toMatchObject({ html: '<p>Body</p>', text: 'Body' });
  });

  it('fans out a comma separated recipient list', async () => {
    await createMailtrapProvider().send({ to: 'a@pleneo.test, b@pleneo.test', subject: 'Hi', text: 'Body' });
    expect(send.mock.calls[0][0].to).toEqual([{ email: 'a@pleneo.test' }, { email: 'b@pleneo.test' }]);
  });

  it('turns a rejected send into an error the queue can retry', async () => {
    send.mockResolvedValue({ success: false, errors: ['inbox is full'] });
    await expect(createMailtrapProvider().send({ to: 'ops@pleneo.test', subject: 'Hi', text: 'Body' })).rejects.toThrow(
      /inbox is full/,
    );
  });

  it('uses the sandbox inbox when one is configured', () => {
    const provider = createMailtrapProvider();
    const options = constructed.at(-1);
    expect(options.token).toBe(config.MAILTRAP_API_KEY);
    if (config.MAILTRAP_INBOX_ID) {
      expect(options).toMatchObject({ sandbox: true, testInboxId: config.MAILTRAP_INBOX_ID });
      expect(provider.name).toBe('mailtrap-sandbox');
    } else {
      expect(options.sandbox).toBeUndefined();
      expect(provider.name).toBe('mailtrap');
    }
  });
});
