/**
 * @module
 * The mailed-code doors against two deployment facts the other suites hide: mail that reaches no
 * person (every other suite forces `outbox`), and the one hourly budget the 2FA send and the
 * step-up send share.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment, withEnvironmentOverrides } from '@tests/environment';
import { api, loginBearer } from '@tests/http';
import { userRepository, createUser } from '@modules/users/tests/factories';
import { mintSession } from '../factories';

/** Every queued mail, newest last — what the recipient would read. */
const mockOutbox: { template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn((_envelope: unknown, template: string, data: Record<string, unknown>) => {
        mockOutbox.push({ template, data });
        return Promise.resolve();
    })
}));

setupTestDb();

beforeEach(() => {
    mockOutbox.length = 0;
});

describe('a deployment whose mail reaches no person', () => {
    // The `log` transport keeps mail nowhere a caller can read it.
    beforeEach(() => {
        setEnvironment({ NODE_MAIL_TRANSPORT: 'log' });
    });

    it('does not offer the email factor, and its setup answers like an unknown method', async () => {
        const user = await createUser({ verifiedAt: new Date(), email: 'ada@example.com' });
        const bearer = await loginBearer(user.email);

        const unknown = await api()
            .post('/account/2fa/methods/nonsense/setup')
            .set('Authorization', bearer)
            .send();
        const email = await api()
            .post('/account/2fa/methods/email/setup')
            .set('Authorization', bearer)
            .send();

        expect(email.status).toBe(404);
        expect(email.status).toBe(unknown.status);
        expect(email.body).toEqual(unknown.body);
    });

    it('offers step-up no method to an account without a password, and refuses the send', async () => {
        const user = await userRepository.create({
            username: 'oauthonly',
            email: 'oauth@example.com',
            verifiedAt: new Date()
        });
        const { bearer } = await mintSession(user.id, { amr: ['google'] });

        const methods = await api().get('/account/reauth').set('Authorization', bearer);
        const send = await api()
            .post('/account/reauth/methods/email/send')
            .set('Authorization', bearer)
            .send();

        expect(methods.body.data).toEqual({ methods: [] });
        expect(send.status).toBe(422);
    });
});

describe('the send budget shared by 2FA and step-up', () => {
    beforeEach(() => {
        setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
    });

    it('counts a 2FA send and a step-up send together, refusing the third', () =>
        withEnvironmentOverrides({ NODE_MFA_ACCOUNT_SEND_MAX: '2' }, async () => {
            const user = await userRepository.create({
                username: 'oauthonly',
                email: 'oauth@example.com',
                verifiedAt: new Date()
            });
            const { bearer } = await mintSession(user.id, { amr: ['google'] });
            // Arming does not spend the send budget; only the two send routes do.
            await api()
                .post('/account/2fa/methods/email/setup')
                .set('Authorization', bearer)
                .send();
            const code = String(
                mockOutbox.findLast(({ template }) => template === 'account.two-factor-code')?.data
                    .code
            );
            await api()
                .post('/account/2fa/methods/email/confirm')
                .set('Authorization', bearer)
                .send({ code });
            const { bearer: armed } = await mintSession(user.id, { amr: ['google', 'otp'] });
            const send = (path: string) => api().post(path).set('Authorization', armed).send();

            const twoFactor = await send('/account/2fa/methods/email/send');
            const reauth = await send('/account/reauth/methods/email/send');
            const third = await send('/account/reauth/methods/email/send');

            expect([twoFactor.status, reauth.status, third.status]).toEqual([200, 200, 429]);
        }));
});
