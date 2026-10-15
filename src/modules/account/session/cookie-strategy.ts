/**
 * @module
 * `cookie` mode: one random session id, stored only as its sha256, one `sessions` row per
 * sign-in. A browser carries it in an HttpOnly `__Host-session` cookie; any other client gets it
 * back as `ses_…` and sends it as `Authorization: Bearer`. No signing key, no refresh, no rotation
 * race: logging out is a row delete, and the row is read on every request anyway.
 *
 * - `authTime` is stored at login and renewed only by `POST /account/reauth`, never by use — a
 *   session kept alive is not a fresh login, so step-up behaves exactly as it does in `jwt` mode.
 * - The id is replaced on every re-proof (OWASP: renew the id on a privilege change), keeping the
 *   session's public id, sign-in time and absolute expiry.
 * - `lastUsedAt` is written at most once a minute, so a busy tab does not write per request.
 *
 * See: docs/theory/sessions.md
 */

import type { Response } from 'express';
import { Types } from 'mongoose';
import { bearerOf, readSessionCookie } from '@kernel/cookies';
import type { Resolution, StreamWatch } from '@kernel/authentication';
import { logger } from '@infrastructure/adapters/logger';
import { hashToken } from '@infrastructure/security/hash-token';
import { userService } from '@modules/users';
import type { AuthContext, ResolveOptions } from '@types';
import { sessionRepository, type SessionRow } from '../repository';
import { recordActivity } from './activity';
import { resolveProof } from './auth-context';
import { createSessionCookie } from './cookies';
import { RefreshTokenExpiryTime, getExpiryTimeMilliseconds } from './config';
import { describeDevice } from './device-label';
import { listSessions } from './listing';
import { hasIdledOut } from './idle';
import { resolveInLiveFamily } from './family-liveness';
import { assertProofCurrent, assertSecondFactor } from './mint-guard';
import { looksLikeJwt, looksLikeSessionId, newSessionId } from './session-id';
import type {
    IssuedSession,
    IssueOptions,
    SessionRequest,
    SessionSnapshot,
    SessionStrategy,
    SessionTransport
} from './strategy';

/** How often a busy session may write its `lastUsedAt`. */
const USE_STAMP_INTERVAL_MS = 60_000;

/** The tier stored on a row, back as the enum — `undefined` for a browser-session login. */
const rememberOf = (row: Pick<SessionRow, 'remember'>): RefreshTokenExpiryTime | undefined =>
    Object.values(RefreshTokenExpiryTime).find((tier) => tier === row.remember);

/** What the session being started inherits from the one it replaces. */
type Inherited = Pick<SessionSnapshot, 'familyId' | 'startedAt' | 'expiresAt' | 'device'>;

/**
 * Store a new session row and return its id.
 *
 * @param userId - whose session this is
 * @param proof - how the account proved itself, and when its check began (epoch milliseconds)
 * @param remember - the ticked tier, absent for a browser-session login
 * @param inherited - when this REPLACES a session, the identity, device and expiry it keeps
 * @returns the plaintext id (the only moment it exists here) and the row's expiry
 */
const storeSession = (
    userId: string,
    proof: { amr: readonly string[]; provedAt: number },
    remember: RefreshTokenExpiryTime | undefined,
    inherited: Inherited = {}
): Promise<{ id: string; expiresAt: Date }> => {
    const id = newSessionId();
    const now = new Date();
    const expiresAt =
        inherited.expiresAt ?? new Date(now.getTime() + getExpiryTimeMilliseconds(remember));
    return sessionRepository
        .insert({
            userId: new Types.ObjectId(userId),
            // A first session starts a family; a replacement keeps the id the owner already sees.
            familyId: inherited.familyId ?? new Types.ObjectId(),
            mode: 'cookie',
            tokenHash: hashToken(id),
            // Seconds, OIDC's `auth_time` unit, the same as the `jwt` claim.
            authTime: Math.floor(proof.provedAt / 1000),
            amr: [...proof.amr],
            ...(remember && { remember }),
            startedAt: inherited.startedAt ?? now,
            expiresAt,
            ...(inherited.device && { device: inherited.device })
        })
        .then(() => recordActivity(userId))
        .then(() => ({ id, expiresAt }));
};

/**
 * Hand the credential to the client: a cookie for a browser, the id itself in the body otherwise.
 * A remembered session's cookie persists until the session's own expiry; an unremembered one is a
 * browser-session cookie, whose server-side limit is still the `short` tier.
 *
 * @param response - the live response
 * @param started - the id and expiry {@link storeSession} returned
 * @param remember - the tier, deciding whether the cookie persists
 * @param transport - where the credential goes
 */
