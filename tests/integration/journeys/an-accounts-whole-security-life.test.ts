/**
 * @module
 * Journey: an account's whole security life.
 *
 * Signup behind a human check, a second factor, a machine credential, a password reset that takes
 * every other session and the credential with it, the step-up that guards an email change, and
 * the two links that must lapse: the email-change undo and the data export.
 *
 * The clock only moves forward, and every jump is followed by a fresh sign-in: a session dies
 * after a day, and the second factor's code changes every 30 seconds.
 */
import '@tests/contract';
import { ListAuditEntries200Response } from '@api/schemas.zod';
import { accessService } from '@modules/access';
import { settleInlineExports } from '@modules/account/services/export';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { setupTestDb } from '@tests/setup-test-db';
import { api, bearerForCookie, loginBearer } from '@tests/http';
import { bodyOf } from '@tests/body-of';
import { solvedChallenge, useAltcha } from '@tests/altcha';
import { setCookie } from '@tests/cookies';
import { advanceDate, freezeDate } from '@tests/clock';
import { runJob } from '@tests/drain';
import { mailsTo, useOutboxMail, waitForMail } from '@tests/journey-mail';
import { codeFor } from '@tests/totp';

setupTestDb();

beforeEach(() => {
    useOutboxMail();
    useAltcha();
});

afterEach(() => {
    jest.useRealTimers();
});

/** A day, in milliseconds. */
const DAY_MS = 86_400_000;

/** The account, its two passwords, and the address it moves to. */
const ACCOUNT = {
    email: 'security.life@example.com',
    username: 'securitylife',
    password: 'First-password-1!',
    replacement: 'Second-password-2!',
    movedTo: 'security.life.new@example.com'
};

/**
 * Signs in with a password and a second-factor code.
 *
 * @param email - the address to sign in as
 * @param password - the account's current password
 * @param code - a code for a step the account has not used yet
 * @returns the 2FA answer and the session cookie, to be turned into a bearer once: a refresh
 *   token is single-use
 */
const signIn = async (email: string, password: string, code: string) => {
    const challenged = await api().post('/account/login').send({ email, password });
    const response = await api()
        .post('/account/login/2fa')
        .send({ challenge: challenged.body.data.challenge, code });

    const cookie = setCookie(response, '__Host-session') ?? '';

    return { response, cookie };
};

