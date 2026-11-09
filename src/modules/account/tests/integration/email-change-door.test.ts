/**
 * @module
 * `POST /account/email-change`: the one door an address change starts at. Pins the step-up that is
 * unconditional here, the repeat table (current, pending, replaced, taken), the two mails and the
 * audit row, and that `PUT`/`PATCH /account` no longer carry an `email` at all. The armed-account
 * `otp` proof is in `step-up-otp.test.ts`.
 */

import { api, loginBearer, staleBearerFor } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { advanceDate, freezeDate } from '@tests/clock';
import { observePort } from '@tests/ports';
import * as auditPort from '@infrastructure/observability/audit';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { accountAuditActions } from '../../audit';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

/** Every queued mail, newest last — what each recipient would read. */
const mockOutbox: { to?: string; template: string }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn((envelope: { to?: string }, template: string) => {
        mockOutbox.push({ to: envelope.to, template });
        return Promise.resolve();
    })
}));

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
    mockOutbox.length = 0;
});

afterEach(() => jest.useRealTimers());

/** How many mails of one template went to one address. */
const mailsTo = (to: string, template: string): number =>
    mockOutbox.filter((mail) => mail.to === to && mail.template === template).length;

/** `POST /account/email-change` as a bearer. */
const requestChange = (bearer: string, email: string) =>
    api().post('/account/email-change').set('Authorization', bearer).send({ email });

/** The stored `pendingEmail` of an account. */
const pendingOf = (userId: string): Promise<string | undefined> =>
    userRepository.findByIdWithCredentials(userId).then((stored) => stored?.pendingEmail);

describe('POST /account/email-change', () => {
    it('parks the address as pending, mails both addresses and audits the request', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        const response = await requestChange(await loginBearer(user.email), 'new@example.com');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            email: 'old@example.com',
            pendingEmail: 'new@example.com'
        });
        expect(mailsTo('old@example.com', 'account.email-change-notice')).toBe(1);
        expect(mailsTo('new@example.com', 'account.verify-request')).toBe(1);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_EMAIL_CHANGE_REQUESTED,
                outcome: 'success'
            })
        );
    });

    it('asks for a fresh login even when the account has no second factor, and saves nothing', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        const response = await requestChange(
            await staleBearerFor(user, 'sensitive'),
            'new@example.com'
        );

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
        expect(await pendingOf(user.id)).toBeUndefined();
        expect(mockOutbox).toEqual([]);
    });

    it('answers 401 without a session', async () => {
        const response = await api()
            .post('/account/email-change')
            .send({ email: 'new@example.com' });

        expect(response.status).toBe(401);
    });

    it('answers 409 EMAIL_ALREADY_CURRENT for the address the account has, in any case', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        const response = await requestChange(await loginBearer(user.email), 'OLD@Example.com');

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('EMAIL_ALREADY_CURRENT');
        expect(mockOutbox).toEqual([]);
    });

    it('answers 409 EMAIL_CHANGE_ALREADY_PENDING for the pending address, and mails nothing more', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });
        const bearer = await loginBearer(user.email);
        await requestChange(bearer, 'new@example.com');
        mockOutbox.length = 0;

        const response = await requestChange(bearer, 'NEW@example.com');

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('EMAIL_CHANGE_ALREADY_PENDING');
        expect(mockOutbox).toEqual([]);
    });

    it('replaces a pending address with a different one once the minute has passed', async () => {
        freezeDate();
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });
        const bearer = await loginBearer(user.email);
        await requestChange(bearer, 'first@example.com');
        advanceDate(61_000);
        mockOutbox.length = 0;

        const response = await requestChange(bearer, 'second@example.com');

        expect(response.status).toBe(200);
        expect(await pendingOf(user.id)).toBe('second@example.com');
        expect(mailsTo('old@example.com', 'account.email-change-notice')).toBe(1);
        expect(mailsTo('second@example.com', 'account.verify-request')).toBe(1);
    });

    it('answers 429 EMAIL_CHANGE_TOO_SOON for a different address inside the minute', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });
        const bearer = await loginBearer(user.email);
        await requestChange(bearer, 'first@example.com');

        const response = await requestChange(bearer, 'second@example.com');

        expect(response.status).toBe(429);
        expect(response.body.errors[0].code).toBe('EMAIL_CHANGE_TOO_SOON');
        expect(await pendingOf(user.id)).toBe('first@example.com');
    });

    it('answers 409 EMAIL_ALREADY_USED for an address another account holds', async () => {
        await createUser({ email: 'taken@example.com', username: 'holder' });
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        const response = await requestChange(await loginBearer(user.email), 'taken@example.com');

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('EMAIL_ALREADY_USED');
    });

    it.each([[{}], [{ email: 'not-an-address' }], [{ email: 'a@example.com', x: 1 }]])(
        'answers 422 for the body %j',
        async (body) => {
            const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

            const response = await api()
                .post('/account/email-change')
                .set('Authorization', await loginBearer(user.email))
                .send(body);

            expect(response.status).toBe(422);
        }
    );
});

describe('PUT and PATCH /account no longer take an email', () => {
    it('refuses an email on a PATCH with 422 and changes nothing', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        const response = await api()
            .patch('/account')
            .set('Authorization', await loginBearer(user.email))
            .send({ email: 'new@example.com' });

        expect(response.status).toBe(422);
        expect(await pendingOf(user.id)).toBeUndefined();
    });

    it('refuses an email on a PUT with 422 too', async () => {
        const user = await createUser({ email: 'old@example.com', verifiedAt: new Date() });

        const response = await api()
            .put('/account')
            .set('Authorization', await loginBearer(user.email))
            .send({ email: 'new@example.com', username: 'renamed', analyticsConsent: false });

        expect(response.status).toBe(422);
    });
});
