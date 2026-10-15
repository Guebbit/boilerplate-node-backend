/**
 * @module
 * `cookie` mode's adapter (`../../session/cookie-strategy.ts`) at the unit level: which credential
 * a request names, how a presented id resolves, and where a minted id is handed back. The session
 * store, the account read and the proof resolver are REPLACED: what the queries do is
 * `../integration/session-modes.test.ts`'s, against a real store and over HTTP.
 */

import { Types } from 'mongoose';
import { asStub } from '@tests/stub';
import { setEnvironment } from '@tests/environment';

jest.mock('@modules/users', () => {
    const actual = jest.requireActual<typeof import('@modules/users')>('@modules/users');
    return {
        ...actual,
        __esModule: true,
        userService: {
            ...actual.userService,
            findAuthenticatableById: jest.fn(),
            touchLastActive: jest.fn()
        }
    };
});

jest.mock('@modules/account/repository', () => {
    const actual = jest.requireActual<typeof import('@modules/account/repository')>(
        '@modules/account/repository'
    );
    return {
        ...actual,
        __esModule: true,
        sessionRepository: {
            ...actual.sessionRepository,
            insert: jest.fn(),
            findByHash: jest.fn(),
            removeByHash: jest.fn(),
            touch: jest.fn(),
            familyActivity: jest.fn(),
            touchFamily: jest.fn(),
            removeFamily: jest.fn(),
            listLive: jest.fn()
        }
    };
});

// What a proof MEANS is `auth-context`'s, shared with `jwt` mode; here only whether it is asked.
jest.mock('@modules/account/session/auth-context', () => ({
    __esModule: true,
    resolveProof: jest.fn()
}));

jest.mock('@modules/access', () => {
    const actual = jest.requireActual<typeof import('@modules/access')>('@modules/access');
    return {
        ...actual,
        __esModule: true,
        rolesOf: jest.fn(() => Promise.resolve({ tenant: 'customer', platform: null }))
    };
});

import { cookieStrategy } from '@modules/account/session/cookie-strategy';
import { SecondFactorRequiredError, StaleProofError } from '@modules/account/session/mint-guard';
import { resolveProof } from '@modules/account/session/auth-context';
import { sessionRepository, type NewSessionRow } from '@modules/account/repository';
import { userService } from '@modules/users';
import { rolesOf } from '@modules/access';
import { hashToken } from '@infrastructure/security/hash-token';
import { cookieSet, recordingResponse, requestWith } from '../strategy-doubles';
import { RefreshTokenExpiryTime } from '@modules/account/session/config';

/** The account every case signs in. */
const USER_ID = '507f1f77bcf86cd799439011';

/** The caller its proof resolves to: a shopper, whom no idle timeout touches. */
const SHOPPER = { id: USER_ID, roles: { tenant: 'customer', platform: null } };

/** A well-formed id nobody minted — shape only. */
const SOME_ID = `ses_${'a'.repeat(43)}`;

/** The repository doubles, typed as the mocks they are. */
const sessions = asStub<{
    insert: jest.Mock;
    findByHash: jest.Mock;
    removeByHash: jest.Mock;
    touch: jest.Mock;
    familyActivity: jest.Mock;
    touchFamily: jest.Mock;
    removeFamily: jest.Mock;
    listLive: jest.Mock;
}>(sessionRepository);

/** The account-read doubles. */
const users = asStub<{ findAuthenticatableById: jest.Mock; touchLastActive: jest.Mock }>(
    userService
);

/** The proof resolver double. */
const proof = asStub<jest.Mock>(resolveProof);

/** The row the last `insert` stored. */
const insertedRow = (): NewSessionRow => {
    // `insert` is a bare `jest.Mock`: the stored row's type is what the strategy was told to insert.
    const call = sessions.insert.mock.calls.at(-1) as [NewSessionRow] | undefined;
    if (!call) throw new Error('no session row was inserted');
    return call[0];
};

/** A stored `cookie` row for the account, live for another hour unless `overrides` say not. */
const liveRow = (overrides: Record<string, unknown> = {}) => ({
    userId: new Types.ObjectId(USER_ID),
    familyId: new Types.ObjectId(),
    mode: 'cookie',
    tokenHash: hashToken(SOME_ID),
    authTime: 1_700_000_000,
    amr: ['pwd'],
    startedAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 3_600_000),
    ...overrides
});

