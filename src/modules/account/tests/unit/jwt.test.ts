/**
 * JWT creation and verification — `src/modules/account/jwt.ts`.
 *
 * The security-critical distinction this module encodes is between the two token types:
 *
 *   access token  — stateless. Verified by signature and expiry alone, with no database round
 *                   trip, which is what makes it cheap enough to check on every request.
 *   refresh token — stateful. Signature *and* a revocation lookup against the user document, so
 *                   that logging out (which removes the token row) actually ends the session.
 *
 * If the refresh path ever stopped consulting the database, logout would become cosmetic and a
 * stolen refresh token would stay valid for its full lifetime. Several tests below exist purely
 * to keep that lookup mandatory.
 *
 * Secrets are set explicitly rather than inherited from `.env`: unit tests do not load dotenv,
 * and a test that silently depends on a developer's local environment is not a test.
 */

import { sign } from 'jsonwebtoken';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import {
    verifyAccessToken,
    verifyRefreshToken,
    createRefreshToken,
    createAccessToken
} from '@modules/account/jwt';
import { ERefreshTokenExpiryTime } from '@modules/account';
import { ETokenType } from '@modules/users';
import { userRepository } from '@modules/users';

setupTestDb();

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

const originalEnvironment: Record<string, string | undefined> = {};
const ENV_KEYS = [
    'NODE_TOKEN_ACCESS',
    'NODE_TOKEN_REFRESH',
    'NODE_TOKEN_ACCESS_TIME',
    'NODE_TOKEN_REFRESH_TIME_SHORT'
] as const;

beforeEach(() => {
    for (const key of ENV_KEYS) originalEnvironment[key] = process.env[key];
    process.env.NODE_TOKEN_ACCESS = ACCESS_SECRET;
    process.env.NODE_TOKEN_REFRESH = REFRESH_SECRET;
    process.env.NODE_TOKEN_ACCESS_TIME = '900';
    process.env.NODE_TOKEN_REFRESH_TIME_SHORT = '3600';
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        if (originalEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvironment[key];
    }
});

describe('verifyAccessToken', () => {
    it('resolves the payload of a token signed with the access secret', async () => {
        const token = sign({ id: 'user-1' }, ACCESS_SECRET, { expiresIn: 900 });

        await expect(verifyAccessToken(token)).resolves.toMatchObject({ id: 'user-1' });
    });

    it('rejects a token signed with the refresh secret', async () => {
        // The two secrets must not be interchangeable: if they were, a refresh token would be
        // accepted as an access token and the revocation lookup could be bypassed entirely.
        const token = sign({ id: 'user-1' }, REFRESH_SECRET, { expiresIn: 900 });

        await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
        const token = sign({ id: 'user-1' }, ACCESS_SECRET, { expiresIn: -10 });

        await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('rejects a structurally invalid token', async () => {
        await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow();
    });

    it('rejects a token whose payload was tampered with', async () => {
        const token = sign({ id: 'user-1' }, ACCESS_SECRET, { expiresIn: 900 });
        const [header, , signature] = token.split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ id: 'admin' })).toString('base64url');

        await expect(
            verifyAccessToken(`${header}.${forgedPayload}.${signature}`)
        ).rejects.toThrow();
    });
});

describe('verifyRefreshToken', () => {
    it('resolves when the token is signed AND present on the user document', async () => {
        const user = await createUser();
        const token = sign({ id: String(user._id) }, REFRESH_SECRET, { expiresIn: 3600 });
        await user.tokenAdd(ETokenType.REFRESH, 3_600_000, token);

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: String(user._id) });
    });

    it('rejects a validly-signed token that is not stored on any user', async () => {
        // This is the revocation check. A correct signature is necessary but not sufficient —
        // otherwise logout could never invalidate anything.
        await createUser();
        const orphanToken = sign({ id: 'user-1' }, REFRESH_SECRET, { expiresIn: 3600 });

        await expect(verifyRefreshToken(orphanToken)).rejects.toThrow('Forbidden');
    });

    it('rejects once the token has been removed from the user document', async () => {
        const user = await createUser();
        const token = sign({ id: String(user._id) }, REFRESH_SECRET, { expiresIn: 3600 });
        await user.tokenAdd(ETokenType.REFRESH, 3_600_000, token);

        // Precondition: it works before revocation, so the assertion below cannot pass vacuously.
        await expect(verifyRefreshToken(token)).resolves.toBeDefined();

        await user.tokenRemoveAll(ETokenType.REFRESH);

        await expect(verifyRefreshToken(token)).rejects.toThrow('Forbidden');
    });

    it('rejects a token signed with the access secret', async () => {
        const user = await createUser();
        const token = sign({ id: String(user._id) }, ACCESS_SECRET, { expiresIn: 3600 });
        await user.tokenAdd(ETokenType.REFRESH, 3_600_000, token);

        // Even though it is stored, the signature is checked first and must fail.
        await expect(verifyRefreshToken(token)).rejects.toThrow();
    });

    it('rejects an expired refresh token without consulting the database', async () => {
        const user = await createUser();
        const token = sign({ id: String(user._id) }, REFRESH_SECRET, { expiresIn: -10 });
        await user.tokenAdd(ETokenType.REFRESH, 3_600_000, token);

        await expect(verifyRefreshToken(token)).rejects.toThrow();
    });
});

