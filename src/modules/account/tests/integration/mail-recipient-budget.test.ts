/**
 * The per-RECIPIENT mail budget, through every door that can point mail at a stranger: the two
 * routes whose body names the address (signup, reset), and the three services that chose the
 * recipient themselves (verification resend, pending-email resend, email change).
 *
 * The budget bounds the VICTIM of a mail bomb, which no budget on the caller does. Its key is the
 * canonical mailbox, so the cases that matter send `+tag` and Gmail-dot variants of one inbox.
 */

import express from 'express';
import supertest from 'supertest';
import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { testCallerContext } from '@tests/callers';
import { asReject } from '@tests/response';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { accountService, updateProfile } from '@modules/account/services';

setupTestDb();

afterEach(() => jest.resetModules());

/** Run `body` with a mailbox budget of `limit` a day. */
const withBudget = (limit: number, body: () => Promise<void>) =>
    withEnvironment('NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX', String(limit), body);

/** A route behind the body-address limiter, answering 200 when the request gets through. */
const routeBehindLimiter = async () => {
    // Fresh module: the store a budget counts in lives in module state.
    jest.resetModules();
    const { mailRecipientLimiter } = await import('@modules/account/mail-budget');
    const app = express();
    app.use(express.json());
    app.post('/mail', mailRecipientLimiter, (_request, response) => {
        response.status(200).json({});
    });
    return app;
};

/** The status of one request naming `email`. */
const post = (app: express.Express, body: unknown): Promise<number> =>
    supertest(app)
        .post('/mail')
        .send(body as object)
        .then((response) => response.status);

describe('the route door — signup and reset', () => {
    it('refuses the mail once one mailbox has spent its day', () =>
        withBudget(2, async () => {
            const app = await routeBehindLimiter();

            const statuses = [
                await post(app, { email: 'victim@example.com' }),
                await post(app, { email: 'victim@example.com' }),
                await post(app, { email: 'victim@example.com' })
            ];

            expect(statuses).toEqual([200, 200, 429]);
        }));

    // The attack this exists for: every `+tag` looked like a new address, so a per-address budget
    // never filled.
    it('counts every +tag and casing of one mailbox as the same inbox', () =>
        withBudget(2, async () => {
            const app = await routeBehindLimiter();

            const statuses = [
                await post(app, { email: 'victim+1@example.com' }),
                await post(app, { email: 'VICTIM+2@Example.com' }),
                await post(app, { email: 'victim+3@example.com' })
            ];

            expect(statuses).toEqual([200, 200, 429]);
        }));

    it('counts Gmail dot variants as one inbox, and no other provider’s', () =>
        withBudget(1, async () => {
            const app = await routeBehindLimiter();

            expect(await post(app, { email: 'v.i.c.tim@gmail.com' })).toBe(200);
            expect(await post(app, { email: 'victim@gmail.com' })).toBe(429);

            expect(await post(app, { email: 'v.ictim@example.com' })).toBe(200);
            expect(await post(app, { email: 'victim@example.com' })).toBe(200);
        }));

    it('leaves another mailbox untouched, and answers with Retry-After', () =>
        withBudget(1, async () => {
            const app = await routeBehindLimiter();
            await post(app, { email: 'victim@example.com' });

            const refused = await supertest(app)
                .post('/mail')
                .send({ email: 'victim@example.com' });
            const other = await post(app, { email: 'bystander@example.com' });

            expect(refused.status).toBe(429);
            expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);
            expect(refused.body.errors[0].code).toBe('RATE_LIMITED');
            expect(other).toBe(200);
        }));

    it('lets a body naming no address through, for validation to answer', () =>
        withBudget(1, async () => {
            const app = await routeBehindLimiter();

            expect(await post(app, {})).toBe(200);
            expect(await post(app, { email: 5 })).toBe(200);
        }));
});

describe('the service doors — the recipient is chosen by the server', () => {
    it('charges the verification resend to the account’s own mailbox', () =>
        withBudget(1, async () => {
            const first = await createUser({ email: 'resend+a@example.com' });
            const second = await createUser({ email: 'resend+b@example.com' });

            const sent = await accountService.requestEmailVerificationFor(
                first.id,
                testCallerContext
            );
            const refused = await accountService.requestEmailVerificationFor(
                second.id,
                testCallerContext
            );

            expect(sent.success).toBe(true);
            expect(asReject(refused).status).toBe(429);
            expect(asReject(refused).errors[0].code).toBe('RATE_LIMITED');
        }));

    it('charges the pending-email resend to the pending mailbox', () =>
        withBudget(2, async () => {
            const first = await createUser({ email: 'one@example.com', verifiedAt: new Date() });
            const second = await createUser({ email: 'two@example.com', verifiedAt: new Date() });
            // Each change request spends one mail to the victim mailbox; the resend would be the third.
            await updateProfile(first.id, { email: 'pending+1@example.com' }, testCallerContext);
            await updateProfile(second.id, { email: 'pending+2@example.com' }, testCallerContext);

            const refused = await accountService.resendPendingEmailVerificationFor(
                first.id,
                testCallerContext
            );

            expect(asReject(refused).status).toBe(429);
        }));

    it('refuses an email change to a mailbox that has spent its day, and saves nothing', () =>
        withBudget(1, async () => {
            const first = await createUser({ email: 'one@example.com', verifiedAt: new Date() });
            const second = await createUser({ email: 'two@example.com', verifiedAt: new Date() });
            await updateProfile(first.id, { email: 'change+1@example.com' }, testCallerContext);

            const refused = await updateProfile(
                second.id,
                { email: 'change+2@example.com' },
                testCallerContext
            );

            expect(asReject(refused).status).toBe(429);
            const stored = await userRepository.findByIdWithCredentials(second.id);
            expect(stored?.pendingEmail).toBeUndefined();
        }));

    it('does not charge a change that is a no-op (the current or the already-pending address)', () =>
        withBudget(1, async () => {
            const user = await createUser({ email: 'one@example.com', verifiedAt: new Date() });
            await updateProfile(user.id, { email: 'noop@example.com' }, testCallerContext);

            const again = await updateProfile(
                user.id,
                { email: 'noop@example.com' },
                testCallerContext
            );
            const current = await updateProfile(
                user.id,
                { email: 'one@example.com' },
                testCallerContext
            );

            expect(again.success).toBe(true);
            expect(current.success).toBe(true);
        }));
});