beforeEach(() => {
    // `reset`, not `clear`: each case sets its own resolutions, and a leftover one fails the next.
    jest.resetAllMocks();
    jest.mocked(rolesOf).mockResolvedValue({ tenant: 'customer', platform: null });
    setEnvironment({ NODE_SESSION_TIME_SHORT: '3600', NODE_SESSION_TIME_LONG: '2592000' });
    sessions.insert.mockResolvedValue(undefined);
    sessions.removeByHash.mockResolvedValue(1);
    sessions.touch.mockResolvedValue(false);
    users.touchLastActive.mockResolvedValue(undefined);
    users.findAuthenticatableById.mockResolvedValue(SHOPPER);
});

describe('credentialOf', () => {
    it('names the `ses_` bearer when the request carries one', () => {
        const request = requestWith({ authorization: `Bearer ${SOME_ID}`, cookie: 'ses_other' });

        expect(cookieStrategy.credentialOf(request)).toBe(SOME_ID);
    });

    it('reads the scheme in any case', () => {
        expect(
            cookieStrategy.credentialOf(requestWith({ authorization: `bEaReR ${SOME_ID}` }))
        ).toBe(SOME_ID);
    });

    it('falls back to the cookie when the bearer is not a session id', () => {
        const request = requestWith({
            authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x',
            cookie: SOME_ID
        });

        expect(cookieStrategy.credentialOf(request)).toBe(SOME_ID);
    });

    it('names nothing for a request with neither', () => {
        expect(cookieStrategy.credentialOf(requestWith())).toBeUndefined();
    });
});

describe.each([
    ['resolveBearer', cookieStrategy.resolveBearer],
    ['resolveCookie', cookieStrategy.resolveCookie]
])('%s', (_name, resolve) => {
    it('refuses anything not shaped like a session id without a lookup', async () => {
        await expect(resolve('not-a-session')).resolves.toEqual({ miss: 'malformed' });
        expect(sessions.findByHash).not.toHaveBeenCalled();
    });

    it('reads a JWT as revoked, not forged: it is the other mode’s credential, left by a switch', async () => {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

        await expect(resolve(jwt)).resolves.toEqual({ miss: 'revoked' });
        expect(sessions.findByHash).not.toHaveBeenCalled();
    });

    it('looks the id up by its digest, never by the id itself', async () => {
        sessions.findByHash.mockResolvedValue(null);

        await resolve(SOME_ID);

        expect(sessions.findByHash).toHaveBeenCalledWith(hashToken(SOME_ID));
    });

    it('reads an id no row holds as revoked', async () => {
        sessions.findByHash.mockResolvedValue(null);

        await expect(resolve(SOME_ID)).resolves.toEqual({ miss: 'revoked' });
    });

    it('reads a `jwt` row as revoked: a row belongs to the mode that issued it', async () => {
        sessions.findByHash.mockResolvedValue(liveRow({ mode: 'jwt' }));

        await expect(resolve(SOME_ID)).resolves.toEqual({ miss: 'revoked' });
        expect(proof).not.toHaveBeenCalled();
    });

    it('reads a row past its expiry as expired, before the TTL monitor has deleted it', async () => {
        sessions.findByHash.mockResolvedValue(liveRow({ expiresAt: new Date(Date.now() - 1) }));

        await expect(resolve(SOME_ID)).resolves.toEqual({ miss: 'expired' });
        expect(proof).not.toHaveBeenCalled();
    });

    it('hands a live row’s stored proof to the shared resolver, and answers its context', async () => {
        const context = SHOPPER;
        sessions.findByHash.mockResolvedValue(liveRow({ amr: ['pwd', 'otp'] }));
        proof.mockResolvedValue(context);

        await expect(resolve(SOME_ID)).resolves.toEqual({ ok: context });
        expect(proof).toHaveBeenCalledWith(USER_ID, {
            authTime: 1_700_000_000,
            amr: ['pwd', 'otp']
        });
    });

    it('reads a row with no stored proof as the oldest, emptiest one', async () => {
        sessions.findByHash.mockResolvedValue(liveRow({ authTime: undefined, amr: undefined }));
        proof.mockResolvedValue(undefined);

        await resolve(SOME_ID);

        expect(proof).toHaveBeenCalledWith(USER_ID, { authTime: 0, amr: [] });
    });

    it('answers `ok: undefined` for an account that may no longer act, and stamps no use', async () => {
        sessions.findByHash.mockResolvedValue(liveRow());
        proof.mockResolvedValue(undefined);

        await expect(resolve(SOME_ID)).resolves.toEqual({ ok: undefined });
        expect(sessions.touch).not.toHaveBeenCalled();
    });

    it('stamps the use only when the row’s last stamp is over a minute old', async () => {
        proof.mockResolvedValue(SHOPPER);

        sessions.findByHash.mockResolvedValue(liveRow({ lastUsedAt: new Date() }));
        await resolve(SOME_ID);
        expect(sessions.touch).not.toHaveBeenCalled();

        sessions.findByHash.mockResolvedValue(
            liveRow({ lastUsedAt: new Date(Date.now() - 61_000) })
        );
        await resolve(SOME_ID);
        expect(sessions.touch).toHaveBeenCalledTimes(1);

        sessions.touch.mockClear();
        sessions.findByHash.mockResolvedValue(liveRow({ lastUsedAt: undefined }));
        await resolve(SOME_ID);
        expect(sessions.touch).toHaveBeenCalledTimes(1);
    });

    it('still answers when the use stamp fails', async () => {
        sessions.findByHash.mockResolvedValue(liveRow());
        proof.mockResolvedValue(SHOPPER);
        sessions.touch.mockRejectedValue(new Error('store down'));

        await expect(resolve(SOME_ID)).resolves.toEqual({ ok: SHOPPER });
    });
});

