/**
 * @module
 * Contract tests for the account-lifecycle operations `api.contract.test.ts` does not reach: the
 * two-step deletion, the password-reset request, logging out everywhere, the breach check while
 * typing, and the expired-token sweep. Each success is driven for real — the mailed token read
 * back out of the queue — so the body checked against the spec is the one a client receives.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createUser } from '@modules/users/tests/factories';
import { userRepository } from '@modules/users/tests/factories';
import * as mailerPort from '@infrastructure/adapters/mailer';

// The queue, not the copy — the token each flow mails is read back from here.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/adapters/mailer'),
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

setupTestDb();

beforeEach(() => {
    (mailerPort.enqueueEmail as jest.Mock).mockClear();
});

/**
 * The one-time token from the newest queued mail of a template — what the recipient's link says.
 *
 * @param template - the mail template the flow sends
 */
const mailedToken = (template: string): string => {
    const enqueueEmail = mailerPort.enqueueEmail as jest.MockedFunction<
        typeof mailerPort.enqueueEmail
    >;
    const mail = enqueueEmail.mock.calls.findLast(([, name]) => name === template);
    const link = (mail?.[2] as { linkUrl?: string } | undefined)?.linkUrl ?? '';
    const token = /[&?]token=([^&]+)/.exec(link)?.[1];
    if (!token) throw new Error(`no token in a queued '${template}' mail`);
    return decodeURIComponent(token);
};

describe('DELETE /account and DELETE /account/delete-confirm', () => {
    it('matches the contract for the request, then for the confirm, which removes the account', async () => {
        const { user, bearer } = await authenticateAs('user');

        const request = await api().delete('/account').set('Authorization', bearer);

        expect(request.status).toBe(200);
        expect(request).toSatisfyApiSpec();

        const confirm = await api()
            .delete('/account/delete-confirm')
            .send({ token: mailedToken('account.delete-request') });

        expect(confirm.status).toBe(200);
        expect(confirm).toSatisfyApiSpec();
        await expect(userRepository.findById(String(user._id))).resolves.toBeNull();
    });

    it('matches the error contract for a token nobody was sent', async () => {
        const response = await api()
            .delete('/account/delete-confirm')
            .send({ token: 'never-issued' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a delete request with no session', async () => {
        const response = await api().delete('/account');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/reset', () => {
    it('matches the contract for a known address, and mails the link', async () => {
        const user = await createUser({ email: 'forgetful@example.com' });

        const response = await api().post('/account/reset').send({ email: user.email });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(mailedToken('account.reset-request')).toEqual(expect.any(String));
    });

    it('answers an unknown address exactly like a known one — no account enumeration', async () => {
        const response = await api().post('/account/reset').send({ email: 'nobody@example.com' });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(mailerPort.enqueueEmail).not.toHaveBeenCalled();
    });

    it('matches the error contract for a body that is not an address', async () => {
        const response = await api().post('/account/reset').send({ email: 'not-an-email' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/logout-all', () => {
    it('matches the contract, and ends every session the account had', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api().post('/account/logout-all').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        const stored = await userRepository.findByIdWithCredentials(String(user._id));
        expect(stored!.tokens.filter(({ type }) => type === 'refresh')).toEqual([]);
    });
});

describe('POST /account/password/check', () => {
    it('matches the contract for a candidate on the bundled breach list', async () => {
        const response = await api().post('/account/password/check').send({ password: 'password' });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a candidate nobody has breached', async () => {
        const response = await api()
            .post('/account/password/check')
            .send({ password: 'Unlikely-Correct-Horse-7f3a' });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an empty candidate', async () => {
        const response = await api().post('/account/password/check').send({ password: '' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /account/tokens/expired', () => {
    it('matches the contract for an operator', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().delete('/account/tokens/expired').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a customer', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().delete('/account/tokens/expired').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});