const deliver = (
    response: Response,
    started: { id: string; expiresAt: Date },
    remember: RefreshTokenExpiryTime | undefined,
    transport: SessionTransport
): IssuedSession => {
    if (transport === 'bearer') return { sessionToken: started.id };

    const maxAgeMs = remember
        ? Math.max(started.expiresAt.getTime() - Date.now(), 1000)
        : undefined;
    createSessionCookie(response, started.id, maxAgeMs);
    return {};
};

/** The credential a request presents: a `ses_…` bearer when it authenticated that way, else the cookie. */
const credentialOf = (request: SessionRequest): string | undefined => {
    const match = bearerOf(request.headers.authorization);
    return match && looksLikeSessionId(match) ? match : readSessionCookie(request);
};

/** The way the caller's own request authenticated, which decides how a replacement is handed back. */
const transportOf = (request: SessionRequest): SessionTransport =>
    request.sessionVia === 'bearer' ? 'bearer' : 'cookie';

/**
 * What the caller's own session carries, read from its row. Empty when the request names no live
 * `cookie` session of this account — a re-mint then starts a fresh one.
 */
const snapshotOf = (request: SessionRequest, userId: string): Promise<SessionSnapshot> => {
    const credential = credentialOf(request);
    return credential
        ? sessionRepository.findByHash(hashToken(credential)).then((row) =>
              row?.mode === 'cookie' && String(row.userId) === userId
                  ? {
                        ...(rememberOf(row) && { remember: rememberOf(row) }),
                        familyId: row.familyId,
                        startedAt: row.startedAt,
                        expiresAt: row.expiresAt,
                        ...(row.device && { device: row.device })
                    }
                  : {}
          )
        : Promise.resolve({});
};

/**
 * Replace the caller's session: store the successor first, delete the old row second, so a failure
 * between the two leaves two sessions rather than none.
 */
const replaceSession = (
    request: SessionRequest,
    userId: string,
    amr: readonly string[],
    snapshot: SessionSnapshot
): Promise<{ id: string; expiresAt: Date }> => {
    const previous = credentialOf(request);
    // Stamped at the mint: a re-mint can follow its own epoch move (a password change).
    const proof = { amr, provedAt: Date.now() };
    return storeSession(userId, proof, snapshot.remember, snapshot).then((started) =>
        (previous ? sessionRepository.removeByHash(hashToken(previous)) : Promise.resolve(0))
            .then(() => started)
            .catch((error: unknown) => {
                logger.warn({ message: 'Could not retire the replaced session.', userId, error });
                return started;
            })
    );
};

/**
 * A sign-in on top of a live session ends that session: the browser is no longer using it, and a
 * session nobody holds the id of would live out its expiry. Stored-first like `replaceSession`, so
 * a failure here leaves two sessions rather than none.
 */
const retirePresentedSession = (request: SessionRequest): Promise<void> => {
    const previous = credentialOf(request);
    return (
        previous ? sessionRepository.removeFamilyByHash(hashToken(previous)) : Promise.resolve(0)
    )
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.warn({ message: 'Could not retire the session this sign-in replaced.', error });
        });
};

/** Whether a row's `lastUsedAt` is older than {@link USE_STAMP_INTERVAL_MS} (or was never stamped). */
const stampDue = (row: Pick<SessionRow, 'lastUsedAt'>): boolean =>
    !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() >= USE_STAMP_INTERVAL_MS;

/**
 * Find the live row a presented session id names.
 *
 * @param id - the Bearer or cookie value
 * @returns a miss for an unknown, other-mode or expired id; the row otherwise
 */
const findLiveRow = (id: string): Promise<Resolution<SessionRow>> => {
    if (!looksLikeSessionId(id))
        // A JWT is the other mode's credential, left in the browser by a switch: stale, not forged.
        return Promise.resolve({ miss: looksLikeJwt(id) ? 'revoked' : 'malformed' });

    return sessionRepository.findByHash(hashToken(id)).then((row): Resolution<SessionRow> => {
        if (row?.mode !== 'cookie') return { miss: 'revoked' };
        if (row.expiresAt <= new Date()) return { miss: 'expired' };
        return { ok: row };
    });
};

/**
 * What a row proves, as the caller it names — `undefined` for an account that may no longer sign
 * in, or a session the epoch has passed.
 */
const resolveRowProof = (row: SessionRow): Promise<AuthContext | undefined> =>
    resolveProof(String(row.userId), { authTime: row.authTime ?? 0, amr: row.amr ?? [] });

