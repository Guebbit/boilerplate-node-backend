/**
 * @module
 * JWT creation and verification (`session/jwt.ts`). The security-critical distinction is
 * between token types: the access token is stateless (signature and expiry only), while the
 * refresh token is stateful, checked against its session row so logout — which removes the
 * row — actually ends the session. Secrets are set explicitly here rather than inherited
 * from `.env`, since unit tests don't load dotenv.
 *
 * Every fixture signs with `kid: keyId(secret)`, matching what `jwt.ts` itself stamps — the
 * ring's `kid` lookup is how a verifier finds the right member at all; see
 * `session/key-ring.ts`.
 */

import { randomUUID } from 'node:crypto';
import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import {
    verifyAccessToken,
    verifyRefreshToken,
    createAccessToken,
    rotateRefreshToken,
    rememberOfRefreshToken,
    TokenReuseError,
    startSession,
    FIRST_PARTY_CLIENT_ID
} from '@modules/account/session/jwt';
import { withEnvironmentOverrides, setEnvironment } from '@tests/environment';
import { advanceDate, freezeDate } from '@tests/clock';
import {
    RefreshTokenExpiryTime,
    getAccessTokenAudience,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getRefreshTokenAudience,
    getTokenIssuer
} from '@modules/account/session/config';
import { keyId } from '@modules/account/session/key-ring';
import { userRepository } from '@modules/users/tests/factories';
import { sessionRepository } from '../../repository';
import { plantSession, reapDueSessions, sessionRowFor, sessionRowsOf } from '../factories';

setupTestDb();

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

/**
 * Sign a fixture the way `jwt.ts` itself signs — `kid` stamped from the secret.
 *
 * `auth_time`/`amr` default in, since `TokenData` requires both on every real token — `payload`
 * overrides either when a case is specifically about one of them.
 */
const signAs = (
    secret: string,
    payload: object,
    { expiresIn = 3600, typ }: { expiresIn?: number; typ?: string } = {}
): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const refresh = secret === REFRESH_SECRET;
    return (
        new SignJWT({
            auth_time: now,
            amr: ['pwd'],
            ...(!refresh && { client_id: FIRST_PARTY_CLIENT_ID }),
            ...payload
        })
            // The `typ` a real token of that ring carries (RFC 9068); `typ` overrides it for the
            // cases that are about a wrong one.
            .setProtectedHeader({
                alg: 'HS256',
                typ: typ ?? (refresh ? 'rt+jwt' : 'at+jwt'),
                kid: keyId(secret)
            })
            .setIssuer(getTokenIssuer())
            .setAudience(refresh ? getRefreshTokenAudience() : getAccessTokenAudience())
            .setJti(randomUUID())
            .setIssuedAt(now)
            .setExpirationTime(now + expiresIn)
            .sign(new TextEncoder().encode(secret))
    );
};

beforeEach(() => {
    setEnvironment({ NODE_TOKEN_ACCESS: ACCESS_SECRET });
    setEnvironment({ NODE_TOKEN_REFRESH: REFRESH_SECRET });
    setEnvironment({ NODE_TOKEN_ACCESS_TIME: '900' });
    setEnvironment({ NODE_SESSION_TIME_SHORT: '3600' });
});

describe('verifyAccessToken', () => {
    it('resolves the payload of a token signed with the access secret', async () => {
        const token = await signAs(
            ACCESS_SECRET,
            { sub: 'user-1', sid: 'family-1' },
            { expiresIn: 900 }
        );

        await expect(verifyAccessToken(token)).resolves.toMatchObject({ sub: 'user-1' });
    });

    it('rejects a token signed with the refresh secret', async () => {
        // The two secrets must not be interchangeable: if they were, a refresh token would be
        // accepted as an access token and the revocation lookup could be bypassed entirely.
        const token = await signAs(REFRESH_SECRET, { sub: 'user-1' }, { expiresIn: 900 });

        // Its `kid` names no member of the access ring: a key this ring never held.
        await expect(verifyAccessToken(token)).rejects.toMatchObject({
            reason: 'invalid_signature'
        });
    });

    it('rejects an expired token', async () => {
        const token = await signAs(ACCESS_SECRET, { sub: 'user-1' }, { expiresIn: -10 });

        await expect(verifyAccessToken(token)).rejects.toMatchObject({ reason: 'expired' });
    });

    it('rejects a structurally invalid token', async () => {
        await expect(verifyAccessToken('not-a-jwt')).rejects.toMatchObject({
            reason: 'malformed'
        });
    });

    it('rejects a token whose payload was tampered with', async () => {
        const token = await signAs(ACCESS_SECRET, { sub: 'user-1' }, { expiresIn: 900 });
        const [header, , signature] = token.split('.', 3);
        const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url');

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
                const refresh = await startSession(String(user._id), ['pwd']);

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
                const refresh = await startSession(String(user._id), ['pwd']);
                const access = await createAccessToken(refresh);

                await expect(verifyRefreshToken(access)).rejects.toThrow('Wrong token type');
            }
        );
    });

    it('refuses a token carrying no `typ` at all', async () => {
        const unTyped = await new SignJWT({ sub: 'user-1', auth_time: 1, amr: ['pwd'] })
            .setProtectedHeader({ alg: 'HS256', kid: keyId(ACCESS_SECRET) })
            .setExpirationTime('15m')
            .sign(new TextEncoder().encode(ACCESS_SECRET));

        await expect(verifyAccessToken(unTyped)).rejects.toThrow('Wrong token type');
    });

    it('stamps the RFC 9068 `at+jwt` and a matching `rt+jwt` on what it signs', async () => {
        const user = await createUser();
        const refresh = await startSession(String(user._id), ['pwd']);
        const access = await createAccessToken(refresh);

        expect(decodeProtectedHeader(refresh).typ).toBe('rt+jwt');
        expect(decodeProtectedHeader(access).typ).toBe('at+jwt');
    });
});

