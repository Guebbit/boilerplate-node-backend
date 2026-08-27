/**
 * `tokenAdd`, `tokenRemoveAll` and `tokenRemoveExpired` — the three places a session is created
 * or destroyed.
 *
 * All three are written against `select: false` fields, which is what makes them worth unit
 * testing rather than trusting: the schema's TYPES claim `this.tokens` is always an array, and
 * `select: false` makes that a lie. Both instance methods therefore write to the DATABASE first
 * and update the in-memory copy only if one was loaded — and both carry an eslint disable saying
 * so. Get that order wrong and a logout throws AFTER the tokens were already revoked, so the
 * caller reports a failed logout for a session that no longer exists.
 *
 * Two more properties, each invisible from a passing flow:
 *
 *   - `{ timestamps: false }` on both writes. Adding or revoking a session is not a change to the
 *     USER, and without this every login and logout bumps `updatedAt` — which is what "recently
 *     changed accounts" screens and any change-driven sync would then be reporting.
 *   - `tokenRemoveExpired` never throws. It is the scheduled cleanup job's only call; a rejection
 *     there takes down the job rather than being reported, and the trail of what happened is the
 *     `{ status, success }` pair it resolves with instead.
 *
 * The model is a double, so none of this needs a database and each property is a property of this
 * file alone.
 */
import { userSchema, type Token } from '@modules/users/model';
import { TokenType } from '@modules/users';
import { asStub } from '@tests/stub';

jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { logger } from '@infrastructure/adapters/logger';

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

/** The statics, same idea. */
const statics = asStub<{
    tokenRemoveExpired: (this: unknown) => Promise<{ status: number; success: boolean }>;
}>(userSchema.statics);

/**
 * A document double.
 *
 * `tokens` is passed explicitly so each case states whether the array was LOADED — the whole
 * distinction these methods are written around. `undefined` is the ordinary case, because
 * `select: false` means nothing loads it unless a query asked.
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

/** A model double carrying only `updateMany`, which is all the static touches. */
const modelDouble = (updateMany: jest.Mock) => ({ updateMany });

describe('tokenAdd', () => {
    it('pushes the token onto the user, in the database', async () => {
        const document = documentDouble([]);

        await methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token');

        const [filter, update] = document.updateOne.mock.calls[0];
        expect(filter).toEqual({ _id: USER_ID });
        expect(update.$push.tokens).toMatchObject({
            type: TokenType.REFRESH,
            token: 'the-token'
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

    it('mirrors the token into a token list that was loaded', async () => {
        const tokens: Token[] = [];
        const document = documentDouble(tokens);

        await methods.tokenAdd.call(document, TokenType.REFRESH, 3_600_000, 'the-token');

        expect(tokens).toHaveLength(1);
        expect(tokens[0].token).toBe('the-token');
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

describe('tokenRemoveExpired', () => {
    it('pulls expired tokens from every user that has one', async () => {
        const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 });

        await statics.tokenRemoveExpired.call(modelDouble(updateMany));

        const [filter, update] = updateMany.mock.calls[0] as [
            Record<string, { $lt: Date }>,
            { $pull: { tokens: { expiration: { $lt: Date } } } }
        ];
        // The filter narrows which DOCUMENTS are touched; the `$pull` narrows which ENTRIES go.
        // Both are needed: the filter alone would rewrite every user, and the pull alone would
        // scan the whole collection.
        expect(filter['tokens.expiration'].$lt).toBeInstanceOf(Date);
        expect(update.$pull.tokens.expiration.$lt).toBeInstanceOf(Date);
    });

    it('compares both halves against the same instant', async () => {
        // One `now`, used twice. Two separate `new Date()` calls would leave a window in which a
        // token is selected by the filter and then not matched by the pull, so the document is
        // rewritten to no effect on every sweep.
        const updateMany = jest.fn().mockResolvedValue({});

        await statics.tokenRemoveExpired.call(modelDouble(updateMany));

        const [filter, update] = updateMany.mock.calls[0];
        expect((filter['tokens.expiration'].$lt as Date).getTime()).toBe(
            (update.$pull.tokens.expiration.$lt as Date).getTime()
        );
    });

    it('removes only tokens already past their expiry', async () => {
        // `$lt`, not `$lte` or `$gt`. `$gt` would delete every LIVE token in the system on the
        // next scheduled run — the single worst mutation this file admits.
        const updateMany = jest.fn().mockResolvedValue({});
        const before = Date.now();

        await statics.tokenRemoveExpired.call(modelDouble(updateMany));

        const cutoff = updateMany.mock.calls[0][0]['tokens.expiration'].$lt as Date;
        expect(cutoff.getTime()).toBeGreaterThanOrEqual(before);
        expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('reports success as a status pair rather than a bare resolve', async () => {
        const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 });

        await expect(statics.tokenRemoveExpired.call(modelDouble(updateMany))).resolves.toEqual({
            status: 200,
            success: true
        });
    });

    it('reports a failure instead of rejecting, so the job survives it', async () => {
        // This is the scheduled cleanup's only call. A rejection here takes the job down; the
        // pair is how the failure gets reported and retried on the next tick instead.
        const updateMany = jest.fn().mockRejectedValue(new Error('connection lost'));

        await expect(statics.tokenRemoveExpired.call(modelDouble(updateMany))).resolves.toEqual({
            status: 500,
            success: false
        });
    });

    it('logs the failure, so a silent no-op is not the only trace', async () => {
        const updateMany = jest.fn().mockRejectedValue(new Error('connection lost'));

        await statics.tokenRemoveExpired.call(modelDouble(updateMany));

        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'tokenRemoveExpired failed' })
        );
    });
});
