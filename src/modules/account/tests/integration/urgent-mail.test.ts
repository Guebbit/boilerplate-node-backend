/**
 * @module
 * Which account mails ride the urgent queue. A person is sitting on a screen waiting for exactly
 * five: the verification link, the password-reset link, a two-factor code, the export-ready link
 * (`export.test.ts`) and the account-deletion link. Every other mail the module sends, an undo
 * notice and a restore confirmation among them, stays on the ordinary queue, or the urgent queue
 * stops meaning anything.
 */

import { api, loginBearer } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { eventually } from '@tests/eventually';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { mintSession } from '@modules/account/tests/factories';

/** Every mail the app queued, newest last, and whether it asked for the urgent queue. */
const mockOutbox: {
    to?: string;
    template: string;
    data: Record<string, unknown>;
    urgent: boolean;
}[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(
        (
            envelope: { to?: string },
            template: string,
            data: Record<string, unknown>,
            options?: { urgent?: boolean }
        ) => {
            mockOutbox.push({ to: envelope.to, template, data, urgent: options?.urgent === true });
            return Promise.resolve();
        }
    )
}));

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
    mockOutbox.length = 0;
});

/**
 * Whether the mail of one template was queued as urgent.
 *
 * @param template - the mail's name
 * @returns `undefined` when it was never queued
 */
const urgentOf = (template: string): boolean | undefined =>
    mockOutbox.find((mail) => mail.template === template)?.urgent;

describe('the mails a person is waiting on go to the urgent queue', () => {
    it('sends the verification link of an email change as urgent', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        await api()
            .post('/account/email-change')
            .set('Authorization', await loginBearer(user.email))
            .send({ email: 'new@example.com' });

        expect(urgentOf('account.verify-request')).toBe(true);
    });

    it('sends the password-reset link as urgent', async () => {
        const user = await createUser({ email: 'forgot@example.com' });

        await api().post('/account/password/reset').send({ email: user.email });

        await eventually(() => urgentOf('account.reset-request') !== undefined);

        expect(urgentOf('account.reset-request')).toBe(true);
    });

    it('sends a two-factor code as urgent', async () => {
        // An account with no password, as in `code-delivery.contract.test.ts`: arming needs no step-up.
        const user = await userRepository.create({
            username: 'oauthonly',
            email: 'mfa@example.com',
            verifiedAt: new Date()
        });
        const { bearer } = await mintSession(user.id, { amr: ['google'] });

        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send();

        expect(urgentOf('account.two-factor-code')).toBe(true);
    });

    it('sends the account-deletion link as urgent', async () => {
        const user = await createUser({ email: 'doomed@example.com', verifiedAt: new Date() });
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        await api()
            .delete('/account')
            .set('Authorization', `Bearer ${login.body.token as string}`)
            .send();

        expect(urgentOf('account.deletion-scheduled')).toBe(true);
    });
});

describe('the mails nobody is waiting on stay on the ordinary queue', () => {
    it('sends the undo notice to the OLD address of an email change as normal', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        await api()
            .post('/account/email-change')
            .set('Authorization', await loginBearer(user.email))
            .send({ email: 'new@example.com' });

        expect(urgentOf('account.email-change-notice')).toBe(false);
    });

    it('sends the restore confirmation as normal', async () => {
        const user = await createUser({ email: 'regret@example.com', verifiedAt: new Date() });
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        await api()
            .delete('/account')
            .set('Authorization', `Bearer ${login.body.token as string}`)
            .send();
        // The token is in the restore link of the scheduled-deletion mail.
        const scheduled = mockOutbox.find(
            ({ template }) => template === 'account.deletion-scheduled'
        );
        const link = new URL(String(scheduled?.data.linkUrl));
        const token = new URLSearchParams(link.hash.slice(1)).get('token') ?? '';
        mockOutbox.length = 0;

        await api().post('/account/restore').send({ token });

        expect(urgentOf('account.restored')).toBe(false);
    });
});