describe('verifyRefreshToken after a rotation', () => {
    it('refuses a rotated-away token without revoking the family, and still rotates inside the grace window', async () => {
        const user = await createUser();
        const id = String(user._id);
        const original = await startSession(id, ['pwd']);
        const sibling = await startSession(id, ['pwd']);

        const rotated = await rotateRefreshToken(original);

        // The rotated-away token is no longer a credential for anything but the rotation itself...
        await expect(verifyRefreshToken(original)).rejects.toThrow('Forbidden');
        // ...and refusing it here is NOT reuse detection: the family is untouched.
        await expect(verifyRefreshToken(sibling)).resolves.toMatchObject({ sub: id });
        await expect(verifyRefreshToken(rotated.refreshToken)).resolves.toMatchObject({ sub: id });
        // The two-tab grace (a rotation inside the window) is the rotation's own path, unchanged.
        await expect(rotateRefreshToken(original)).resolves.toMatchObject({
            accessToken: expect.any(String)
        });
    });
});

describe('verifyRefreshToken', () => {
    it('resolves when the token is signed AND stored as a live session', async () => {
        const user = await createUser();
        const token = await signAs(REFRESH_SECRET, { sub: String(user._id) }, { expiresIn: 3600 });
        await plantSession(user.id, token, { ttlMs: 3_600_000 });

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ sub: String(user._id) });
    });

    it('rejects a validly-signed token that is not stored on any user', async () => {
        // This is the revocation check. A correct signature is necessary but not sufficient —
        // otherwise logout could never invalidate anything.
        await createUser();
        const orphanToken = await signAs(REFRESH_SECRET, { sub: 'user-1' }, { expiresIn: 3600 });

        await expect(verifyRefreshToken(orphanToken)).rejects.toThrow('Forbidden');
    });

    it('rejects once its session row has been removed', async () => {
        const user = await createUser();
        const token = await signAs(REFRESH_SECRET, { sub: String(user._id) }, { expiresIn: 3600 });
        await plantSession(user.id, token, { ttlMs: 3_600_000 });

        // Precondition: it works before revocation, so the assertion below cannot pass vacuously.
        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ sub: String(user._id) });

        await sessionRepository.removeAll(user.id);

        await expect(verifyRefreshToken(token)).rejects.toMatchObject({
            reason: 'revoked',
            message: 'Forbidden'
        });
    });

    it('rejects a token signed with the access secret', async () => {
        const user = await createUser();
        const token = await signAs(ACCESS_SECRET, { sub: String(user._id) }, { expiresIn: 3600 });
        await plantSession(user.id, token, { ttlMs: 3_600_000 });

        // Even though it is stored, the signature is checked first and must fail.
        await expect(verifyRefreshToken(token)).rejects.toThrow();
    });

    it('rejects an expired refresh token without consulting the database', async () => {
        const user = await createUser();
        const token = await signAs(REFRESH_SECRET, { sub: String(user._id) }, { expiresIn: -10 });
        await plantSession(user.id, token, { ttlMs: 3_600_000 });

        await expect(verifyRefreshToken(token)).rejects.toThrow();
    });
});

