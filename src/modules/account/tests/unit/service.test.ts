/**
 * `src/modules/account/service.ts` — the security invariants of signup, login, password change
 * and bulk token removal.
 *
 * This is the most agnostic file in the repository that had no test of its own. Nothing in it is
 * about selling products: every application built from this boilerplate registers users, logs
 * them in, and lets them change a password. Its 53% mutation score was incidental coverage from
 * the controller suites, which exercise the happy paths and none of the decisions below.
 *
 * The cases are grouped by the invariant they defend rather than by function, because three of
 * them are security properties that read as ordinary branches:
 *
 *   - the two login failures must be INDISTINGUISHABLE, or the endpoint enumerates accounts;
 *   - a soft-deleted account must not be able to log in, which is one filter key;
 *   - a password must never be stored as it arrived.
 *
 * Each of those survives a mutation that a happy-path test cannot see, and each is a real
 * incident if it regresses.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { authService } from '@modules/account/service';
import { userRepository } from '@modules/users';
import { TokenType, type Token, type UserDocument } from '@modules/users';
import type { ResponseReject, ResponseSuccess } from '@infrastructure/http/response';

setupTestDb();

const VALID_PASSWORD = 'correct-horse-battery';

/** Narrow to the reject arm, failing the test (rather than the type check) when it succeeded. */
const asReject = (response: ResponseSuccess<UserDocument> | ResponseReject): ResponseReject => {
    expect(response.success).toBe(false);
    return response as ResponseReject;
};

/** Narrow to the success arm, and to a present `data` — the reject arm declares it `undefined`. */
const asSuccess = (
    response: ResponseSuccess<UserDocument> | ResponseReject
): ResponseSuccess<UserDocument> & { data: UserDocument } => {
    expect(response.success).toBe(true);
    return response as ResponseSuccess<UserDocument> & { data: UserDocument };
};

