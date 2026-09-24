/**
 * @module
 * Two-step account deletion — `DELETE /account` mails a confirmation link, `DELETE
 * /account/delete-confirm` spends it — driven through the real Express app, so the status each
 * request answers with is what a caller actually receives, not what a mocked collaborator was
 * called with.
 *
 * `requestAccountDeletion`/`removeOwnAccount`'s own audit/analytics/token-issuance behaviour is
 * `self-service.test.ts`'s claim; mail content is `emails.test.ts`'s. This file is the HTTP
 * layer, and the property that matters most here: "no such account" and "mail sent" answer
 * identically, which is what enumeration prevention actually means.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { ACCOUNT_DELETE_TOKEN_TYPE } from '@modules/account/services';

/**
 * Every mail the app queued, newest last — same convention as `two-factor.test.ts`. Named
 * `mock*` because `jest.mock` is hoisted above the imports and may only close over identifiers
 * with that prefix.
 */
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

/**
 * Every `userService` function delegates to the real implementation, `findByEmail` included —
 * this test only ever overrides ONE call of it, with `mockResolvedValueOnce`, to reach the
 * enumeration-prevention branch. `getAuth` re-reads the caller by ID on every request (see
 * `session/resolver.ts`), so a genuinely deleted account 401s before the controller runs at all —
 * there is no black-box way to hold a live session with no matching row behind it. What IS real is
 * the gap between that read and the controller's OWN read a moment later: a concurrent hard delete
 * (another tab, an admin) landing in between. `findByEmail` is the narrowest seam that reaches, and
 * everything downstream of it — routing, `isAuth`, the real response — still runs unmocked.
 */
jest.mock('@modules/users', () => {
    const actual = jest.requireActual<typeof import('@modules/users')>('@modules/users');
    return {
        ...actual,
        userService: { ...actual.userService, findByEmail: jest.fn(actual.userService.findByEmail) }
    };
});

const mockFindByEmail = userService.findByEmail as jest.MockedFunction<
    typeof userService.findByEmail
>;

setupTestDb();

beforeEach(() => {
    mockOutbox.length = 0;
});

/** A signed-in account and its bearer — fresh enough for `requireFreshAuth(CRITICAL)`. */
const authenticate = async () => {
    const user = await createUser({ email: 'doomed@example.com' });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    return { user, bearer: `Bearer ${login.body.data.token as string}` as const };
};

describe('DELETE /account — deleteAccountRequest', () => {
    it('requires a live session', async () => {
        const response = await api().delete('/account').send();

        expect(response.status).toBe(401);
    });

    it("mails a deletion link and returns 200 for the caller's own account", async () => {
        const { bearer } = await authenticate();

        const response = await api().delete('/account').set('Authorization', bearer).send();

        expect(response.status).toBe(200);
        expect(mockOutbox).toHaveLength(1);
        expect(mockOutbox[0].template).toBe('account.delete-request');
    });

    it('answers the same 200, and sends no mail, when the lookup misses (enumeration prevention)', async () => {
        const { bearer } = await authenticate();
        mockFindByEmail.mockResolvedValueOnce(undefined);

        const response = await api().delete('/account').set('Authorization', bearer).send();

        expect(response.status).toBe(200);
        expect(mockOutbox).toEqual([]);
    });
});

describe('DELETE /account/delete-confirm — deleteAccountConfirm', () => {
    it('spends a live token, hard-deletes the account, clears the session cookies, and returns 200', async () => {
        const user = await createUser({ email: 'confirmed-gone@example.com' });
        await user.tokenAdd(ACCOUNT_DELETE_TOKEN_TYPE, 3_600_000, 'live-delete-token');

        const response = await api()
            .delete('/account/delete-confirm')
            .send({ token: 'live-delete-token' });

        expect(response.status).toBe(200);
        expect(await userRepository.findById(user.id)).toBeNull();
        // The two flags/expiry mechanics of a clear are `cookies.test.ts`'s own unit coverage;
        // this only asks whether the confirm route actually reaches them.
        const cookies = response.get('Set-Cookie') ?? [];
        expect(cookies.some((cookie) => cookie.startsWith('jwt='))).toBe(true);
        expect(cookies.some((cookie) => cookie.startsWith('isAuth='))).toBe(true);
    });

    it('refuses a token that was never issued, and leaves the account in place', async () => {
        const user = await createUser({ email: 'safe@example.com' });

        const response = await api()
            .delete('/account/delete-confirm')
            .send({ token: 'never-issued' });

        expect(response.status).toBe(422);
        expect(await userRepository.findById(user.id)).not.toBeNull();
    });
});
