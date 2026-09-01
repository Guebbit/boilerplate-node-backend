/**
 * @module
 * `tokenAdd` and `tokenRemoveAll` — where a session is created or destroyed. Both write to
 * `select: false` fields, so they write to the DATABASE first and update the in-memory copy
 * only if one was loaded; getting that order wrong makes a logout throw after the tokens were
 * already revoked. The model is a double — none of this needs a database.
 */
import { userSchema, type Token } from '@modules/users/model';
import { TokenType, hashToken } from '@modules/users';
import { asStub } from '@tests/stub';

const USER_ID = '507f1f77bcf86cd799439011';

/** The instance methods, reached off the schema and bound to a document double. */
const methods = asStub<{
    tokenAdd: (
        this: unknown,
        type: Token['type'],
        expirationMs: number,
        token: string
    ) => Promise<string>;
    tokenRemoveAll: (this: unknown, type: Token['type']) => Promise<void>;
}>(userSchema.methods);

/**
 * A document double. `tokens` is passed explicitly so each case states whether the array was
 * LOADED, the distinction these methods are built around — `undefined` is the ordinary case
 * since `select: false` means nothing loads it unless a query asked.
 */
const documentDouble = (tokens?: Token[]) => {
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    return {
        _id: USER_ID,
        tokens,
        constructor: { updateOne },
        updateOne
    };
};

beforeEach(() => jest.clearAllMocks());

describe('tokenAdd', () => {
    it('pushes the HASH of the token onto the user, in the database', async () => {
        // `tokens[].token` is `hashToken(token)` at rest, never
        // the plaintext handed to `tokenAdd`.
        const document = documentDouble([]);

        await methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token');

        const [filter, update] = document.updateOne.mock.calls[0];
        expect(filter).toEqual({ _id: USER_ID });
        expect(update.$push.tokens).toMatchObject({
            type: TokenType.REFRESH,
            token: hashToken('the-token')
        });
    });

    it('returns the token it stored, so the caller can hand it to the client', async () => {
        const document = documentDouble([]);

        await expect(
            methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token')
        ).resolves.toBe('the-token');
    });

    it('sets the expiry from the window it was given', async () => {
        const before = Date.now();
        const document = documentDouble([]);

        await methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token');

        const { expiration } = document.updateOne.mock.calls[0][1].$push.tokens as Token;
        expect(expiration).toBeInstanceOf(Date);
        // An hour from now, allowing for the milliseconds the call itself took.
        expect(expiration!.getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
        expect(expiration!.getTime()).toBeLessThanOrEqual(Date.now() + 3_600_000);
    });

    it('stores no expiry at all when the window is zero', async () => {
        // A session with no expiry of its own, revoked only by an explicit logout. `new
        // Date(Date.now() + 0)` would instead store a token that expired the moment it was
        // issued — every such login would be immediately unusable.
        const document = documentDouble([]);

        await methods.tokenAdd.call(document, TokenType.REFRESH, 0, 'the-token');

        expect(
            (document.updateOne.mock.calls[0][1].$push.tokens as Token).expiration
        ).toBeUndefined();
    });

    it('stores no expiry for a negative window either', async () => {
        const document = documentDouble([]);

        await methods.tokenAdd.call(document, TokenType.PASSWORD_RESET, -1000, 'the-token');

        expect(
            (document.updateOne.mock.calls[0][1].$push.tokens as Token).expiration
        ).toBeUndefined();
    });

    it('does not touch updatedAt, because a new session is not a change to the user', async () => {
        const document = documentDouble([]);

        await methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token');

        expect(document.updateOne.mock.calls[0][2]).toEqual({ timestamps: false });
    });

    it('mirrors the HASH into a token list that was loaded', async () => {
        const tokens: Token[] = [];
        const document = documentDouble(tokens);

        await methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token');

        expect(tokens).toHaveLength(1);
        expect(tokens[0].token).toBe(hashToken('the-token'));
    });

    it('succeeds when the token list was never loaded', async () => {
        // The ordinary case: `select: false` means `this.tokens` is `undefined`, and the optional
        // chain is what stops a push from throwing AFTER the write already landed.
        const document = documentDouble(undefined);

        await expect(
            methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token')
        ).resolves.toBe('the-token');
        expect(document.updateOne).toHaveBeenCalledTimes(1);
    });

    it('files the token under the type it was given', async () => {
        // Revocation is `$pull` by type, so the wrong type means the wrong flow revokes it — a
        // reset token that logout clears, or a refresh token a password reset leaves alive.
        const document = documentDouble([]);

        await methods.tokenAdd.call(document, TokenType.PASSWORD_RESET, 900_000, 'reset-token');

        expect((document.updateOne.mock.calls[0][1].$push.tokens as Token).type).toBe(
            TokenType.PASSWORD_RESET
        );
    });
});

describe('tokenRemoveAll', () => {
    it('pulls every token of that type, in the database', async () => {
        const document = documentDouble([]);

        await methods.tokenRemoveAll.call(document, TokenType.REFRESH);

        const [filter, update] = document.updateOne.mock.calls[0];
        expect(filter).toEqual({ _id: USER_ID });
        expect(update).toEqual({ $pull: { tokens: { type: TokenType.REFRESH } } });
    });

    it('leaves other token types alone', async () => {
        // "Log out everywhere" must not spend a pending password-reset link, and revoking reset
        // tokens must not sign the user out of every device.
        const tokens: Token[] = [
            { type: TokenType.REFRESH, token: 'session-a' },
            { type: TokenType.PASSWORD_RESET, token: 'reset-a' },
            { type: TokenType.REFRESH, token: 'session-b' }
        ];
        const document = documentDouble(tokens);

        await methods.tokenRemoveAll.call(document, TokenType.REFRESH);

        expect(document.tokens).toEqual([{ type: TokenType.PASSWORD_RESET, token: 'reset-a' }]);
    });

    it('does not touch updatedAt', async () => {
        const document = documentDouble([]);

        await methods.tokenRemoveAll.call(document, TokenType.REFRESH);

        expect(document.updateOne.mock.calls[0][2]).toEqual({ timestamps: false });
    });

    it('succeeds when the token list was never loaded', async () => {
        // The database write has already revoked them. Reporting a failure here would be a lie
        // about a logout that succeeded.
        const document = documentDouble(undefined);

        await expect(
            methods.tokenRemoveAll.call(document, TokenType.REFRESH)
        ).resolves.toBeUndefined();
        expect(document.updateOne).toHaveBeenCalledTimes(1);
    });
});

/*
 * `tokenRemoveExpired` moved to `userRepository.tokenRemoveExpired` — it resolved an HTTP status,
 * which belongs below the repository, not on the schema. Its tests moved too, into
 * `repository.test.ts` (the sweep itself) and `account/tests/unit/token-cleanup-job.test.ts` (what
 * a failed sweep means to a caller). The two methods above stay: both are `$push`/`$pull` against
 * `this`, keeping the loaded array in step with the write.
 */