describe('startSession', () => {
    it('persists a verifiable refresh token as a session row', async () => {
        const user = await createUser();

        const issued = await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.SHORT);

        // Round-trip through the verifier rather than inspecting the string: what matters is
        // that the token this function produced is one the system will later accept.
        await expect(verifyRefreshToken(issued)).resolves.toMatchObject({ sub: String(user._id) });
    });

    it('stores a `jwt` session row, as a digest, with an expiry and its sign-in time', async () => {
        const user = await createUser();

        const issued = await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.SHORT);

        // Stored as a digest, never the plaintext `issued`.
        const stored = await sessionRowFor(issued);

        expect(stored).toMatchObject({ mode: 'jwt', userId: user._id });
        expect(stored!.supersededAt).toBeUndefined();
        // 3600s tier ⇒ a real future expiry, which is also when the database deletes the row.
        expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(stored!.purgeAt).toEqual(stored!.expiresAt);
        expect(stored!.startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('rejects for an unknown user id', async () => {
        // A signed token must never be issued for an identity that does not exist.
        await expect(
            startSession('507f1f77bcf86cd799439011', ['pwd'], RefreshTokenExpiryTime.SHORT)
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
            startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.SHORT)
        ).rejects.toThrow('User not found');
    });

    it('adds a row per login rather than replacing, so multi-device login works', async () => {
        const user = await createUser();

        const first = await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.SHORT);
        const second = await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.SHORT);

        // Both must remain individually verifiable: signing in on a phone must not sign the
        // laptop out. A write that replaced the account's rows would break exactly this.
        await expect(verifyRefreshToken(first)).resolves.toMatchObject({ sub: String(user._id) });
        await expect(verifyRefreshToken(second)).resolves.toMatchObject({ sub: String(user._id) });

        const rows = await sessionRowsOf(user.id);
        expect(rows).toHaveLength(2);
        // Two sign-ins are two sessions: each starts its own family.
        expect(new Set(rows.map((row) => String(row.familyId))).size).toBe(2);
    });
});

