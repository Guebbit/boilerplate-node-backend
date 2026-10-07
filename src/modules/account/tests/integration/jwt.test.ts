/**
 * @module
 * JWT creation and verification (`session/jwt.ts`). The security-critical distinction is
 * between token types: the access token is stateless (signature and expiry only), while the
 * refresh token is stateful, checked against the user document so logout — which removes the
 * token row — actually ends the session. Secrets are set explicitly here rather than inherited
 * from `.env`, since unit tests don't load dotenv.
 *
 * Every fixture signs with `keyid: keyId(secret)`, matching what `jwt.ts` itself stamps — the
 * ring's `kid` lookup is how a verifier finds the right member at all; see
 * `session/key-ring.ts`.
 */

import { sign, decode } from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import {
    verifyAccessToken,
    verifyRefreshToken,
    createRefreshToken,
    createAccessToken,
    rotateRefreshToken,
    rememberOfRefreshToken,
    TokenReuseError
} from '@modules/account/session/jwt';
import { reapExpiredTokens } from '@modules/account/services';
import { withEnvironmentOverrides, setEnvironment } from '@tests/environment';
import { advanceDate, freezeDate } from '@tests/clock';
import {
    RefreshTokenExpiryTime,
    getExpiryTime,
    getExpiryTimeMilliseconds
} from '@modules/account/session/config';
import { keyId } from '@modules/account/session/key-ring';
import { TokenType } from '@modules/users';
import { hashToken } from '@modules/users';
import { userRepository } from '@modules/users/tests/factories';

setupTestDb();

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

/**
 * Sign a fixture the way `jwt.ts` itself signs — `keyid` stamped from the secret.
 *
 * `auth_time`/`amr` default in, since `TokenData` requires both on every real token — `payload`
 * overrides either when a case is specifically about one of them.
 */
const signAs = (secret: string, payload: object, options: SignOptions = {}) =>
    sign({ auth_time: Math.floor(Date.now() / 1000), amr: ['pwd'], ...payload }, secret, {
        // The `typ` a real token of that ring carries (RFC 9068); `options.header` overrides it for
        // the cases that are about a wrong one.
        header: { alg: 'HS256', typ: secret === REFRESH_SECRET ? 'rt+jwt' : 'at+jwt' },
        ...options,
        keyid: keyId(secret)
    });

beforeEach(() => {
    setEnvironment({ NODE_TOKEN_ACCESS: ACCESS_SECRET });
    setEnvironment({ NODE_TOKEN_REFRESH: REFRESH_SECRET });
    setEnvironment({ NODE_TOKEN_ACCESS_TIME: '900' });
    setEnvironment({ NODE_TOKEN_REFRESH_TIME_SHORT: '3600' });
});

describe('verifyAccessToken', () => {
    it('resolves the payload of a token signed with the access secret', async () => {
        const token = signAs(ACCESS_SECRET, { id: 'user-1' }, { expiresIn: 900 });

        await expect(verifyAccessToken(token)).resolves.toMatchObject({ id: 'user-1' });
    });

    it('rejects a token signed with the refresh secret', async () => {
        // The two secrets must not be interchangeable: if they were, a refresh token would be
        // accepted as an access token and the revocation lookup could be bypassed entirely.
        const token = signAs(REFRESH_SECRET, { id: 'user-1' }, { expiresIn: 900 });

        // Its `kid` names no member of the access ring: a key this ring never held.
        await expect(verifyAccessToken(token)).rejects.toMatchObject({
            reason: 'invalid_signature'
        });
    });

    it('rejects an expired token', async () => {
        const token = signAs(ACCESS_SECRET, { id: 'user-1' }, { expiresIn: -10 });

        await expect(verifyAccessToken(token)).rejects.toMatchObject({ reason: 'expired' });
    });

    it('rejects a structurally invalid token', async () => {
        await expect(verifyAccessToken('not-a-jwt')).rejects.toMatchObject({
            reason: 'malformed'
        });
    });

    it('rejects a token whose payload was tampered with', async () => {
        const token = signAs(ACCESS_SECRET, { id: 'user-1' }, { expiresIn: 900 });
        const [header, , signature] = token.split('.', 3);
        const forgedPayload = Buffer.from(JSON.stringify({ id: 'admin' })).toString('base64url');

        await expect(
            verifyAccessToken(`${header}.${forgedPayload}.${signature}`)
        ).rejects.toMatchObject({ reason: 'invalid_signature' });
    });
});