/**
 * Resolve a presented session id to the caller it names.
 *
 * A staff session idle past its limit is ended here — the whole family goes — and answers `idle`.
 * Any other live request counts as activity, unless it says it is `passive`.
 *
 * @param id - the Bearer or cookie value
 * @param options - `passive` requests are judged but never counted as activity
 * @returns a miss for an unknown, other-mode, expired or idled-out id; `ok` otherwise (`undefined`
 *   for an account that may no longer sign in, or a session the epoch has passed)
 */
const resolveSession = (
    id: string,
    options: ResolveOptions = {}
): Promise<Resolution<AuthContext | undefined>> =>
    findLiveRow(id).then((found) => {
        if ('miss' in found) return found;
        const row = found.ok;

        return resolveRowProof(row).then(
            (
                ok
            ):
                | Resolution<AuthContext | undefined>
                | Promise<Resolution<AuthContext | undefined>> => {
                if (ok && hasIdledOut(row.lastUsedAt ?? row.startedAt, ok.roles))
                    return sessionRepository
                        .removeFamily(String(row.userId), String(row.familyId))
                        .then((): Resolution<AuthContext | undefined> => ({ miss: 'idle' }));

                // Housekeeping, off the request's path: a lost stamp costs a stale reading only. The
                // throttle is checked on the row already in hand, so a busy tab costs no extra query.
                if (ok && !options.passive && stampDue(row))
                    void sessionRepository
                        .touch(hashToken(id), new Date(), USE_STAMP_INTERVAL_MS)
                        .then((wrote) => (wrote ? recordActivity(String(row.userId)) : undefined))
                        .catch((error: unknown) => {
                            logger.warn({ message: 'Could not stamp a session as used.', error });
                        });
                return { ok };
            }
        );
    });

/**
 * The session cookie of an SSE stream. The recheck follows the row's FAMILY: a re-proof replaces
 * the id (and the row) but keeps the family, and must not close a stream the owner still holds.
 */
const watchSession = (id: string): Promise<Resolution<StreamWatch>> =>
    findLiveRow(id).then((found) => {
        if ('miss' in found) return found;
        const row = found.ok;

        return resolveRowProof(row).then(
            (context): Resolution<StreamWatch> => ({
                ok: {
                    context,
                    // A stream's recheck is not the person acting: judged, never counted.
                    recheck: () =>
                        resolveInLiveFamily(
                            String(row.userId),
                            String(row.familyId),
                            'cookie',
                            () => resolveRowProof(row),
                            { passive: true }
                        )
                }
            })
        );
    });

/** The `cookie` adapter. */
export const cookieStrategy: SessionStrategy = {
    mode: 'cookie',
    // Every route a session reaches takes the cookie: the page holds no token to send.
    cookieAuthenticates: true,

    issue: (request, response, userId, options: IssueOptions) => {
        const { remember, amr, provedAt, transport = 'cookie' } = options;
        return userService.findAuthenticatableById(userId).then((user) => {
            if (!user) throw new Error('User not found');
            assertSecondFactor(user, amr);
            assertProofCurrent(user, provedAt);
            // The label is read once, at the sign-in, from the client that made it.
            const device = describeDevice(request.get('user-agent'));
            return storeSession(userId, { amr, provedAt }, remember, { device }).then((started) =>
                retirePresentedSession(request).then(() =>
                    deliver(response, started, remember, transport)
                )
            );
        });
    },

    snapshot: snapshotOf,

    reissue: (request, response, userId, options) =>
        (options.snapshot ? Promise.resolve(options.snapshot) : snapshotOf(request, userId)).then(
            (snapshot) =>
                replaceSession(request, userId, options.amr, snapshot).then((started) =>
                    deliver(response, started, snapshot.remember, transportOf(request))
                )
        ),

    remint: (request, response, userId, { amr, snapshot }) =>
        (snapshot ? Promise.resolve(snapshot) : snapshotOf(request, userId))
            .then((kept) =>
                replaceSession(request, userId, amr, kept).then((started) =>
                    // A bearer client holds the id itself, so it gets the new one back in the body.
                    deliver(response, started, kept.remember, transportOf(request))
                )
            )
            .catch((error: unknown): IssuedSession => {
                logger.warn({
                    message: 'The session change succeeded, but the re-mint failed.',
                    userId,
                    error
                });
                return {};
            }),

    resolveBearer: resolveSession,
    resolveCookie: resolveSession,
    watchCookie: watchSession,

    credentialOf,

    list: (userId, credential) => listSessions('cookie', userId, credential)
};