describe('createAccessToken', () => {
    it('exchanges a stored refresh token for a verifiable access token', async () => {
        const user = await createUser();
        const refreshToken = await startSession(
            String(user._id),
            ['pwd'],
            RefreshTokenExpiryTime.SHORT
        );

        const accessToken = await createAccessToken(refreshToken);

        await expect(verifyAccessToken(accessToken)).resolves.toMatchObject({
            sub: String(user._id)
        });
    });

    it('refuses to mint an access token from a revoked refresh token', async () => {
        // The entire point of the stateful refresh check: after logout, no new access tokens.
        const user = await createUser();
        const refreshToken = await startSession(
            String(user._id),
            ['pwd'],
            RefreshTokenExpiryTime.SHORT
        );

        await sessionRepository.removeAll(user.id);

        await expect(createAccessToken(refreshToken)).rejects.toThrow('Forbidden');
    });

    it('refuses to mint an access token from an unsigned or foreign token', async () => {
        await expect(createAccessToken('not-a-jwt')).rejects.toThrow();
    });

    it('carries the identity of the refresh token, not a caller-supplied one', async () => {
        const owner = await createUser({ email: 'owner@example.com' });
        const other = await createUser({ email: 'other@example.com' });
        const refreshToken = await startSession(
            String(owner._id),
            ['pwd'],
            RefreshTokenExpiryTime.SHORT
        );

        const accessToken = await createAccessToken(refreshToken);
        const payload = await verifyAccessToken(accessToken);

        expect(payload.sub).toBe(String(owner._id));
        expect(payload.sub).not.toBe(String(other._id));
    });

    // "The one that matters most": if this regresses, the step-up freshness gate silently
    // degrades to nothing, because a client that refreshes every ten minutes is
    // never more than ten minutes from "fresh". Everything else keeps working; nothing else fails.
    it('COPIES auth_time forward from the refresh token — never re-stamps it from the clock', async () => {
        freezeDate();
        try {
            const user = await createUser();
            const refreshToken = await startSession(
                String(user._id),
                ['pwd'],
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
        const refreshToken = await startSession(
            String(user._id),
            ['pwd'],
            RefreshTokenExpiryTime.SHORT
        );

        const accessToken = await createAccessToken(refreshToken);

        await expect(verifyAccessToken(accessToken)).resolves.toMatchObject({ amr: ['pwd'] });
    });
});

describe('rotateRefreshToken', () => {
    // The same guard `startSession` applies, at rotation's own reissue step —
    // deactivating an account mid-session must stop its NEXT refresh from reissuing, not just
    // block a fresh login.
    it('refuses to reissue for an account deactivated since the token was minted', async () => {
        const user = await createUser();
        const refreshToken = await startSession(
            String(user._id),
            ['pwd'],
            RefreshTokenExpiryTime.SHORT
        );

        const loaded = await userRepository.findByIdWithCredentials(String(user._id));
        loaded!.active = false;
        await loaded!.save();

        await expect(rotateRefreshToken(refreshToken)).rejects.toThrow('User not found');
    });

    it('carries a ticked tier forward: persistent cookie, claim intact, remaining window', async () => {
        const user = await createUser();
        const refreshToken = await startSession(
            String(user._id),
            ['pwd'],
            RefreshTokenExpiryTime.MEDIUM
        );

        const rotated = await rotateRefreshToken(refreshToken);

        expect(decodeJwt(rotated.refreshToken)).toMatchObject({ remember: 'medium' });
        expect(rotated.refreshMaxAgeMs).toBeGreaterThan(0);
        expect(rotated.refreshMaxAgeMs).toBeLessThanOrEqual(
            getExpiryTimeMilliseconds(RefreshTokenExpiryTime.MEDIUM)
        );
        // ...and the access token minted alongside carries it on to the next mint.
        expect(decodeJwt(rotated.accessToken)).toMatchObject({ remember: 'medium' });
    });

    it('keeps a browser-session login a session login across TWO rotations', async () => {
        const user = await createUser();
        const refreshToken = await startSession(String(user._id), ['pwd']);

        const first = await rotateRefreshToken(refreshToken);
        const second = await rotateRefreshToken(first.refreshToken);

        for (const rotated of [first, second]) {
            // `undefined`, not a number: the controller sets NO Max-Age for it.
            expect(rotated.refreshMaxAgeMs).toBeUndefined();
            expect(decodeJwt(rotated.refreshToken)).not.toHaveProperty('remember');
        }
    });

    it('keeps the short-tier server limit on a rotated browser-session token', async () => {
        const user = await createUser();
        const refreshToken = await startSession(String(user._id), ['pwd']);

        const { refreshToken: rotated } = await rotateRefreshToken(refreshToken);

        const { iat, exp } = decodeJwt(rotated) as { iat: number; exp: number };
        expect(exp - iat).toBeLessThanOrEqual(getExpiryTime(RefreshTokenExpiryTime.SHORT));
        expect(exp - iat).toBeGreaterThan(getExpiryTime(RefreshTokenExpiryTime.SHORT) - 5);
    });
});

describe('rememberOfRefreshToken', () => {
    it('reads the ticked tier off a refresh token naming the caller', async () => {
        const user = await createUser();
        const token = await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.LONG);

        await expect(rememberOfRefreshToken(token, String(user._id))).resolves.toBe(
            RefreshTokenExpiryTime.LONG
        );
    });

    it('answers undefined for a browser-session login', async () => {
        const user = await createUser();
        const token = await startSession(String(user._id), ['pwd']);

        await expect(rememberOfRefreshToken(token, String(user._id))).resolves.toBeUndefined();
    });

    it('answers undefined for a token naming somebody else', async () => {
        const user = await createUser();
        const token = await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.LONG);

        await expect(rememberOfRefreshToken(token, 'someone-else')).resolves.toBeUndefined();
    });

    it('answers undefined for no cookie, and for garbage, rather than rejecting', async () => {
        await expect(rememberOfRefreshToken(undefined, 'anyone')).resolves.toBeUndefined();
        await expect(rememberOfRefreshToken('not-a-jwt', 'anyone')).resolves.toBeUndefined();
    });

    it('still reads the tier after the token has been revoked, since it never asks the database', async () => {
        // A password change revokes every session, THEN re-mints: the tier must outlive the row.
        const user = await createUser();
        const token = await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.MEDIUM);
        await sessionRepository.removeAll(user.id);

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

            const attacked = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);
            const bystander = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);

            // The legitimate rotation. `attacked` is superseded from here on.
            await rotateRefreshToken(attacked);
            pastGrace();

            // The TTL monitor, run between the rotation and the replay. Present here on purpose: a
            // row purged before this point would leave rotateRefreshToken nothing to recognise as
            // reuse.
            await reapDueSessions();

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

            const raced = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);
            const bystander = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);

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

            const stale = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);
            const bystander = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);

            await rotateRefreshToken(stale);
            pastGrace();
            await reapDueSessions();

            await expect(rotateRefreshToken(stale)).rejects.toThrow('Forbidden');
            await expect(rotateRefreshToken(stale)).rejects.not.toBeInstanceOf(TokenReuseError);

            // And the untouched session survives — nothing was revoked.
            await expect(createAccessToken(bystander)).resolves.toEqual(expect.any(String));
        }, RETENTION_FOR_SWEEP_MS);
    });
});