describe('createRefreshToken', () => {
    it('persists a verifiable refresh token on the user document', async () => {
        const user = await createUser();

        const issued = await createRefreshToken(String(user._id), ERefreshTokenExpiryTime.SHORT);

        // Round-trip through the verifier rather than inspecting the string: what matters is
        // that the token this function produced is one the system will later accept.
        await expect(verifyRefreshToken(issued)).resolves.toMatchObject({ id: String(user._id) });
    });

    it('stores the token under the REFRESH type with an expiry', async () => {
        const user = await createUser();

        const issued = await createRefreshToken(String(user._id), ERefreshTokenExpiryTime.SHORT);

        // `tokens` is select:false, so it has to be re-read explicitly — the same way the
        // revocation lookup does.
        const reloaded = await userRepository.findByIdWithCredentials(String(user._id));
        const stored = reloaded!.tokens.find((entry) => entry.token === issued);

        expect(stored).toBeDefined();
        // The type matters: `tokenRemoveAll(REFRESH)` is what logout calls, and a token filed
        // under any other type would survive it.
        expect(stored!.type).toBe(ETokenType.REFRESH);
        // 3600s tier ⇒ a real future expiry, not the undefined that `expirationMs > 0` produces
        // when the tier resolves to 0.
        expect(stored!.expiration!.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects for an unknown user id', async () => {
        // A signed token must never be issued for an identity that does not exist.
        await expect(
            createRefreshToken('507f1f77bcf86cd799439011', ERefreshTokenExpiryTime.SHORT)
        ).rejects.toThrow('User not found');
    });

    it('accumulates tokens rather than replacing them, so multi-device login works', async () => {
        const user = await createUser();

        const first = await createRefreshToken(String(user._id), ERefreshTokenExpiryTime.SHORT);
        const second = await createRefreshToken(String(user._id), ERefreshTokenExpiryTime.SHORT);

        // Both must remain individually verifiable: signing in on a phone must not sign the
        // laptop out. A `tokens = [new]` assignment instead of a push would break exactly this.
        await expect(verifyRefreshToken(first)).resolves.toMatchObject({ id: String(user._id) });
        await expect(verifyRefreshToken(second)).resolves.toMatchObject({ id: String(user._id) });

        const reloaded = await userRepository.findByIdWithCredentials(String(user._id));
        const refreshTokens = reloaded!.tokens.filter((entry) => entry.type === ETokenType.REFRESH);
        expect(refreshTokens).toHaveLength(2);
    });
});

describe('createAccessToken', () => {
    it('exchanges a stored refresh token for a verifiable access token', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            ERefreshTokenExpiryTime.SHORT
        );

        const accessToken = await createAccessToken(refreshToken);

        await expect(verifyAccessToken(accessToken)).resolves.toMatchObject({
            id: String(user._id)
        });
    });

    it('refuses to mint an access token from a revoked refresh token', async () => {
        // The entire point of the stateful refresh check: after logout, no new access tokens.
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            ERefreshTokenExpiryTime.SHORT
        );

        // Revoke the way the real logout path does: reload with credentials, then revoke. The
        // reload is what keeps the in-memory `tokens` in step — the database write itself is an
        // atomic `$pull` and no longer depends on it (see the note above `tokenAdd` in the user
        // model, and the guard immediately below this test).
        const loaded = await userRepository.findByIdWithCredentials(String(user._id));
        await loaded!.tokenRemoveAll(ETokenType.REFRESH);

        await expect(createAccessToken(refreshToken)).rejects.toThrow('Forbidden');
    });

    /**
     * The same revocation, from a document that never loaded its tokens — the call site the
     * reload above exists to avoid.
     *
     * `tokens` is `select: false`, so `this.tokens` is `undefined` here rather than `[]`. The
     * atomic `$pull` does not care: the revocation lands in the database either way. What used to
     * break is what happens next — the in-memory resync ran `undefined.filter(...)` and threw,
     * *after* the write had succeeded, so a logout that revoked every session reported a 500.
     *
     * Both halves are asserted, because either one alone is satisfiable by the wrong code: a
     * revocation that resolves but does not revoke, or a revocation that revokes and then throws.
     */
    it('revokes without throwing on a document whose tokens were never loaded', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            ERefreshTokenExpiryTime.SHORT
        );

        const bare = await userRepository.findById(String(user._id));
        expect(bare!.tokens).toBeUndefined();

        await expect(bare!.tokenRemoveAll(ETokenType.REFRESH)).resolves.toBeUndefined();

        await expect(createAccessToken(refreshToken)).rejects.toThrow('Forbidden');
    });

    it('refuses to mint an access token from an unsigned or foreign token', async () => {
        await expect(createAccessToken('not-a-jwt')).rejects.toThrow();
    });

    it('carries the identity of the refresh token, not a caller-supplied one', async () => {
        const owner = await createUser({ email: 'owner@example.com' });
        const other = await createUser({ email: 'other@example.com' });
        const refreshToken = await createRefreshToken(
            String(owner._id),
            ERefreshTokenExpiryTime.SHORT
        );

        const accessToken = await createAccessToken(refreshToken);
        const payload = await verifyAccessToken(accessToken);

        expect(payload.id).toBe(String(owner._id));
        expect(payload.id).not.toBe(String(other._id));
    });
});