describe('token types (`typ` header)', () => {
    it('refuses a refresh token presented as a bearer, even when both rings share a secret', async () => {
        await withEnvironmentOverrides(
            { NODE_TOKEN_ACCESS: 'shared-secret', NODE_TOKEN_REFRESH: 'shared-secret' },
            async () => {
                const user = await createUser();
                const refresh = await createRefreshToken(String(user._id));

                await expect(verifyAccessToken(refresh)).rejects.toMatchObject({
                    reason: 'malformed',
                    message: 'Wrong token type'
                });
            }
        );
    });

    it('refuses an access token presented as a refresh token', async () => {
        await withEnvironmentOverrides(
            { NODE_TOKEN_ACCESS: 'shared-secret', NODE_TOKEN_REFRESH: 'shared-secret' },
            async () => {
                const user = await createUser();
                const refresh = await createRefreshToken(String(user._id));
                const access = await createAccessToken(refresh);

                await expect(verifyRefreshToken(access)).rejects.toThrow('Wrong token type');
            }
        );
    });

    it('refuses a token carrying no `typ` at all', async () => {
        const unTyped = sign({ id: 'user-1', auth_time: 1, amr: ['pwd'] }, ACCESS_SECRET, {
            keyid: keyId(ACCESS_SECRET),
            expiresIn: 900
        });

        await expect(verifyAccessToken(unTyped)).rejects.toThrow('Wrong token type');
    });

    it('stamps the RFC 9068 `at+jwt` and a matching `rt+jwt` on what it signs', async () => {
        const user = await createUser();
        const refresh = await createRefreshToken(String(user._id));
        const access = await createAccessToken(refresh);

        expect(decode(refresh, { complete: true })?.header.typ).toBe('rt+jwt');
        expect(decode(access, { complete: true })?.header.typ).toBe('at+jwt');
    });
});

describe('verifyRefreshToken after a rotation', () => {
    it('refuses a rotated-away token without revoking the family, and still rotates inside the grace window', async () => {
        const user = await createUser();
        const id = String(user._id);
        const original = await createRefreshToken(id);
        const sibling = await createRefreshToken(id);

        const rotated = await rotateRefreshToken(original);

        // The rotated-away token is no longer a credential for anything but the rotation itself...
        await expect(verifyRefreshToken(original)).rejects.toThrow('Forbidden');
        // ...and refusing it here is NOT reuse detection: the family is untouched.
        await expect(verifyRefreshToken(sibling)).resolves.toMatchObject({ id });
        await expect(verifyRefreshToken(rotated.refreshToken)).resolves.toMatchObject({ id });
        // The two-tab grace (a rotation inside the window) is the rotation's own path, unchanged.
        await expect(rotateRefreshToken(original)).resolves.toMatchObject({
            accessToken: expect.any(String)
        });
    });
});