describe('signup', () => {
    it('creates the account and returns it', async () => {
        const response = asSuccess(
            await authService.signup('new@example.com', 'newuser', VALID_PASSWORD, VALID_PASSWORD)
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
        await authService.signup(
            'hashed@example.com',
            'hasheduser',
            VALID_PASSWORD,
            VALID_PASSWORD
        );

        const stored = await userRepository.findOneWithCredentials({ email: 'hashed@example.com' });

        expect(stored?.password).toBeDefined();
        expect(stored?.password).not.toBe(VALID_PASSWORD);
        // bcrypt's modular-crypt prefix, so this asserts "hashed with bcrypt", not merely "differs".
        expect(stored?.password).toMatch(/^\$2[aby]\$/);
    });

    it('rejects a mismatched confirmation with 422 and says so', async () => {
        const response = asReject(
            await authService.signup(
                'mismatch@example.com',
                'mismatchuser',
                VALID_PASSWORD,
                'something-else'
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
            await authService.signup(
                'taken@example.com',
                'someoneelse',
                VALID_PASSWORD,
                VALID_PASSWORD
            )
        );

        expect(response.status).toBe(409);
    });

    it.each([
        ['not-an-email', 'gooduser', VALID_PASSWORD],
        ['bad-username@example.com', 'ab', VALID_PASSWORD],
        ['short-password@example.com', 'gooduser', 'abc']
    ])('rejects invalid input (%s / %s) with 422', async (email, username, password) => {
        const response = asReject(await authService.signup(email, username, password, password));

        expect(response.status).toBe(422);
        expect(response.errors.length).toBeGreaterThan(0);
    });

    it('stores an absent image as an empty string, not as the schema default', async () => {
        // `imageUrl` carries a mongoose `default` (a placeholder avatar url). Coalescing to `''`
        // is what keeps that default from firing, so an account created without a picture has an
        // empty field the UI can branch on rather than a stock image it cannot tell apart from a
        // deliberate one.
        await authService.signup(
            'noimage@example.com',
            'noimageuser',
            VALID_PASSWORD,
            VALID_PASSWORD
        );

        const stored = await userRepository.findOne({ email: 'noimage@example.com' });

        expect(stored?.imageUrl).toBe('');
    });
});

describe('login', () => {
    const createLoginUser = (overrides: Partial<UserDocument> = {}) =>
        createUser({
            email: 'login@example.com',
            username: 'loginuser',
            password: VALID_PASSWORD,
            ...overrides
        } as Parameters<typeof createUser>[0]);

    it('returns the user for correct credentials', async () => {
        await createLoginUser();

        const response = asSuccess(await authService.login('login@example.com', VALID_PASSWORD));

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
            await authService.login('nobody@example.com', VALID_PASSWORD)
        );
        const wrongPassword = asReject(
            await authService.login('login@example.com', 'not-the-password')
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
        await createLoginUser({ deletedAt: new Date() } as Partial<UserDocument>);

        const response = asReject(await authService.login('login@example.com', VALID_PASSWORD));

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

        const existingAccount = asReject(await authService.login('login@example.com', 'x'));
        const unknownAccount = asReject(await authService.login('nobody@example.com', 'x'));

        expect(existingAccount.status).toBe(422);
        expect(unknownAccount.status).toBe(422);
        expect(existingAccount.errors).toEqual(unknownAccount.errors);
    });

    it.each([
        ['a missing email', undefined, VALID_PASSWORD],
        ['a missing password', 'login@example.com', undefined],
        ['a malformed email', 'not-an-email', VALID_PASSWORD]
    ])('rejects %s with 422, before touching the database', async (_label, email, password) => {
        // 422 rather than 401: the request could not be understood, which is a different fact
        // from "these credentials are wrong" and must not be flattened into it.
        const response = asReject(await authService.login(email, password));

        expect(response.status).toBe(422);
    });
});

describe('validatePasswordChange', () => {
    it('returns no messages for an acceptable pair', () => {
        expect(authService.validatePasswordChange(VALID_PASSWORD, VALID_PASSWORD)).toEqual([]);
    });

    it('reports a mismatch', () => {
        const messages = authService.validatePasswordChange(VALID_PASSWORD, 'different');

        expect(messages.length).toBeGreaterThan(0);
    });

    it('reports a password that is too short', () => {
        expect(authService.validatePasswordChange('abc', 'abc').length).toBeGreaterThan(0);
    });

    it('reports empty input rather than accepting it', () => {
        // Called with no arguments by a caller that forgot to pass the body through. Defaulting
        // to `''` must produce errors, not an empty array meaning "fine".
        expect(authService.validatePasswordChange().length).toBeGreaterThan(0);
    });
});

describe('passwordChange', () => {
    it('writes the new password, hashed', async () => {
        const user = await createUser({
            email: 'change@example.com',
            password: 'old-password-123'
        });

        const response = asSuccess(
            await authService.passwordChange(user, VALID_PASSWORD, VALID_PASSWORD)
        );

        expect(response.status).toBe(200);

        const stored = await userRepository.findOneWithCredentials({ email: 'change@example.com' });
        expect(stored?.password).toMatch(/^\$2[aby]\$/);
        // And it is the NEW one: the login flow is the honest way to assert that.
        const loggedIn = await authService.login('change@example.com', VALID_PASSWORD);
        expect(loggedIn.success).toBe(true);
    });

    it('leaves the stored password untouched when the pair is rejected', async () => {
        // The ordering guarantee: validation happens before the assignment, so a rejected change
        // is not a change. If the write moved ahead of the check, this account's password would
        // be set to a value its owner never confirmed.
        const user = await createUser({
            email: 'unchanged@example.com',
            password: 'old-password-123'
        });

        const response = asReject(await authService.passwordChange(user, VALID_PASSWORD, 'nope'));

        expect(response.status).toBe(422);

        const stillWorks = await authService.login('unchanged@example.com', 'old-password-123');
        expect(stillWorks.success).toBe(true);
    });
});

describe('tokenAdd', () => {
    it('appends a token of the requested type and returns it', async () => {
        const user = await createUser({ email: 'tokenadd@example.com' });

        const token = await authService.tokenAdd(user, TokenType.PASSWORD_RESET);

        const stored = await userRepository.findOneWithCredentials({
            email: 'tokenadd@example.com'
        });
        expect(stored?.tokens).toHaveLength(1);
        expect(stored?.tokens[0]?.token).toBe(token);
        expect(stored?.tokens[0]?.type).toBe(TokenType.PASSWORD_RESET);
    });

    it('returns 32 hex characters, so the token is 16 bytes of real entropy', () => {
        // The length is the security parameter. `randomBytes(16).toString('hex')` is 32 chars;
        // anything shorter is a guessable reset link, and the value is only ever compared for
        // equality, so nothing else in the system would complain.
        return createUser({ email: 'entropy@example.com' })
            .then((user) => authService.tokenAdd(user, TokenType.PASSWORD_RESET))
            .then((token) => {
                expect(token).toMatch(/^[\da-f]{32}$/);
            });
    });

    it('keeps both tokens when two are added concurrently', async () => {
        // The invariant: the token array is APPENDED TO, never rebuilt.
        //
        // Mongoose tracks the change rather than the result, so `push` becomes a `$push` and two
        // writers cannot lose each other's entry. Rebuilding the array instead — `user.tokens =
        // [...user.tokens, entry]`, which reads as an innocent modernisation — becomes a `$set`
        // of the whole array, and then the second writer erases the first. This case fails under
        // exactly that change, which is what makes it worth keeping.
        //
        // Concretely: two "forgot password" clicks, and one of the two emailed links silently
        // does not work.
        const user = await createUser({ email: 'concurrent@example.com' });
        const other = (await userRepository.findByIdWithCredentials(String(user._id)))!;

        const [first, second] = await Promise.all([
            authService.tokenAdd(user, TokenType.PASSWORD_RESET),
            authService.tokenAdd(other, TokenType.PASSWORD_RESET)
        ]);

        const stored = await userRepository.findByIdWithCredentials(String(user._id));
        expect(stored?.tokens.map(({ token }) => token).toSorted()).toEqual(
            [first, second].toSorted()
        );
    });

    it('issues a different token every time', async () => {
        const user = await createUser({ email: 'distinct@example.com' });

        const first = await authService.tokenAdd(user, TokenType.PASSWORD_RESET);
        const second = await authService.tokenAdd(user, TokenType.PASSWORD_RESET);

        expect(first).not.toBe(second);
    });

    it('sets an expiry only when one was asked for', async () => {
        const user = await createUser({ email: 'expiry@example.com' });
        const before = Date.now();

        await authService.tokenAdd(user, TokenType.PASSWORD_RESET, 60_000);
        await authService.tokenAdd(user, TokenType.REFRESH);

        const stored = await userRepository.findOneWithCredentials({ email: 'expiry@example.com' });
        const [withExpiry, withoutExpiry] = stored!.tokens;

        expect(withExpiry?.expiration).toBeInstanceOf(Date);
        // Offset from *now*, not an absolute constant: an expiry computed from the wrong origin
        // is either already expired or effectively permanent.
        expect(withExpiry!.expiration!.getTime()).toBeGreaterThanOrEqual(before + 60_000);
        expect(withExpiry!.expiration!.getTime()).toBeLessThan(before + 60_000 + 10_000);

        expect(withoutExpiry?.expiration).toBeUndefined();
    });
});

/** A user holding two refresh tokens and one reset token, so "only this type" is observable. */
const createUserWithBothTokenTypes = () =>
    createUser({
        email: 'removeall@example.com',
        tokens: [
            { type: TokenType.REFRESH, token: 'refresh-a' },
            { type: TokenType.REFRESH, token: 'refresh-b' },
            { type: TokenType.PASSWORD_RESET, token: 'reset-a' }
        ] as Token[]
    });

describe('tokenRemoveAll', () => {
    it('removes every token of the given type', async () => {
        const user = await createUserWithBothTokenTypes();

        asSuccess(await authService.tokenRemoveAll(String(user._id), TokenType.REFRESH));

        const stored = await userRepository.findByIdWithCredentials(String(user._id));
        expect(stored?.tokens.map(({ token }) => token)).toEqual(['reset-a']);
    });

    it('leaves the other types alone', async () => {
        // "Log out everywhere" must not also burn a password-reset link the user is midway
        // through using. The filter keeps everything whose type differs, and a mutation that
        // inverts or drops the comparison empties the array instead — which no assertion on the
        // removed type alone would catch.
        const user = await createUserWithBothTokenTypes();

        await authService.tokenRemoveAll(String(user._id), TokenType.PASSWORD_RESET);

        const stored = await userRepository.findByIdWithCredentials(String(user._id));
        expect(stored?.tokens.map(({ token }) => token)).toEqual(['refresh-a', 'refresh-b']);
    });

    it('answers 404 for a user that does not exist', async () => {
        const response = asReject(
            await authService.tokenRemoveAll('64b7f2a1c2d3e4f5a6b7c8d9', TokenType.REFRESH)
        );

        expect(response.status).toBe(404);
    });

    it('cannot be undone by a write holding an older copy of the token array', async () => {
        // The same invariant from the dangerous direction, stated as a sequence rather than a
        // race — no timing is involved, which is why it is a unit test:
        //
        //   1. a request loads the user (its copy of `tokens` holds both refresh tokens)
        //   2. "log out everywhere" removes them
        //   3. that first request finishes its own work and saves
        //
        // If step 3 writes the whole array back, both refresh tokens RETURN and the logout is
        // silently undone — the sessions the user just revoked keep working. Appending cannot do
        // that; rebuilding can, and this case is what notices.
        const user = await createUserWithBothTokenTypes();
        const staleCopy = (await userRepository.findByIdWithCredentials(String(user._id)))!;

        await authService.tokenRemoveAll(String(user._id), TokenType.REFRESH);
        await authService.tokenAdd(staleCopy, 'delete', 3600);

        const stored = await userRepository.findByIdWithCredentials(String(user._id));
        expect(stored?.tokens.map(({ type }) => type).toSorted()).toEqual(['delete', 'password']);
    });

    it('answers 422 for an id that is not an identifier at all', async () => {
        // A malformed id reaches mongoose as a CastError. It must come back as a client error,
        // not as the 500 an uncaught cast produces — the same failure `databaseErrorInterpreter`
        // was fixed for elsewhere.
        const response = asReject(await authService.tokenRemoveAll('not-an-id', TokenType.REFRESH));

        expect(response.status).toBe(422);
    });
});
