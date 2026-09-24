/**
 * @module
 * Contract tests for the second-factor operations: the status read, turning 2FA off, removing one
 * method, regenerating backup codes, and mailing a login code. The behaviour behind each lives in
 * `integration/two-factor.test.ts`; this file holds each answer — success and refusal — to the
 * shape `openapi.yaml` publishes for it.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
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

beforeEach(() => {
    mockOutbox.length = 0;
});

/** A verified account, logged in — the email factor refuses an unverified address. */
const verifiedSession = async () => {
    const user = await createUser({ verifiedAt: new Date(), email: 'ada@example.com' });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return { user, bearer: `Bearer ${login.body.data.token as string}` };
};

/**
 * Arms the device factor, returning the secret for minting later codes.
 *
 * @param bearer - the caller's session
 */
const armTotp = async (bearer: string) => {
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const { secret } = setup.body.data as { secret: string };
    await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret, 0) });
    return secret;
};

/**
 * Arms the email factor with the mailed code.
 *
 * @param bearer - the caller's session
 */
const armEmail = async (bearer: string) => {
    await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send();
    const mail = mockOutbox.findLast(({ template }) => template === 'account.two-factor-code');
    await api()
        .post('/account/2fa/methods/email/confirm')
        .set('Authorization', bearer)
        .send({ code: String(mail?.data.code) });
};

describe('GET /account/2fa', () => {
    it('matches the contract for an account with a factor armed', async () => {
        const { bearer } = await verifiedSession();
        await armTotp(bearer);

        const response = await api().get('/account/2fa').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.methods.map((m: { method: string }) => m.method)).toEqual([
            'totp'
        ]);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract with no session', async () => {
        const response = await api().get('/account/2fa');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/2fa/backup-codes', () => {
    it('matches the contract, answering a fresh set on a current code', async () => {
        const { bearer } = await verifiedSession();
        const secret = await armTotp(bearer);

        const response = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
        expect(response.body.data.backupCodes.length).toBeGreaterThan(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a wrong code', async () => {
        const { bearer } = await verifiedSession();
        await armTotp(bearer);

        const response = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /account/2fa/methods/{method}', () => {
    it('matches the contract when one of two factors is removed', async () => {
        const { bearer } = await verifiedSession();
        const secret = await armTotp(bearer);
        await armEmail(bearer);

        const response = await api()
            .delete('/account/2fa/methods/email')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a method this deployment does not run', async () => {
        const { bearer } = await verifiedSession();
        const secret = await armTotp(bearer);

        const response = await api()
            .delete('/account/2fa/methods/carrier-pigeon')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /account/2fa', () => {
    it('matches the contract, and leaves nothing armed', async () => {
        const { bearer } = await verifiedSession();
        const secret = await armTotp(bearer);

        const response = await api()
            .delete('/account/2fa')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        const status = await api().get('/account/2fa').set('Authorization', bearer);
        expect(status.body.data.methods).toEqual([]);
    });

    it('matches the error contract with no session', async () => {
        const response = await api().delete('/account/2fa').send({ code: '123456' });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/login/2fa/send', () => {
    it('matches the contract, mailing a code for the challenge the password step issued', async () => {
        const { user, bearer } = await verifiedSession();
        await armEmail(bearer);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        const response = await api()
            .post('/account/login/2fa/send')
            .send({ challenge: login.body.data.challenge as string, method: 'email' });

        expect(response.status).toBe(200);
        expect(response.body.data.sentTo).toBe('a***a@example.com');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a challenge nobody issued', async () => {
        const response = await api()
            .post('/account/login/2fa/send')
            .send({ challenge: 'forged', method: 'email' });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