describe('issue', () => {
    it('refuses an account that cannot be found', async () => {
        users.findAuthenticatableById.mockResolvedValue(null);
        const { response } = recordingResponse();

        await expect(
            cookieStrategy.issue(requestWith(), response, USER_ID, {
                amr: ['pwd'],
                provedAt: Date.now()
            })
        ).rejects.toThrow('User not found');
        expect(sessions.insert).not.toHaveBeenCalled();
    });

    it('refuses a first session on an armed account whose proof lacks the factor, storing nothing', async () => {
        users.findAuthenticatableById.mockResolvedValue({
            id: USER_ID,
            twoFactorEnabledAt: new Date()
        });
        const { response } = recordingResponse();

        await expect(
            cookieStrategy.issue(requestWith(), response, USER_ID, {
                amr: ['pwd'],
                provedAt: Date.now()
            })
        ).rejects.toBeInstanceOf(SecondFactorRequiredError);
        expect(sessions.insert).not.toHaveBeenCalled();
    });

    it('refuses a proof checked before the account ended its sessions, storing nothing', async () => {
        const provedAt = Date.now();
        users.findAuthenticatableById.mockResolvedValue({
            id: USER_ID,
            tokensValidAfter: new Date(provedAt + 1)
        });
        const { response } = recordingResponse();

        await expect(
            cookieStrategy.issue(requestWith(), response, USER_ID, { amr: ['pwd'], provedAt })
        ).rejects.toBeInstanceOf(StaleProofError);
        expect(sessions.insert).not.toHaveBeenCalled();
    });

    it('stamps `authTime` from when the proof began, in seconds', async () => {
        const provedAt = 1_700_000_000_999;
        users.findAuthenticatableById.mockResolvedValue({
            id: USER_ID,
            tokensValidAfter: new Date(provedAt)
        });

        await cookieStrategy.issue(requestWith(), recordingResponse().response, USER_ID, {
            amr: ['pwd'],
            provedAt
        });

        expect(insertedRow().authTime).toBe(1_700_000_000);
    });

    it('stores only the digest of the id, as a `cookie` row carrying its proof', async () => {
        const { response } = recordingResponse();

        const issued = await cookieStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now(),
            transport: 'bearer'
        });

        const row = insertedRow();
        expect(row).toMatchObject({ mode: 'cookie', amr: ['pwd'] });
        expect(row.tokenHash).toBe(hashToken(issued.sessionToken ?? ''));
        expect(JSON.stringify(row)).not.toContain(issued.sessionToken);
    });

    it('hands a bearer client the id in the body and sets no cookie', async () => {
        const { cookie, response } = recordingResponse();

        const issued = await cookieStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now(),
            transport: 'bearer'
        });

        expect(issued.sessionToken).toMatch(/^ses_[\w-]{43}$/);
        expect(cookie).not.toHaveBeenCalled();
    });

    it('hands a browser a browser-session cookie when nothing was ticked, with the short tier as its limit', async () => {
        const { cookie, response } = recordingResponse();
        const before = Date.now();

        const issued = await cookieStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now()
        });

        expect(issued).toEqual({});
        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBeUndefined();
        expect(cookieSet(cookie, 'isAuth')?.[2].maxAge).toBeUndefined();
        const row = insertedRow();
        expect(row.remember).toBeUndefined();
        expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
        expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3_600_000);
    });

    it('persists a remembered session’s cookie for exactly as long as its row lives', async () => {
        const { cookie, response } = recordingResponse();

        await cookieStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now(),
            remember: RefreshTokenExpiryTime.LONG
        });

        const row = insertedRow();
        expect(row.remember).toBe('long');
        const maxAge = cookieSet(cookie, '__Host-session')?.[2].maxAge ?? 0;
        expect(maxAge).toBeGreaterThan(2_592_000_000 - 5000);
        expect(maxAge).toBeLessThanOrEqual(2_592_000_000);
        expect(cookieSet(cookie, 'isAuth')?.[2].maxAge).toBe(maxAge);
    });

    it('names the device from the client that signed in, and leaves it off when it says nothing', async () => {
        const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

        await cookieStrategy.issue(
            requestWith({ userAgent: firefox }),
            recordingResponse().response,
            USER_ID,
            { amr: ['pwd'], provedAt: Date.now() }
        );
        const named = insertedRow();
        await cookieStrategy.issue(requestWith(), recordingResponse().response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now()
        });

        expect(named.device).toBe('Firefox on Linux');
        expect(insertedRow()).not.toHaveProperty('device');
    });

    it('starts a new family per sign-in', async () => {
        await cookieStrategy.issue(requestWith(), recordingResponse().response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now()
        });
        const first = insertedRow();
        await cookieStrategy.issue(requestWith(), recordingResponse().response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now()
        });

        expect(String(insertedRow().familyId)).not.toBe(String(first.familyId));
    });
});

