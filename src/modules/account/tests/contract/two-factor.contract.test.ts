/**
 * @module
 * Contract tests for the second-factor operations: the status read, turning 2FA off, removing one
 * method, regenerating backup codes, and mailing a login code. The behaviour behind each lives in
 * `integration/two-factor.test.ts`; this file holds each answer — success and refusal — to the
 * shape `openapi.yaml` publishes for it.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { api, loginBearer } from '@tests/http';
import { mintSession } from '../factories';
import { codeFor } from '@tests/totp';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

/** Every queued two-factor mail's code, newest last — what the recipient would type. */
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

// A mailed code is offered only where mail reaches a person (`mailDelivers`): the suite's default
// `log` drops it, the `outbox` keeps it. `enqueueEmail` is mocked below, so nothing is sent.
beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
});

beforeEach(() => {
    mockOutbox.length = 0;
});

/** A signed-in account and the bearer its next request carries. */
interface Session {
    user: Awaited<ReturnType<typeof createUser>>;
    bearer: `Bearer ${string}`;
}

/** A verified account, logged in — the email factor refuses an unverified address. */
const verifiedSession = async (): Promise<Session> => {
    const user = await createUser({ verifiedAt: new Date(), email: 'ada@example.com' });
    return { user, bearer: await loginBearer(user.email) };
};

/**
 * Carry on after a factor change ended the session. Arming or removing a factor revokes every
 * session the account holds; a browser's cookie is re-minted on the spot, but a client holding a
 * bearer has to sign in again, so this opens the session that login would have, claiming what the
 * factor proved.
 *
 * @param session - the session to carry on; its bearer is replaced
 */
const carryOn = async (session: Session): Promise<void> => {
    const { bearer } = await mintSession(session.user.id, { amr: ['pwd', 'otp'] });
    session.bearer = bearer;
};

/**
 * Arms the device factor, returning the secret for minting later codes.
 *
 * @param session - the caller's session, which carries on afterwards
 */
const armTotp = async (session: Session) => {
    const { bearer } = session;
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const { secret } = setup.body as { secret: string };
    const confirm = await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret, 0) });
    backupCodesOf.set(secret, confirm.body.backupCodes as string[]);
    await carryOn(session);
    return secret;
};

/** The backup codes each armed secret came with — what a SECOND factor proves itself against. */
const backupCodesOf = new Map<string, string[]>();

/**
 * Arms the email factor with the mailed code.
 *
 * @param session - the caller's session, which carries on afterwards
 * @param proof - a code from a factor already armed, which a second factor needs
 */
const armEmail = async (session: Session, proof?: string) => {
    const { bearer } = session;
    await api()
        .post('/account/2fa/methods/email/setup')
        .set('Authorization', bearer)
        .send(proof ? { code: proof } : {});
    const mail = mockOutbox.findLast(({ template }) => template === 'account.two-factor-code');
    await api()
        .post('/account/2fa/methods/email/confirm')
        .set('Authorization', bearer)
        .send({ code: String(mail?.data.code) });
    await carryOn(session);
};

describe('GET /account/2fa', () => {
    it('matches the contract for an account with a factor armed', async () => {
        const session = await verifiedSession();
        await armTotp(session);

        const response = await api().get('/account/2fa').set('Authorization', session.bearer);

        expect(response.status).toBe(200);
        expect(response.body.methods.map((m: { method: string }) => m.method)).toEqual(['totp']);
    });
});

describe('POST /account/2fa/backup-codes', () => {
    it('matches the contract, answering a fresh set on a current code', async () => {
        const session = await verifiedSession();
        const secret = await armTotp(session);

        const response = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', session.bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
        expect(response.body.backupCodes.length).toBeGreaterThan(0);
    });

    it('matches the error contract for a wrong code', async () => {
        const session = await verifiedSession();
        await armTotp(session);

        const response = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', session.bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });
});

describe('POST /account/2fa/methods/{method}/remove', () => {
    it('matches the contract when one of two factors is removed', async () => {
        const session = await verifiedSession();
        const secret = await armTotp(session);
        await armEmail(session, backupCodesOf.get(secret)?.[0]);

        const response = await api()
            .post('/account/2fa/methods/email/remove')
            .set('Authorization', session.bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
    });

    it('matches the error contract for a method this deployment does not run', async () => {
        const session = await verifiedSession();
        const secret = await armTotp(session);

        const response = await api()
            .post('/account/2fa/methods/carrier-pigeon/remove')
            .set('Authorization', session.bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(404);
    });
});

describe('POST /account/2fa/disable', () => {
    it('matches the contract, and leaves nothing armed', async () => {
        const session = await verifiedSession();
        const secret = await armTotp(session);

        const response = await api()
            .post('/account/2fa/disable')
            .set('Authorization', session.bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
        await carryOn(session);
        const status = await api().get('/account/2fa').set('Authorization', session.bearer);
        expect(status.body.methods).toEqual([]);
    });

    it('is gone at the old DELETE addresses', async () => {
        const session = await verifiedSession();
        const secret = await armTotp(session);
        const code = await codeFor(secret, 1);

        const whole = await api()
            .delete('/account/2fa')
            .set('Authorization', session.bearer)
            .send({ code });
        const one = await api()
            .delete('/account/2fa/methods/totp')
            .set('Authorization', session.bearer)
            .send({ code });

        // `/account/2fa` still answers GET, so the verb is wrong there (405); the method path is gone (404).
        expect([whole.status, one.status]).toEqual([405, 404]);
    });
});

describe('POST /account/login/2fa/send', () => {
    it('matches the contract, mailing a code for the challenge the password step issued', async () => {
        const session = await verifiedSession();
        await armEmail(session);
        const login = await api()
            .post('/account/login')
            .send({ email: session.user.email, password: PLAIN_PASSWORD });

        const response = await api()
            .post('/account/login/2fa/send')
            .send({ challenge: login.body.challenge as string, method: 'email' });

        expect(response.status).toBe(200);
        expect(response.body.sentTo).toBe('a***a@example.com');
    });

    it('matches the error contract for a challenge nobody issued', async () => {
        const response = await api()
            .post('/account/login/2fa/send')
            .send({ challenge: 'forged', method: 'email' });

        expect(response.status).toBe(401);
    });
});

describe('POST /account/2fa/methods/{method}/send', () => {
    it('matches the contract, mailing the signed-in account a code for an armed method', async () => {
        const session = await verifiedSession();
        await armEmail(session);

        const response = await api()
            .post('/account/2fa/methods/email/send')
            .set('Authorization', session.bearer)
            .send();

        expect(response.status).toBe(200);
        expect(response.body.sentTo).toBe('a***a@example.com');
    });

    it('matches the error contract for a method that is not armed', async () => {
        const session = await verifiedSession();

        const response = await api()
            .post('/account/2fa/methods/email/send')
            .set('Authorization', session.bearer)
            .send();

        expect(response.status).toBe(422);
    });
});

describe('POST /account/2fa/methods/{method}/setup with a code', () => {
    it('matches the error contract when a second method is started without one', async () => {
        const session = await verifiedSession();
        await armTotp(session);

        const response = await api()
            .post('/account/2fa/methods/email/setup')
            .set('Authorization', session.bearer)
            .send();

        expect(response.status).toBe(422);
    });
});