describe('verifyRefreshToken', () => {
    it('resolves when the token is signed AND present on the user document', async () => {
        const user = await createUser();
        const token = signAs(REFRESH_SECRET, { id: String(user._id) }, { expiresIn: 3600 });
        await user.tokenAdd(TokenType.REFRESH, 3_600_000, token);

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: String(user._id) });
    });

    it('rejects a validly-signed token that is not stored on any user', async () => {
        // This is the revocation check. A correct signature is necessary but not sufficient —
        // otherwise logout could never invalidate anything.
        await createUser();
        const orphanToken = signAs(REFRESH_SECRET, { id: 'user-1' }, { expiresIn: 3600 });

        await expect(verifyRefreshToken(orphanToken)).rejects.toThrow('Forbidden');
    });

    it('rejects once the token has been removed from the user document', async () => {
        const user = await createUser();
        const token = signAs(REFRESH_SECRET, { id: String(user._id) }, { expiresIn: 3600 });
        await user.tokenAdd(TokenType.REFRESH, 3_600_000, token);

        // Precondition: it works before revocation, so the assertion below cannot pass vacuously.
        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: String(user._id) });

        await user.tokenRemoveAll(TokenType.REFRESH);

        await expect(verifyRefreshToken(token)).rejects.toMatchObject({
            reason: 'revoked',
            message: 'Forbidden'
        });
    });

    it('rejects a token signed with the access secret', async () => {
        const user = await createUser();
        const token = signAs(ACCESS_SECRET, { id: String(user._id) }, { expiresIn: 3600 });
        await user.tokenAdd(TokenType.REFRESH, 3_600_000, token);

        // Even though it is stored, the signature is checked first and must fail.
        await expect(verifyRefreshToken(token)).rejects.toThrow();
    });

    it('rejects an expired refresh token without consulting the database', async () => {
        const user = await createUser();
        const token = signAs(REFRESH_SECRET, { id: String(user._id) }, { expiresIn: -10 });
        await user.tokenAdd(TokenType.REFRESH, 3_600_000, token);

        await expect(verifyRefreshToken(token)).rejects.toThrow();
    });
});