describe('snapshot', () => {
    it('reads nothing for a request that names no session', async () => {
        await expect(cookieStrategy.snapshot(requestWith(), USER_ID)).resolves.toEqual({});
        expect(sessions.findByHash).not.toHaveBeenCalled();
    });

    it('carries the caller’s own row: tier, public id, sign-in, expiry and device', async () => {
        const row = liveRow({ remember: 'medium', device: 'Firefox on Linux' });
        sessions.findByHash.mockResolvedValue(row);

        await expect(
            cookieStrategy.snapshot(requestWith({ cookie: SOME_ID }), USER_ID)
        ).resolves.toEqual({
            remember: RefreshTokenExpiryTime.MEDIUM,
            familyId: row.familyId,
            startedAt: row.startedAt,
            expiresAt: row.expiresAt,
            device: 'Firefox on Linux'
        });
    });

    it('carries nothing from a row of the other mode, or of another account', async () => {
        sessions.findByHash.mockResolvedValueOnce(liveRow({ mode: 'jwt' }));
        sessions.findByHash.mockResolvedValueOnce(
            liveRow({ userId: new Types.ObjectId('507f1f77bcf86cd799439012') })
        );

        await expect(
            cookieStrategy.snapshot(requestWith({ cookie: SOME_ID }), USER_ID)
        ).resolves.toEqual({});
        await expect(
            cookieStrategy.snapshot(requestWith({ cookie: SOME_ID }), USER_ID)
        ).resolves.toEqual({});
    });
});

describe('reissue', () => {
    it('keeps the replaced session’s public id, sign-in and expiry, and retires its id', async () => {
        const kept = liveRow({ remember: 'long' });
        const { cookie, response } = recordingResponse();

        await cookieStrategy.reissue(requestWith({ cookie: SOME_ID }), response, USER_ID, {
            amr: ['pwd'],
            snapshot: {
                remember: RefreshTokenExpiryTime.LONG,
                familyId: kept.familyId,
                startedAt: kept.startedAt,
                expiresAt: kept.expiresAt
            }
        });

        expect(insertedRow()).toMatchObject({
            familyId: kept.familyId,
            startedAt: kept.startedAt,
            expiresAt: kept.expiresAt,
            remember: 'long'
        });
        expect(sessions.removeByHash).toHaveBeenCalledWith(hashToken(SOME_ID));
        // The cookie runs out with the session it continues, not a fresh tier.
        const maxAge = cookieSet(cookie, '__Host-session')?.[2].maxAge ?? 0;
        expect(maxAge).toBeLessThanOrEqual(kept.expiresAt.getTime() - Date.now() + 1000);
    });

    it('answers a bearer-authenticated caller in the body, as it signed in', async () => {
        const { cookie, response } = recordingResponse();

        const issued = await cookieStrategy.reissue(
            requestWith({ authorization: `Bearer ${SOME_ID}`, via: 'bearer' }),
            response,
            USER_ID,
            { amr: ['pwd'], snapshot: {} }
        );

        expect(issued.sessionToken).toMatch(/^ses_/);
        expect(issued.sessionToken).not.toBe(SOME_ID);
        expect(cookie).not.toHaveBeenCalled();
        expect(sessions.removeByHash).toHaveBeenCalledWith(hashToken(SOME_ID));
    });

    it('reads the caller’s own row when no snapshot was taken', async () => {
        const kept = liveRow();
        sessions.findByHash.mockResolvedValue(kept);

        await cookieStrategy.reissue(
            requestWith({ cookie: SOME_ID }),
            recordingResponse().response,
            USER_ID,
            {
                amr: ['pwd']
            }
        );

        expect(String(insertedRow().familyId)).toBe(String(kept.familyId));
    });

    it('still hands the successor back when the old id cannot be retired', async () => {
        sessions.removeByHash.mockRejectedValue(new Error('store down'));
        const { cookie, response } = recordingResponse();

        await cookieStrategy.reissue(requestWith({ cookie: SOME_ID }), response, USER_ID, {
            amr: ['pwd'],
            snapshot: {}
        });

        expect(cookieSet(cookie, '__Host-session')?.[1]).toMatch(/^ses_/);
    });
});

