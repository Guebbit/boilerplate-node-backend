/**
 * `nodemailer()`'s own attachment handling, in `src/infrastructure/adapters/mailer.ts` — resolving
 * `request.attachments`' `{ filename, key }` off the mail spool into nodemailer's own
 * `{ filename, path }`, and discarding every spooled key once the send has settled, success or
 * failure. `mailer-dispatch.test.ts` covers `enqueueEmail`'s queue/inline routing with no
 * attachments in play; this is the one file that drives real spool files end to end.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });
jest.mock('nodemailer', () => ({
    createTransport: () => ({ sendMail: sendMailMock })
}));

import { nodemailer, resetTransporter } from '@infrastructure/adapters/mailer';
import { spoolAttachment } from '@infrastructure/adapters/mail-spool';

/** The copy `orders.order-confirm.ejs` needs — irrelevant to what this file asserts on. */
const DATA = {
    locale: 'en',
    pageMetaTitle: '',
    pageMetaLinks: [],
    greeting: '',
    body: '',
    lines: [],
    total: '',
    linkLabel: '',
    linkUrl: '',
    footer: ''
};

/** Whether a path names a real file. */
const fileExists = (target: string): Promise<boolean> =>
    stat(target).then(
        () => true,
        () => false
    );

let spoolRoot: string;
const originalSpoolPath = process.env.NODE_MAIL_SPOOL_PATH;

beforeEach(async () => {
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({ messageId: 'smtp-1' });
    resetTransporter();
    spoolRoot = await mkdtemp(path.join(tmpdir(), 'mailer-attachments-test-'));
    process.env.NODE_MAIL_SPOOL_PATH = spoolRoot;
});

afterEach(async () => {
    await rm(spoolRoot, { recursive: true, force: true });
    if (originalSpoolPath === undefined) delete process.env.NODE_MAIL_SPOOL_PATH;
    else process.env.NODE_MAIL_SPOOL_PATH = originalSpoolPath;
});

describe('nodemailer — resolving attachments', () => {
    it('hands nodemailer a resolved path, never the spool key', async () => {
        const key = await spoolAttachment(Buffer.from('pdf-bytes'), 'pdf');

        await nodemailer(
            { to: 'ada@example.com', attachments: [{ filename: 'invoice-2026-000041.pdf', key }] },
            'orders.order-confirm',
            DATA
        );

        const [sent] = sendMailMock.mock.calls[0] as [{ attachments?: unknown }];
        expect(sent.attachments).toEqual([
            { filename: 'invoice-2026-000041.pdf', path: path.join(spoolRoot, key) }
        ]);
    });

    it('carries no attachments key at all when the request names none', async () => {
        await nodemailer({ to: 'ada@example.com' }, 'orders.order-confirm', DATA);

        const [sent] = sendMailMock.mock.calls[0] as [{ attachments?: unknown }];
        expect(sent).not.toHaveProperty('attachments');
    });

    it('drops an unresolvable key rather than handing nodemailer a broken path', async () => {
        await nodemailer(
            {
                to: 'ada@example.com',
                attachments: [{ filename: 'x.pdf', key: '../../etc/passwd' }]
            },
            'orders.order-confirm',
            DATA
        );

        const [sent] = sendMailMock.mock.calls[0] as [{ attachments?: unknown }];
        expect(sent).not.toHaveProperty('attachments');
    });
});

describe('nodemailer — discarding spooled attachments', () => {
    it('discards the spooled file once the send succeeds', async () => {
        const key = await spoolAttachment(Buffer.from('pdf-bytes'), 'pdf');

        await nodemailer(
            { to: 'ada@example.com', attachments: [{ filename: 'x.pdf', key }] },
            'orders.order-confirm',
            DATA
        );

        await expect(fileExists(path.join(spoolRoot, key))).resolves.toBe(false);
    });

    it('still discards the spooled file when the send rejects', async () => {
        sendMailMock.mockRejectedValueOnce(new Error('smtp refused'));
        const key = await spoolAttachment(Buffer.from('pdf-bytes'), 'pdf');

        await expect(
            nodemailer(
                { to: 'ada@example.com', attachments: [{ filename: 'x.pdf', key }] },
                'orders.order-confirm',
                DATA
            )
        ).rejects.toThrow('smtp refused');

        await expect(fileExists(path.join(spoolRoot, key))).resolves.toBe(false);
    });

    it('discards every attachment on a multi-attachment send', async () => {
        const first = await spoolAttachment(Buffer.from('a'), 'pdf');
        const second = await spoolAttachment(Buffer.from('b'), 'pdf');

        await nodemailer(
            {
                to: 'ada@example.com',
                attachments: [
                    { filename: 'a.pdf', key: first },
                    { filename: 'b.pdf', key: second }
                ]
            },
            'orders.order-confirm',
            DATA
        );

        await expect(fileExists(path.join(spoolRoot, first))).resolves.toBe(false);
        await expect(fileExists(path.join(spoolRoot, second))).resolves.toBe(false);
    });
});
