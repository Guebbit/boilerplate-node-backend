/**
 * @module
 * `services/index.ts` — the security invariants of signup, login, password change and bulk
 * token removal. Grouped by the invariant each defends, not by function: the two login failures
 * must be INDISTINGUISHABLE (or the endpoint enumerates accounts), a soft-deleted account must
 * not log in, and a password must never be stored as it arrived — each survives a mutation a
 * happy-path test cannot see, which is a real incident if it regresses.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import {
    createUser,
    PASSPHRASE_PASSWORD,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { accountService } from '@modules/account/services';
import { hashToken } from '@infrastructure/security/hash-token';
import { userRepository } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';
import { plantSession, plantToken, sessionRowsOf, tokenHashesOf, tokenRowsOf } from '../factories';
import { asReject, asSuccess } from '@tests/response';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { accountAnalyticsEvents } from '../../analytics';
import { observePort } from '@tests/ports';
import { setEnvironment, withEnvironmentOverrides } from '@tests/environment';

/*
 * The analytics port is REPLACED, not spied on: `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes. See `tests/support/ports.ts`.
 */
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();

describe('signup', () => {
    it('creates the account and returns it', async () => {
        const response = asSuccess(
            await accountService.signup(
                {
                    email: 'new@example.com',
                    username: 'newuser',
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD,
                    analyticsConsent: undefined,
                    termsAccepted: true
                },
                testCallerContext
            )
        );

        expect(response.data.email).toBe('new@example.com');
        expect(response.data.username).toBe('newuser');

        // Persisted, not merely returned — the difference between `create` and a constructed doc.
        const stored = await userRepository.findOne({ email: 'new@example.com' });
        expect(stored).not.toBeNull();
    });

    it('never stores the password as it was sent', async () => {
        // The `pre('save')` hook hashes it. If that hook stops firing — or someone "simplifies"
        // this service to write the field directly — every account in the database becomes a
        // plaintext credential, and no happy-path assertion notices.
        await accountService.signup(
            {
                email: 'hashed@example.com',
                username: 'hasheduser',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: undefined,
                termsAccepted: true
            },
            testCallerContext
        );

        const stored = await userRepository.findOneWithCredentials({ email: 'hashed@example.com' });

        expect(stored?.password).toBeDefined();
        expect(stored?.password).not.toBe(PLAIN_PASSWORD);
        // The PHC prefix, so this asserts "hashed with argon2id", not merely "differs".
        expect(stored?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });

    it('rejects a mismatched confirmation with 422 and says so', async () => {
        const response = asReject(
            await accountService.signup(
                {
                    email: 'mismatch@example.com',
                    username: 'mismatchuser',
                    password: PLAIN_PASSWORD,
                    passwordConfirm: 'something-else',
                    analyticsConsent: undefined,
                    termsAccepted: true
                },
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        expect(response.errors.length).toBeGreaterThan(0);
    });

    it('rejects an address already in use with 409, not 422', async () => {
        // The status is the contract: 409 tells a client "this is a conflict with existing state",
        // which is what drives "that email is taken" in the UI rather than a field-level error.
        await createUser({ email: 'taken@example.com' });

        const response = asReject(
            await accountService.signup(
                {
                    email: 'taken@example.com',
                    username: 'someoneelse',
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD,
                    analyticsConsent: undefined,
                    termsAccepted: true
                },
                testCallerContext
            )
        );

        expect(response.status).toBe(409);
    });

    describe('NODE_ANTIBOT_EMAIL_POLICY', () => {
        // Every anti-automation rung must be provably off by default.
        it('is off by default — a known disposable domain still signs up', async () => {
            setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: undefined });

            const response = asSuccess(
                await accountService.signup(
                    {
                        email: 'someone@mailinator.com',
                        username: 'disposableuser',
                        password: PLAIN_PASSWORD,
                        passwordConfirm: PLAIN_PASSWORD,
                        analyticsConsent: undefined,
                        termsAccepted: true
                    },
                    testCallerContext
                )
            );

            expect(response.data.email).toBe('someone@mailinator.com');
        });

        it('answers success for a disposable domain when the policy is on, but never persists it', async () => {
            setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'disposable' });

            const response = asSuccess(
                await accountService.signup(
                    {
                        email: 'someone@mailinator.com',
                        username: 'disposableuser',
                        password: PLAIN_PASSWORD,
                        passwordConfirm: PLAIN_PASSWORD,
                        analyticsConsent: undefined,
                        termsAccepted: true
                    },
                    testCallerContext
                )
            );

            // The ruse: an envelope indistinguishable from a genuine signup, built from a
            // document `isNew` marks as never saved — `post-signup.ts` reads that flag to keep
            // the audit trail and the upload cleanup honest.
            expect(response.data.email).toBe('someone@mailinator.com');
            expect(response.data.isNew).toBe(true);

            // Not persisted — the refused address never became an account.
            const stored = await userRepository.findOne({ email: 'someone@mailinator.com' });
            expect(stored).toBeNull();
        });
    });

    it.each([
        ['not-an-email', 'gooduser', PLAIN_PASSWORD],
        ['bad-username@example.com', 'ab', PLAIN_PASSWORD],
        ['short-password@example.com', 'gooduser', 'abc']
    ])('rejects invalid input (%s / %s) with 422', async (email, username, password) => {
        const response = asReject(
            await accountService.signup(
                {
                    email: email,
                    username: username,
                    password: password,
                    passwordConfirm: password,
                    analyticsConsent: undefined,
                    termsAccepted: true
                },
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        expect(response.errors.length).toBeGreaterThan(0);
    });

    // `''` is never a legal `imageUrl` (the shared `ImageUrl` schema's own `minLength: 1`) — an
    // absent image is an absent field, and the client draws its own placeholder.
    it('stores an absent image as no field at all, never an empty string', async () => {
        await accountService.signup(
            {
                email: 'noimage@example.com',
                username: 'noimageuser',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: undefined,
                termsAccepted: true
            },
            testCallerContext
        );

        const stored = await userRepository.findOne({ email: 'noimage@example.com' });

        // No image is an absent field, never a placeholder and never `''`.
        expect(stored?.imageUrl).toBeUndefined();
    });

    it('rejects signup with 422 when terms are not accepted', async () => {
        const response = asReject(
            await accountService.signup(
                {
                    email: 'noterms@example.com',
                    username: 'notermsuser',
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD,
                    analyticsConsent: undefined,
                    termsAccepted: false
                },
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        expect(response.errors.length).toBeGreaterThan(0);

        const stored = await userRepository.findOne({ email: 'noterms@example.com' });
        expect(stored).toBeNull();
    });

    it('records when the terms were accepted and which text, and when consent was answered', async () => {
        await accountService.signup(
            {
                email: 'consenting@example.com',
                username: 'consentinguser',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: true,
                termsAccepted: true
            },
            testCallerContext
        );

        const stored = await userRepository.findOne({ email: 'consenting@example.com' });
        expect(stored?.termsAcceptedAt).toBeInstanceOf(Date);
        expect(stored?.termsVersion).toBe('1');
        expect(stored?.analyticsConsent).toBe(true);
        expect(stored?.analyticsConsentAt).toBeInstanceOf(Date);
    });

    it('stamps the configured terms version, and records no consent date when none was asked', async () => {
        await withEnvironmentOverrides({ NODE_TERMS_VERSION: '2026-10' }, () =>
            accountService
                .signup(
                    {
                        email: 'unasked@example.com',
                        username: 'unasked',
                        password: PLAIN_PASSWORD,
                        passwordConfirm: PLAIN_PASSWORD,
                        analyticsConsent: undefined,
                        termsAccepted: true
                    },
                    testCallerContext
                )
                .then(() => undefined)
        );

        const stored = await userRepository.findOne({ email: 'unasked@example.com' });
        expect(stored?.termsVersion).toBe('2026-10');
        expect(stored?.analyticsConsentAt).toBeUndefined();
    });
});

describe('login', () => {
    const createLoginUser = (overrides: Partial<UserDocument> = {}) =>
        createUser({
            email: 'login@example.com',
            username: 'loginuser',
            password: PLAIN_PASSWORD,
            ...overrides
        } as Parameters<typeof createUser>[0]);

    it('returns the user for correct credentials', async () => {
        await createLoginUser();

        const response = asSuccess(await accountService.login('login@example.com', PLAIN_PASSWORD));

        expect(response.data.email).toBe('login@example.com');
    });

    it('does not reveal whether the account exists', async () => {
        // THE case in this file. Two different failures — no such account, and wrong password —
        // must be one answer, or the endpoint becomes an account-existence oracle: an attacker
        // learns which addresses are registered by reading the difference, which is the input to
        // credential stuffing and to targeted phishing.
        //
        // Asserting them equal (rather than each against a literal) is deliberate: it keeps
        // holding when the message or status is deliberately changed later, and fails the moment
        // the two arms diverge for any reason.
        await createLoginUser();

        const unknownAccount = asReject(
            await accountService.login('nobody@example.com', PLAIN_PASSWORD)
        );
        const wrongPassword = asReject(
            await accountService.login('login@example.com', 'not-the-password')
        );

        expect(unknownAccount.status).toBe(401);
        expect(wrongPassword.status).toBe(401);
        expect(wrongPassword.errors).toEqual(unknownAccount.errors);
        expect(wrongPassword.message).toBe(unknownAccount.message);
    });

    it('refuses a soft-deleted account', async () => {
        // `deletedAt: undefined` in the filter is the whole of this rule, and it is one key in an
        // object literal. Dropping it lets someone who deleted their account keep signing in —
        // and every other login test still passes, because they use live accounts.
        await createLoginUser({ deletedAt: new Date() });

        const response = asReject(await accountService.login('login@example.com', PLAIN_PASSWORD));

        expect(response.status).toBe(401);
    });

    it('rejects a password too short to be valid before checking it, for anyone', async () => {
        // `LoginBody` enforces the same minimum length signup does, so a one-character password
        // is a malformed request (422) rather than wrong credentials (401).
        //
        // That is worth pinning precisely BECAUSE it is a second answer the endpoint can give:
        // the two must not depend on whether the account exists, or the shape of the reply leaks
        // the thing the 401s above are careful not to.
        await createLoginUser();

        const existingAccount = asReject(await accountService.login('login@example.com', 'x'));
        const unknownAccount = asReject(await accountService.login('nobody@example.com', 'x'));

        expect(existingAccount.status).toBe(422);
        expect(unknownAccount.status).toBe(422);
        expect(existingAccount.errors).toEqual(unknownAccount.errors);
    });

    it.each([
        ['a missing email', undefined, PLAIN_PASSWORD],
        ['a missing password', 'login@example.com', undefined],
        ['a malformed email', 'not-an-email', PLAIN_PASSWORD]
    ])('rejects %s with 422, before touching the database', async (_label, email, password) => {
        // 422 rather than 401: the request could not be understood, which is a different fact
        // from "these credentials are wrong" and must not be flattened into it.
        const response = asReject(await accountService.login(email, password));

        expect(response.status).toBe(422);
    });
});

describe('validatePasswordChange', () => {
    it('returns no messages for an acceptable pair', () => {
        expect(accountService.validatePasswordChange(PLAIN_PASSWORD, PLAIN_PASSWORD)).toEqual([]);
    });

    it('reports a mismatch', () => {
        const messages = accountService.validatePasswordChange(
            PLAIN_PASSWORD,
            REPLACEMENT_PASSWORD
        );

        expect(messages.length).toBeGreaterThan(0);
    });

    it('reports a password that is too short', () => {
        expect(accountService.validatePasswordChange('abc', 'abc').length).toBeGreaterThan(0);
    });

    it('reports empty input rather than accepting it', () => {
        // Called with no arguments by a caller that forgot to pass the body through. Defaulting
        // to `''` must produce errors, not an empty array meaning "fine".
        expect(accountService.validatePasswordChange().length).toBeGreaterThan(0);
    });
});

describe('passwordChange', () => {
    it('writes the new password, hashed', async () => {
        const user = await createUser({
            email: 'change@example.com',
            password: PASSPHRASE_PASSWORD
        });

        const response = asSuccess(
            await accountService.passwordChange(user, PLAIN_PASSWORD, PLAIN_PASSWORD)
        );

        expect(response.status).toBe(200);

        const stored = await userRepository.findOneWithCredentials({ email: 'change@example.com' });
        expect(stored?.password).toMatch(/^\$argon2id\$/);
        // And it is the NEW one: the login flow is the honest way to assert that.
        const loggedIn = await accountService.login('change@example.com', PLAIN_PASSWORD);
        expect(loggedIn.success).toBe(true);
    });

    it('leaves the stored password untouched when the pair is rejected', async () => {
        // The ordering guarantee: validation happens before the assignment, so a rejected change
        // is not a change. If the write moved ahead of the check, this account's password would
        // be set to a value its owner never confirmed.
        const user = await createUser({
            email: 'unchanged@example.com',
            password: PASSPHRASE_PASSWORD
        });

        const response = asReject(
            await accountService.passwordChange(user, PLAIN_PASSWORD, REPLACEMENT_PASSWORD)
        );

        expect(response.status).toBe(422);

        const stillWorks = await accountService.login('unchanged@example.com', PASSPHRASE_PASSWORD);
        expect(stillWorks.success).toBe(true);
    });
});

describe('issueToken', () => {
    it('stores a token of the requested type and returns it', async () => {
        const user = await createUser({ email: 'tokenadd@example.com' });

        const token = await accountService.issueToken(user.id, 'password', 60_000);

        const rows = await tokenRowsOf(user.id);
        expect(rows).toHaveLength(1);
        // Hashed at rest — the returned `token` is the plaintext, storage holds its digest.
        expect(rows[0]?.tokenHash).toBe(hashToken(token));
        expect(rows[0]?.type).toBe('password');
    });

    it('returns 32 hex characters, so the token is 16 bytes of real entropy', () => {
        // The length is the security parameter. `randomBytes(16).toString('hex')` is 32 chars;
        // anything shorter is a guessable reset link, and the value is only ever compared for
        // equality, so nothing else in the system would complain.
        return createUser({ email: 'entropy@example.com' })
            .then((user) => accountService.issueToken(user.id, 'password', 60_000))
            .then((token) => {
                expect(token).toMatch(/^[\da-f]{32}$/);
            });
    });

    it('keeps both tokens when two of a many-live kind are issued concurrently', async () => {
        // The invariant: each issue is its own row, so two writers cannot lose each other's token.
        // Concretely: two "delete my account" clicks, and one of the two emailed links silently
        // does not work, if one write could overwrite the other.
        const user = await createUser({ email: 'concurrent@example.com' });

        const [first, second] = await Promise.all([
            accountService.issueToken(user.id, 'delete', 60_000),
            accountService.issueToken(user.id, 'delete', 60_000)
        ]);

        const rows = await tokenRowsOf(user.id);
        expect(rows.map(({ tokenHash }) => tokenHash).toSorted()).toEqual(
            [first, second].map((value) => hashToken(value)).toSorted()
        );
    });

    it('leaves one live link when two of a one-live kind are issued concurrently', async () => {
        // The mirror: for a reset link the point is that the OLD one dies, atomically, so a race
        // cannot leave two working links.
        const user = await createUser({ email: 'concurrent-reset@example.com' });

        const [first, second] = await Promise.all([
            accountService.issueToken(user.id, 'password', 60_000),
            accountService.issueToken(user.id, 'password', 60_000)
        ]);

        const rows = await tokenRowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect([first, second].map((value) => hashToken(value))).toContain(rows[0]?.tokenHash);
    });

    it('issues a different token every time', async () => {
        const user = await createUser({ email: 'distinct@example.com' });

        const first = await accountService.issueToken(user.id, 'password', 60_000);
        const second = await accountService.issueToken(user.id, 'password', 60_000);

        expect(first).not.toBe(second);
    });

    it('sets the expiry the requested lifetime from now', async () => {
        const user = await createUser({ email: 'expiry@example.com' });
        const before = Date.now();

        await accountService.issueToken(user.id, 'password', 60_000);

        const [row] = await tokenRowsOf(user.id);
        // Offset from *now*, not an absolute constant: an expiry computed from the wrong origin
        // is either already expired or effectively permanent.
        expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
        expect(row.expiresAt.getTime()).toBeLessThan(before + 60_000 + 10_000);
    });
});

/** A user holding two sessions and one reset token, so "only the sessions" is observable. */
const createUserWithSessionsAndAReset = async () => {
    const user = await createUser({ email: 'removeall@example.com' });
    await plantSession(user.id, 'refresh-a');
    await plantSession(user.id, 'refresh-b');
    await plantToken(user.id, 'password', 'reset-a');
    return user;
};

describe('logoutEverywhere', () => {
    it('removes every session', async () => {
        const user = await createUserWithSessionsAndAReset();

        asSuccess(await accountService.logoutEverywhere(String(user._id), testCallerContext));

        expect(await sessionRowsOf(user.id)).toEqual([]);
    });

    it('reports the logout under the same name as a single-session one', async () => {
        // One funnel counts logouts, whichever route ended the session; `scope` is what tells the
        // two apart. A second event name would make every rate built on the first silently wrong.
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUserWithSessionsAndAReset();

        await accountService.logoutEverywhere(String(user._id), testCallerContext);

        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: accountAnalyticsEvents.USER_LOGGED_OUT,
                properties: { scope: 'everywhere' }
            })
        );
    });

    it('leaves a pending password-reset link alone', async () => {
        // "Log out everywhere" must not also burn a link the user is midway through using; only
        // a changed password purges those.
        const user = await createUserWithSessionsAndAReset();

        await accountService.logoutEverywhere(String(user._id), testCallerContext);

        expect(await tokenHashesOf(user.id)).toEqual([hashToken('reset-a')]);
    });

    it('moves the session epoch, so access tokens already handed out stop working', async () => {
        const user = await createUserWithSessionsAndAReset();

        await accountService.logoutEverywhere(String(user._id), testCallerContext);

        const stored = await userRepository.findByIdWithCredentials(String(user._id));
        expect(stored?.tokensValidAfter).toBeInstanceOf(Date);
    });

    it('answers 401, not 404, for a user that does not exist', async () => {
        // `openapi.yaml` declares no 404 for `logoutAll` — a gone user is unauthenticated.
        const response = asReject(
            await accountService.logoutEverywhere('64b7f2a1c2d3e4f5a6b7c8d9', testCallerContext)
        );

        expect(response.status).toBe(401);
    });

    it('cannot be undone by a write holding an older copy of the account', async () => {
        // The same invariant from the dangerous direction, stated as a sequence rather than a
        // race — no timing is involved:
        //
        //   1. a request loads the user
        //   2. "log out everywhere" removes the sessions
        //   3. that first request finishes its own work and saves the account
        //
        // Sessions live in their own collection now, so saving the user cannot bring them back;
        // this case is what notices if they ever move back onto the document.
        const user = await createUserWithSessionsAndAReset();
        const staleCopy = (await userRepository.findByIdWithCredentials(String(user._id)))!;

        await accountService.logoutEverywhere(String(user._id), testCallerContext);
        staleCopy.username = 'saved-late';
        await userRepository.save(staleCopy);

        expect(await sessionRowsOf(user.id)).toEqual([]);
    });

    it('answers 422 for an id that is not an identifier at all', async () => {
        // A malformed id reaches mongoose as a CastError. It must come back as a client error,
        // not as the 500 an uncaught cast produces — the same failure `databaseErrorInterpreter`
        // was fixed for elsewhere.
        const response = asReject(
            await accountService.logoutEverywhere('not-an-id', testCallerContext)
        );

        expect(response.status).toBe(422);
    });
});