describe('remint', () => {
    it('hands a bearer client its replacement id, and sets no cookie', async () => {
        const { cookie, response } = recordingResponse();

        const issued = await cookieStrategy.remint(
            requestWith({ authorization: `Bearer ${SOME_ID}`, via: 'bearer' }),
            response,
            USER_ID,
            { amr: ['pwd', 'otp'], snapshot: {} }
        );

        expect(insertedRow().amr).toEqual(['pwd', 'otp']);
        expect(issued.sessionToken).toMatch(/^ses_/);
        expect(cookie).not.toHaveBeenCalled();
    });

    it('re-mints a browser’s cookie, claiming what it is told', async () => {
        const { cookie, response } = recordingResponse();

        await cookieStrategy.remint(
            requestWith({ cookie: SOME_ID, via: 'cookie' }),
            response,
            USER_ID,
            {
                amr: ['pwd', 'otp'],
                snapshot: {}
            }
        );

        expect(insertedRow().amr).toEqual(['pwd', 'otp']);
        expect(cookieSet(cookie, '__Host-session')?.[1]).toMatch(/^ses_/);
    });

    it('never fails the response: a failed re-mint degrades to "sign in again"', async () => {
        sessions.insert.mockRejectedValue(new Error('store down'));
        const { cookie, response } = recordingResponse();

        await expect(
            cookieStrategy.remint(requestWith({ cookie: SOME_ID }), response, USER_ID, {
                amr: ['pwd'],
                snapshot: {}
            })
        ).resolves.toEqual({});
        expect(cookie).not.toHaveBeenCalled();
    });
});

describe('watchCookie, the recheck of an open stream', () => {
    it('rechecks the session family, so a re-proof that replaced the row does not end the stream', async () => {
        const row = liveRow();
        sessions.findByHash.mockResolvedValue(row);
        proof.mockResolvedValue(SHOPPER);
        sessions.familyActivity.mockResolvedValue({ lastActiveAt: new Date() });

        const watch = await cookieStrategy.watchCookie(SOME_ID);
        // The row the stream connected with is gone (a re-proof replaced it); its family lives on.
        sessions.findByHash.mockResolvedValue(undefined);
        const recheck = 'ok' in watch ? watch.ok.recheck : undefined;

        await expect(recheck?.()).resolves.toEqual({ ok: SHOPPER });
        expect(sessions.familyActivity).toHaveBeenCalledWith(
            USER_ID,
            String(row.familyId),
            'cookie',
            expect.any(Date)
        );
    });

    it('rechecks to a miss once the family is gone', async () => {
        sessions.findByHash.mockResolvedValue(liveRow());
        proof.mockResolvedValue(SHOPPER);
        sessions.familyActivity.mockResolvedValue(undefined);

        const watch = await cookieStrategy.watchCookie(SOME_ID);
        const recheck = 'ok' in watch ? watch.ok.recheck : undefined;

        await expect(recheck?.()).resolves.toEqual({ miss: 'revoked' });
    });

    it.each([
        ['an id of the wrong shape', 'not-a-session', undefined, 'malformed'],
        ['an unknown id', SOME_ID, undefined, 'revoked'],
        ['an expired row', SOME_ID, { expiresAt: new Date(Date.now() - 1000) }, 'expired']
    ])('answers a miss for %s', async (_name, id, overrides, miss) => {
        sessions.findByHash.mockResolvedValue(overrides ? liveRow(overrides) : undefined);

        await expect(cookieStrategy.watchCookie(id)).resolves.toEqual({ miss });
    });
});

describe('list', () => {
    it('lists the `cookie` rows only, marking the one the credential names', async () => {
        const own = liveRow();
        sessions.listLive.mockResolvedValue([own]);

        const listed = await cookieStrategy.list(USER_ID, SOME_ID);

        expect(listed).toEqual([
            expect.objectContaining({ id: String(own.familyId), current: true })
        ]);
    });
});