describe('createRefreshToken', () => {
    it('persists a verifiable refresh token on the user document', async () => {
        const user = await createUser();

        const issued = await createRefreshToken(String(user._id), RefreshTokenExpiryTime.SHORT);

        // Round-trip through the verifier rather than inspecting the string: what matters is
        // that the token this function produced is one the system will later accept.
        await expect(verifyRefreshToken(issued)).resolves.toMatchObject({ id: String(user._id) });
    });

    it('stores the token under the REFRESH type with an expiry', async () => {
        const user = await createUser();

        const issued = await createRefreshToken(String(user._id), RefreshTokenExpiryTime.SHORT);

        // `tokens` is select:false, so it has to be re-read explicitly — the same way the
        // revocation lookup does. Stored as a digest, never the plaintext `issued`.
        const reloaded = await userRepository.findByIdWithCredentials(String(user._id));
        const stored = reloaded!.tokens.find((entry) => entry.token === hashToken(issued));

        expect(stored).toBeDefined();
        // The type matters: `tokenRemoveAll(REFRESH)` is what logout calls, and a token filed
        // under any other type would survive it.
        expect(stored!.type).toBe(TokenType.REFRESH);
        // 3600s tier ⇒ a real future expiry, not the undefined that `expirationMs > 0` produces
        // when the tier resolves to 0.
        expect(stored!.expiration!.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects for an unknown user id', async () => {
        // A signed token must never be issued for an identity that does not exist.
        await expect(
            createRefreshToken('507f1f77bcf86cd799439011', RefreshTokenExpiryTime.SHORT)
        ).rejects.toThrow('User not found');
    });

    // A deactivated or soft-deleted account must never get a fresh session, no matter which
    // caller resolved it — `findForLogin` already blocks the password path; this is the mint
    // itself refusing, the backstop for a resolver that doesn't filter (an OAuth login through an
    // already-linked identity, chiefly).
    it.each([
        ['deactivated', { active: false }],
        ['soft-deleted', { deletedAt: new Date() }]
    ])('rejects for a %s account', async (_label, overrides) => {
        const user = await createUser(overrides);

        await expect(
            createRefreshToken(String(user._id), RefreshTokenExpiryTime.SHORT)
        ).rejects.toThrow('User not found');
    });

    it('accumulates tokens rather than replacing them, so multi-device login works', async () => {
        const user = await createUser();

        const first = await createRefreshToken(String(user._id), RefreshTokenExpiryTime.SHORT);
        const second = await createRefreshToken(String(user._id), RefreshTokenExpiryTime.SHORT);

        // Both must remain individually verifiable: signing in on a phone must not sign the
        // laptop out. A `tokens = [new]` assignment instead of a push would break exactly this.
        await expect(verifyRefreshToken(first)).resolves.toMatchObject({ id: String(user._id) });
        await expect(verifyRefreshToken(second)).resolves.toMatchObject({ id: String(user._id) });

        const reloaded = await userRepository.findByIdWithCredentials(String(user._id));
        const refreshTokens = reloaded!.tokens.filter(
            (entry) => entry.type === (TokenType.REFRESH as string)
        );
        expect(refreshTokens).toHaveLength(2);
    });
});

describe('createAccessToken', () => {
    it('exchanges a stored refresh token for a verifiable access token', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            RefreshTokenExpiryTime.SHORT
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
            RefreshTokenExpiryTime.SHORT
        );

        // Revoke the way the real logout path does: reload with credentials, then revoke. The
        // reload keeps this test's in-memory `tokens` in step with the database; the write itself
        // is an atomic `$pull` that needs no reload of its own (see the note above `tokenAdd` in
        // the user model, and the guard immediately below this test).
        const loaded = await userRepository.findByIdWithCredentials(String(user._id));
        await loaded!.tokenRemoveAll(TokenType.REFRESH);

        await expect(createAccessToken(refreshToken)).rejects.toThrow('Forbidden');
    });

    /**
     * The same revocation, from a document that never loaded its tokens — the call site the
     * reload above exists to avoid.
     *
     * `tokens` is `select: false`, so `this.tokens` is `undefined` here rather than `[]`. The
     * atomic `$pull` does not care: the revocation lands in the database either way. The failure
     * mode under test is what happens next — the in-memory resync runs `undefined.filter(...)`
     * and throws *after* the write has already succeeded, so a logout that revokes every session
     * must not report a 500 despite that.
     *
     * Both halves are asserted, because either one alone is satisfiable by the wrong code: a
     * revocation that resolves but does not revoke, or a revocation that revokes and then throws.
     */
    it('revokes without throwing on a document whose tokens were never loaded', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            RefreshTokenExpiryTime.SHORT
        );

        const bare = await userRepository.findById(String(user._id));
        expect(bare!.tokens).toBeUndefined();

        await expect(bare!.tokenRemoveAll(TokenType.REFRESH)).resolves.toBeUndefined();

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
            RefreshTokenExpiryTime.SHORT
        );

        const accessToken = await createAccessToken(refreshToken);
        const payload = await verifyAccessToken(accessToken);

        expect(payload.id).toBe(String(owner._id));
        expect(payload.id).not.toBe(String(other._id));
    });

    // "The one that matters most": if this regresses, the step-up freshness gate silently
    // degrades to nothing, because a client that refreshes every ten minutes is
    // never more than ten minutes from "fresh". Everything else keeps working; nothing else fails.
    it('COPIES auth_time forward from the refresh token — never re-stamps it from the clock', async () => {
        freezeDate();
        try {
            const user = await createUser();
            const refreshToken = await createRefreshToken(
                String(user._id),
                RefreshTokenExpiryTime.SHORT
            );
            const { auth_time: mintedAt } = await verifyRefreshToken(refreshToken);

            // Past a whole second — `auth_time` has second resolution — so a `createAccessToken`
            // that re-stamped the claim from the clock would produce a different value.
            advanceDate(1100);

            const accessToken = await createAccessToken(refreshToken);
            const { auth_time: exchangedAt } = await verifyAccessToken(accessToken);

            expect(exchangedAt).toBe(mintedAt);
        } finally {
            jest.useRealTimers();
        }
    });

    it('carries amr forward from the refresh token', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            RefreshTokenExpiryTime.SHORT
        );

        const accessToken = await createAccessToken(refreshToken);

        await expect(verifyAccessToken(accessToken)).resolves.toMatchObject({ amr: ['pwd'] });
    });
});

