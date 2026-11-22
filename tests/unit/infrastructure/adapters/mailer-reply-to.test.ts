/**
 * The `Reply-To` rule in `src/infrastructure/adapters/mailer.ts`: a mail that names no `replyTo`
 * gets the support address, a named one keeps it, and `noReplyTo` sends no header at all (a mail
 * whose replies must reach nobody, such as the link-only mail to a help-desk mailbox).
 */
import { setEnvironment } from '@tests/environment';

/** Stands in for the SMTP send; the cases assert how it was called. */
const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });

jest.mock('nodemailer', () => ({
    createTransport: () => ({ sendMail: sendMailMock })
}));

import { sendTemplatedEmail } from '@infrastructure/adapters/mailer';

/** What `account.reset-confirm.ejs` needs; irrelevant to what this file asserts on. */
const DATA = {
    locale: 'en',
    pageMetaTitle: '',
    greeting: '',
    body: '',
    providers: '',
    advice: '',
    lines: [],
    total: '',
    linkLabel: '',
    linkUrl: '',
    footer: ''
};

beforeEach(() => {
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({ messageId: 'smtp-1' });
    setEnvironment({ NODE_SUPPORT_EMAIL: 'desk@example.com' });
});

/** The message handed to nodemailer for one send. */
const sentFor = (request: Parameters<typeof sendTemplatedEmail>[0]) =>
    sendTemplatedEmail(request, 'account.reset-confirm', DATA).then(
        () => sendMailMock.mock.calls[0][0] as Record<string, unknown>
    );

describe('Reply-To', () => {
    it('falls back to the support address when the mail names none', async () => {
        await expect(sentFor({ to: 'ada@example.com' })).resolves.toMatchObject({
            replyTo: 'desk@example.com'
        });
    });

    it('keeps the address a producer names', async () => {
        await expect(
            sentFor({ to: 'desk@example.com', replyTo: 'ada@example.com' })
        ).resolves.toMatchObject({ replyTo: 'ada@example.com' });
    });

    it('sends no header at all for noReplyTo, even beside a named address', async () => {
        const sent = await sentFor({
            to: 'desk@example.com',
            replyTo: 'ada@example.com',
            noReplyTo: true
        });

        expect(sent).not.toHaveProperty('replyTo');
    });
});