/**
 * A rotation shortens the superseded row's `purgeAt` to the reuse-detection window, so the database
 * deletes it on its own when nothing could still replay it. No job and no per-request prune.
 */
describe('rotateRefreshToken retention', () => {
    const GRACE_MS = 20;

    beforeEach(() => freezeDate());

    afterEach(() => jest.useRealTimers());

    it('shortens the superseded row to the reuse window, and leaves the successor on its own expiry', async () => {
        await withEnvironmentOverrides(
            {
                NODE_TOKEN_ROTATION_GRACE_MS: String(GRACE_MS),
                NODE_TOKEN_REUSE_WINDOW_MS: '60000'
            },
            async () => {
                const user = await createUser();
                const live = await startSession(user.id, ['pwd'], RefreshTokenExpiryTime.SHORT);
                const before = await sessionRowFor(live);

                const { refreshToken } = await rotateRefreshToken(live);

                const superseded = await sessionRowFor(live);
                const successor = await sessionRowFor(refreshToken);
                expect(superseded!.supersededAt).toEqual(new Date());
                expect(superseded!.purgeAt).toEqual(new Date(Date.now() + 60_000));
                // Same session: one family, one sign-in time, and the old row's absolute expiry.
                expect(successor!.familyId).toEqual(before!.familyId);
                expect(successor!.startedAt).toEqual(before!.startedAt);
                // Within a second: the token's own `exp` has second resolution.
                expect(
                    Math.abs(successor!.expiresAt.getTime() - before!.expiresAt.getTime())
                ).toBeLessThan(1000);
                expect(successor!.purgeAt).toEqual(successor!.expiresAt);
            }
        );
    });

    it('never moves a superseded row past its own expiry', async () => {
        await withEnvironmentOverrides({ NODE_TOKEN_REUSE_WINDOW_MS: '999999999' }, async () => {
            const user = await createUser();
            const live = await startSession(user.id, ['pwd'], RefreshTokenExpiryTime.SHORT);

            await rotateRefreshToken(live);

            const superseded = await sessionRowFor(live);
            expect(superseded!.purgeAt).toEqual(superseded!.expiresAt);
        });
    });

    // The tombstone a LATER replay must be recognised against survives another session's rotation.
    it('keeps a superseded entry reuse detection still needs', async () => {
        await withEnvironmentOverrides(
            {
                NODE_TOKEN_ROTATION_GRACE_MS: String(GRACE_MS),
                NODE_TOKEN_REUSE_WINDOW_MS: '60000'
            },
            async () => {
                const user = await createUser();
                const id = String(user._id);
                const attacked = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);
                const other = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);

                await rotateRefreshToken(attacked);
                advanceDate(GRACE_MS * 5);
                // Another session's rotation, and the TTL monitor, both pass over it.
                await rotateRefreshToken(other);
                await reapDueSessions();

                await expect(rotateRefreshToken(attacked)).rejects.toBeInstanceOf(TokenReuseError);
            }
        );
    });
});

/** When the account was last stamped as active. */
const activeAt = (userId: string) =>
    userRepository.findByIdWithCredentials(userId).then((doc) => doc!.lastActiveAt);

describe('the activity stamp the inactivity reaper reads', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    beforeEach(() => freezeDate());

    afterEach(() => jest.useRealTimers());

    it('stamps a sign-in', async () => {
        const user = await createUser();
        expect(await activeAt(String(user._id))).toBeUndefined();

        await startSession(String(user._id), ['pwd'], RefreshTokenExpiryTime.SHORT);

        expect(await activeAt(String(user._id))).toEqual(new Date());
    });

    it('stamps a refresh', async () => {
        const user = await createUser();
        const id = String(user._id);
        const first = await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);
        // Backdated by hand: the token itself lives an hour, so the clock cannot move a day.
        await userRepository.updateMany(
            { _id: id },
            { $set: { lastActiveAt: new Date(Date.now() - 2 * DAY_MS) } }
        );

        await rotateRefreshToken(first);

        expect(await activeAt(id)).toEqual(new Date());
    });

    it('writes at most once a day, and again after a day', async () => {
        const user = await createUser();
        const id = String(user._id);
        const stamped = new Date();
        await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);

        advanceDate(DAY_MS - 1000);
        await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);
        expect(await activeAt(id)).toEqual(stamped);

        advanceDate(2000);
        await startSession(id, ['pwd'], RefreshTokenExpiryTime.SHORT);
        expect(await activeAt(id)).toEqual(new Date());
    });
});