describe('rotateRefreshToken', () => {
    // The same guard `createRefreshToken` applies, at rotation's own reissue step —
    // deactivating an account mid-session must stop its NEXT refresh from reissuing, not just
    // block a fresh login.
    it('refuses to reissue for an account deactivated since the token was minted', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            RefreshTokenExpiryTime.SHORT
        );

        const loaded = await userRepository.findByIdWithCredentials(String(user._id));
        loaded!.active = false;
        await loaded!.save();

        await expect(rotateRefreshToken(refreshToken)).rejects.toThrow('User not found');
    });

    it('carries a ticked tier forward: persistent cookie, claim intact, remaining window', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(
            String(user._id),
            RefreshTokenExpiryTime.MEDIUM
        );

        const rotated = await rotateRefreshToken(refreshToken);

        expect(decode(rotated.refreshToken)).toMatchObject({ remember: 'medium' });
        expect(rotated.refreshMaxAgeMs).toBeGreaterThan(0);
        expect(rotated.refreshMaxAgeMs).toBeLessThanOrEqual(
            getExpiryTimeMilliseconds(RefreshTokenExpiryTime.MEDIUM)
        );
        // ...and the access token minted alongside carries it on to the next mint.
        expect(decode(rotated.accessToken)).toMatchObject({ remember: 'medium' });
    });

    it('keeps a browser-session login a session login across TWO rotations', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(String(user._id));

        const first = await rotateRefreshToken(refreshToken);
        const second = await rotateRefreshToken(first.refreshToken);

        for (const rotated of [first, second]) {
            // `undefined`, not a number: the controller sets NO Max-Age for it.
            expect(rotated.refreshMaxAgeMs).toBeUndefined();
            expect(decode(rotated.refreshToken)).not.toHaveProperty('remember');
        }
    });

    it('keeps the short-tier server limit on a rotated browser-session token', async () => {
        const user = await createUser();
        const refreshToken = await createRefreshToken(String(user._id));

        const { refreshToken: rotated } = await rotateRefreshToken(refreshToken);

        const { iat, exp } = decode(rotated) as { iat: number; exp: number };
        expect(exp - iat).toBeLessThanOrEqual(getExpiryTime(RefreshTokenExpiryTime.SHORT));
        expect(exp - iat).toBeGreaterThan(getExpiryTime(RefreshTokenExpiryTime.SHORT) - 5);
    });
});

describe('rememberOfRefreshToken', () => {
    it('reads the ticked tier off a refresh token naming the caller', async () => {
        const user = await createUser();
        const token = await createRefreshToken(String(user._id), RefreshTokenExpiryTime.LONG);

        await expect(rememberOfRefreshToken(token, String(user._id))).resolves.toBe(
            RefreshTokenExpiryTime.LONG
        );
    });

    it('answers undefined for a browser-session login', async () => {
        const user = await createUser();
        const token = await createRefreshToken(String(user._id));

        await expect(rememberOfRefreshToken(token, String(user._id))).resolves.toBeUndefined();
    });

    it('answers undefined for a token naming somebody else', async () => {
        const user = await createUser();
        const token = await createRefreshToken(String(user._id), RefreshTokenExpiryTime.LONG);

        await expect(rememberOfRefreshToken(token, 'someone-else')).resolves.toBeUndefined();
    });

    it('answers undefined for no cookie, and for garbage, rather than rejecting', async () => {
        await expect(rememberOfRefreshToken(undefined, 'anyone')).resolves.toBeUndefined();
        await expect(rememberOfRefreshToken('not-a-jwt', 'anyone')).resolves.toBeUndefined();
    });

    it('still reads the tier after the token has been revoked, since it never asks the database', async () => {
        // A password change revokes every session, THEN re-mints: the tier must outlive the row.
        const user = await createUser();
        const token = await createRefreshToken(String(user._id), RefreshTokenExpiryTime.MEDIUM);
        const loaded = await userRepository.findByIdWithCredentials(String(user._id));
        await loaded!.tokenRemoveAll(TokenType.REFRESH);

        await expect(rememberOfRefreshToken(token, String(user._id))).resolves.toBe(
            RefreshTokenExpiryTime.MEDIUM
        );
    });
});