it('keeps the account safe from signup to the last lapsed link', async () => {
    // Signup behind the human check, proved from the mail. Root then makes the account an admin,
    // so it may hold a machine credential.
    const signup = await api()
        .post('/account/signup')
        .set(await solvedChallenge())
        .send({
            email: ACCOUNT.email,
            username: ACCOUNT.username,
            password: ACCOUNT.password,
            passwordConfirm: ACCOUNT.password,
            termsAccepted: true
        })
        .expect(201);
    const verification = await waitForMail(ACCOUNT.email, 'account.verify-request');
    await api().post('/account/verify-confirm').send({ token: verification.token }).expect(200);
    await accessService.assignRole(
        String(signup.body.data.id),
        DEPLOYMENT_TENANT_ID,
        'tenant',
        'admin'
    );

    // Arm TOTP. Arming ends the session that did it, so the account signs in again, with a code.
    // The role came after the signup, so the account has no app yet: it enrols the real way.
    const plain = await loginBearer(ACCOUNT.email, ACCOUNT.password, {}, { arm: false });
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', plain)
        .send();
    const { secret } = setup.body.data as { secret: string };
    await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', plain)
        .send({ code: await codeFor(secret, 0) })
        .expect(200);
    // Arming ends the session that did it.
    await api().get('/account').set('Authorization', plain).expect(401);
    const armed = await signIn(ACCOUNT.email, ACCOUNT.password, await codeFor(secret, 1));
    expect(armed.response.status).toBe(200);
    const armedBearer = await bearerForCookie(armed.cookie);

    // A machine credential works until the account says it was compromised.
    const minted = await api()
        .post('/api-keys')
        .set('Authorization', armedBearer)
        .send({
            name: 'ci',
            permissions: ['read:WebhookSubscription'],
            expiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString()
        })
        .expect(201);
    const key = `Bearer ${minted.body.data.secret as string}`;
    await api().get('/webhooks/subscriptions').set('Authorization', key).expect(200);

    // Forgot the password: the reset ends the session and the credential, and mails about both.
    await api()
        .post('/account/reset')
        .set(await solvedChallenge())
        .send({ email: ACCOUNT.email })
        .expect(200);
    const reset = await waitForMail(ACCOUNT.email, 'account.reset-request');
    await api()
        .post('/account/reset-confirm')
        .send({
            token: reset.token,
            password: ACCOUNT.replacement,
            passwordConfirm: ACCOUNT.replacement
        })
        .expect(200);
    await api().get('/account').set('Authorization', armedBearer).expect(401);
    await api().get('/webhooks/subscriptions').set('Authorization', key).expect(401);
    expect(mailsTo(ACCOUNT.email, 'api-keys.revoked')).toHaveLength(1);

    // From here the clock is frozen and only moves forward. A new session goes stale past the
    // sensitive window, and an email change then asks for the second factor again.
    freezeDate();
    advanceDate(60_000);
    const third = await signIn(ACCOUNT.email, ACCOUNT.replacement, await codeFor(secret, 0));
    advanceDate(901_000);
    const stale = await bearerForCookie(third.cookie);
    const refused = await api()
        .patch('/account')
        .set('Authorization', stale)
        .send({ email: ACCOUNT.movedTo });
    expect(refused.status).toBe(401);
    expect(refused.body.errors[0]).toMatchObject({
        code: 'REAUTH_REQUIRED',
        details: { methods: ['otp'] }
    });
    const reauthed = await api()
        .post('/account/reauth')
        .set('Authorization', stale)
        .send({ method: 'password', password: ACCOUNT.replacement, otp: await codeFor(secret, 0) })
        .expect(200);
    // A jwt session answers a token; a cookie session, called with a bearer, its session id.
    const { token, sessionToken } = reauthed.body.data as { token?: string; sessionToken?: string };
    const fresh = `Bearer ${token ?? sessionToken ?? ''}`;
    await api()
        .patch('/account')
        .set('Authorization', fresh)
        .send({ email: ACCOUNT.movedTo })
        .expect(200);

    // The new address proves itself; the old one holds a 7-day undo link.
    const proof = await waitForMail(ACCOUNT.movedTo, 'account.verify-request');
    await api().post('/account/email-change-confirm').send({ token: proof.token }).expect(200);
    const notice = mailsTo(ACCOUNT.email, 'account.email-change-notice');
    expect(notice).toHaveLength(1);

    // The undo link is dead after 7 days, and the sweep forgets the old address.
    advanceDate(8 * DAY_MS);
    const undo = await api().post('/account/email-change-undo').send({ token: notice[0].token });
    expect(undo.status).toBe(422);
    expect(await runJob('reap:previous-emails')).toEqual({ cleared: 1 });

    // An export is ready for 7 days; after that it is gone, and the sweep drops its record.
    advanceDate(60_000);
    const exporter = await signIn(ACCOUNT.movedTo, ACCOUNT.replacement, await codeFor(secret, 0));
    const exporterBearer = await bearerForCookie(exporter.cookie);
    const requested = await api()
        .post('/account/export')
        .set('Authorization', exporterBearer)
        .send()
        .expect(202);
    await settleInlineExports();
    const exportPath = `/account/export/${String(requested.body.data.id)}`;
    expect(mailsTo(ACCOUNT.movedTo, 'account.export-ready')).toHaveLength(1);
    await api().get(exportPath).set('Authorization', exporterBearer).expect(200);
    advanceDate(8 * DAY_MS + 60_000);
    const later = await signIn(ACCOUNT.movedTo, ACCOUNT.replacement, await codeFor(secret, 0));
    const laterBearer = await bearerForCookie(later.cookie);
    await api().get(exportPath).set('Authorization', laterBearer).expect(404);
    expect(await runJob('reap:account-exports')).toMatchObject({ rows: 1 });

    // The trail and the mail tell the same story.
    const audit = bodyOf(
        await api().get('/audit').query({ pageSize: 100 }).set('Authorization', laterBearer),
        ListAuditEntries200Response
    ).data.items.map(({ action }) => action);
    expect(audit).toEqual(
        expect.arrayContaining([
            'auth.signup',
            'auth.email_verify.completed',
            'auth.two_factor.enrolled',
            'admin.api_key.minted',
            'system.api_keys.revoked_on_compromise',
            'auth.password_reset.requested',
            'auth.password_reset.completed',
            'auth.reauth',
            'auth.email_change.requested',
            'auth.email_change.completed',
            'auth.data_export.requested'
        ])
    );
    expect(mailsTo(ACCOUNT.email, 'account.two-factor-changed')).toHaveLength(1);
    expect(mailsTo(ACCOUNT.email, 'api-keys.minted')).toHaveLength(1);
    expect(mailsTo(ACCOUNT.email, 'account.reset-confirm')).toHaveLength(1);
});