/**
 * Rotation's theft detection, end to end against a real document.
 *
 * The bug this block exists for: the token sweep ran ahead of the rotation on the very request
 * presenting the token, and both read the SAME constant — so the sweep's purge predicate
 * (`supersededAt < now - grace`) was the exact complement of the detection predicate
 * (`supersededMsAgo > grace`). Every token the check would have called theft was already gone,
 * the lookup fell into the "genuinely absent" branch, and an ordinary 401 came back with nothing
 * revoked. Nothing failed; the defence was simply never reachable.
 *
 * The windows are now separate, so there is an interval — past grace, inside the retention window
 * — in which a replay is recognised. These shrink both to milliseconds and aim at it.
 */
describe('rotateRefreshToken reuse detection', () => {
    /** Past the grace window, comfortably inside the retention window. */
    const GRACE_MS = 20;
    const RETENTION_MS = 60_000;

    /**
     * Moves the frozen clock well outside the grace window. The clock is frozen for every case
     * below, so "inside the window" stays inside it however slow the machine is.
     */
    const pastGrace = () => advanceDate(GRACE_MS * 5);

    beforeEach(() => freezeDate());

    afterEach(() => jest.useRealTimers());

    /**
     * A retention window past its own grace window, the way `invalidTokenWindows` requires at
     * boot, but still comfortably inside {@link pastGrace}'s jump — so the sweep below finds it
     * expired without moving the clock any further.
     */
    const RETENTION_FOR_SWEEP_MS = GRACE_MS + 10;

    const withWindows = <T>(body: () => Promise<T>, retentionMs = RETENTION_MS) =>
        withEnvironmentOverrides(
            {
                NODE_TOKEN_ROTATION_GRACE_MS: String(GRACE_MS),
                NODE_TOKEN_REUSE_WINDOW_MS: String(retentionMs)
            },
            body
        );

    /**
     * Two sessions, one of them rotated and replayed late: the replay must be recognised as
     * reuse AND the OTHER session must be dead afterwards, because revoking only the presented
     * token protects nobody — the attacker already has it.
     */
    it('revokes every session on the account when a superseded token is replayed', async () => {
        await withWindows(async () => {
            const user = await createUser();
            const id = String(user._id);

            const attacked = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);
            const bystander = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);

            // The legitimate rotation. `attacked` is superseded from here on.
            await rotateRefreshToken(attacked);
            pastGrace();

            // The nightly whole-collection sweep, run between the rotation and the replay.
            // Present here on purpose: a sweep that purged the superseded tombstone before this
            // point would leave rotateRefreshToken nothing to recognise as reuse.
            await reapExpiredTokens();

            await expect(rotateRefreshToken(attacked)).rejects.toBeInstanceOf(TokenReuseError);

            // The session that was never touched is gone too.
            await expect(createAccessToken(bystander)).rejects.toThrow('Forbidden');

            // And the epoch moved, so an ACCESS token the attacker already holds dies as well.
            const stored = await userRepository.findByIdWithCredentials(id);
            expect(stored?.tokensValidAfter).toBeInstanceOf(Date);
        });
    });

    /**
     * The benign race still reissues. Without this the fix could be "treat every replay as
     * theft", which logs out two tabs that merely woke up together — the exact failure the grace
     * window exists to prevent.
     */
    it('reissues rather than revoking when the replay lands inside the grace window', async () => {
        await withWindows(async () => {
            const user = await createUser();
            const id = String(user._id);

            const raced = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);
            const bystander = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);

            await rotateRefreshToken(raced);

            // No wait: still inside the grace window.
            await expect(rotateRefreshToken(raced)).resolves.toMatchObject({
                accessToken: expect.any(String)
            });

            await expect(createAccessToken(bystander)).resolves.toEqual(expect.any(String));
        });
    });

    /**
     * The documented limit, asserted so it stays deliberate rather than becoming an accident
     * again: past the retention window the tombstone is swept and the replay is an ordinary dead
     * credential. A future change that quietly shortens retention back toward the grace window
     * fails the first test, not this one — this one just pins what the far side looks like.
     */
    it('answers an ordinary rejection once the retention window has passed', async () => {
        await withWindows(async () => {
            const user = await createUser();
            const id = String(user._id);

            const stale = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);
            const bystander = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);

            await rotateRefreshToken(stale);
            pastGrace();
            await reapExpiredTokens();

            await expect(rotateRefreshToken(stale)).rejects.toThrow('Forbidden');
            await expect(rotateRefreshToken(stale)).rejects.not.toBeInstanceOf(TokenReuseError);

            // And the untouched session survives — nothing was revoked.
            await expect(createAccessToken(bystander)).resolves.toEqual(expect.any(String));
        }, RETENTION_FOR_SWEEP_MS);
    });
});

/**
 * A rotation prunes the rotating account's OWN expired tokens: housekeeping on the path that
 * already loaded the document, instead of a whole-collection sweep on every refresh. It runs after
 * the lookup and the new token, never before, and it names the account, so nobody else's document
 * is touched.
 */
/** Give the account an entry that expired a second ago. */
const addExpiredToken = async (userId: string, token: string) => {
    const doc = await userRepository.findByIdWithCredentials(userId);
    doc!.tokens.push({
        sentAt: new Date(),
        type: TokenType.REFRESH,
        token: hashToken(token),
        expiration: new Date(Date.now() - 1000)
    });
    await userRepository.save(doc!);
};

/** The digests of every token an account holds. */
const heldBy = (userId: string) =>
    userRepository
        .findByIdWithCredentials(userId)
        .then((doc) => doc!.tokens.map(({ token }) => token));

describe('rotateRefreshToken housekeeping', () => {
    const GRACE_MS = 20;

    beforeEach(() => freezeDate());

    afterEach(() => jest.useRealTimers());

    it('drops the rotating account’s expired entries and leaves every other account alone', async () => {
        const rotating = await createUser({ email: 'rotating@example.com' });
        const bystander = await createUser({ email: 'bystander@example.com' });
        await addExpiredToken(String(rotating._id), 'expired-of-rotating');
        await addExpiredToken(String(bystander._id), 'expired-of-bystander');
        const live = await createRefreshToken(String(rotating._id), RefreshTokenExpiryTime.SHORT);

        await rotateRefreshToken(live);

        expect(await heldBy(String(rotating._id))).not.toContain(hashToken('expired-of-rotating'));
        expect(await heldBy(String(bystander._id))).toContain(hashToken('expired-of-bystander'));
    });

    // The prune runs on the reuse-detection window, so the tombstone a LATER replay must be
    // recognised against survives the rotation that pruned around it.
    it('keeps a superseded entry reuse detection still needs', async () => {
        await withEnvironmentOverrides(
            {
                NODE_TOKEN_ROTATION_GRACE_MS: String(GRACE_MS),
                NODE_TOKEN_REUSE_WINDOW_MS: '60000'
            },
            async () => {
                const user = await createUser();
                const id = String(user._id);
                const attacked = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);
                const other = await createRefreshToken(id, RefreshTokenExpiryTime.SHORT);

                await rotateRefreshToken(attacked);
                advanceDate(GRACE_MS * 5);
                // Another session's rotation prunes this account on its way through.
                await rotateRefreshToken(other);

                await expect(rotateRefreshToken(attacked)).rejects.toBeInstanceOf(TokenReuseError);
            }
        );
    });
});
