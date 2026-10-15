/**
 * @module
 * `jwt` mode's adapter (`../../session/jwt-strategy.ts`) at the unit level: the wiring between the
 * strategy port and the token layer. Which mint a login uses versus a re-mint, what lands in which
 * cookie, how a token refusal becomes a resolver miss while an outage stays a rejection. The token
 * layer itself is `./session-jwt.test.ts`'s and is REPLACED here.
 */

import { Types } from 'mongoose';
import { asStub } from '@tests/stub';
import { setEnvironment } from '@tests/environment';

jest.mock('@modules/account/session/jwt', () => {
    const actual = jest.requireActual<typeof import('@modules/account/session/jwt')>(
        '@modules/account/session/jwt'
    );
    return {
        __esModule: true,
        TokenRejection: actual.TokenRejection,
        startSession: jest.fn(),
        continueSession: jest.fn(),
        createAccessToken: jest.fn(),
        rememberOfRefreshToken: jest.fn(),
        verifyAccessToken: jest.fn(),
        verifyRefreshToken: jest.fn(),
        verifyRefreshWithRow: jest.fn()
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
            removeByHash: jest.fn(),
            removeFamilyByHash: jest.fn(),
            removeFamilyExcept: jest.fn(),
            findByHash: jest.fn(),
            familyIsLive: jest.fn(),
            listLive: jest.fn()
        }
    };
});

jest.mock('@modules/account/session/auth-context', () => ({
    __esModule: true,
    resolveProof: jest.fn()
}));

import { jwtStrategy } from '@modules/account/session/jwt-strategy';
import * as jwt from '@modules/account/session/jwt';
import { resolveProof } from '@modules/account/session/auth-context';
import { sessionRepository } from '@modules/account/repository';
import { RefreshTokenExpiryTime } from '@modules/account/session/config';
import { hashToken } from '@infrastructure/security/hash-token';
import { cookieSet, recordingResponse, requestWith } from '../strategy-doubles';

/** The account every case signs in. */
const USER_ID = '507f1f77bcf86cd799439011';

/** The session family the access token names. */
const FAMILY_ID = '507f1f77bcf86cd799439022';

/** The token-layer doubles. */
const tokens = asStub<{
    startSession: jest.Mock;
    continueSession: jest.Mock;
    createAccessToken: jest.Mock;
    rememberOfRefreshToken: jest.Mock;
    verifyAccessToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
    verifyRefreshWithRow: jest.Mock;
}>(jwt);

/** The store doubles. */
const sessions = asStub<{
    removeByHash: jest.Mock;
    removeFamilyByHash: jest.Mock;
    removeFamilyExcept: jest.Mock;
    findByHash: jest.Mock;
    familyIsLive: jest.Mock;
    listLive: jest.Mock;
}>(sessionRepository);

/** The proof resolver double. */
const proof = asStub<jest.Mock>(resolveProof);

beforeEach(() => {
    jest.resetAllMocks();
    setEnvironment({ NODE_SESSION_TIME_MEDIUM: '86400' });
    tokens.startSession.mockResolvedValue('refresh-from-login');
    tokens.continueSession.mockResolvedValue('refresh-from-remint');
    tokens.createAccessToken.mockResolvedValue('access-token');
    tokens.rememberOfRefreshToken.mockResolvedValue(undefined);
    sessions.removeByHash.mockResolvedValue(1);
    sessions.removeFamilyExcept.mockResolvedValue(0);
    sessions.findByHash.mockResolvedValue(undefined);
});

describe('issue', () => {
    it('mints through the guarded login door, sets the refresh cookie and answers the access token', async () => {
        const { cookie, response } = recordingResponse();

        const issued = await jwtStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
            provedAt: 1_700_000_000_000
        });

        expect(tokens.startSession).toHaveBeenCalledWith(
            USER_ID,
            ['pwd'],
            undefined,
            1_700_000_000_000
        );
        expect(tokens.continueSession).not.toHaveBeenCalled();
        expect(tokens.createAccessToken).toHaveBeenCalledWith('refresh-from-login');
        expect(issued).toEqual({ token: 'access-token' });
        expect(cookieSet(cookie, '__Host-session')?.[1]).toBe('refresh-from-login');
        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBeUndefined();
        expect(cookieSet(cookie, 'isAuth')?.[2].maxAge).toBeUndefined();
    });

    it('persists both cookies for the ticked tier', async () => {
        const { cookie, response } = recordingResponse();

        await jwtStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now(),
            remember: RefreshTokenExpiryTime.MEDIUM
        });

        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBe(86_400_000);
        expect(cookieSet(cookie, 'isAuth')?.[2].maxAge).toBe(86_400_000);
    });

    it('ignores the bearer transport: there is no session id to hand back', async () => {
        const { cookie, response } = recordingResponse();

        const issued = await jwtStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
            provedAt: Date.now(),
            transport: 'bearer'
        });

        expect(issued).toEqual({ token: 'access-token' });
        expect(cookieSet(cookie, '__Host-session')).toBeDefined();
    });
});

describe('reissue', () => {
    it('re-mints unguarded, keeping the tier the presented refresh cookie carries, and retires it', async () => {
        tokens.rememberOfRefreshToken.mockResolvedValue(RefreshTokenExpiryTime.MEDIUM);
        const { cookie, response } = recordingResponse();

        const issued = await jwtStrategy.reissue(
            requestWith({ cookie: 'old-refresh' }),
            response,
            USER_ID,
            {
                amr: ['pwd', 'otp']
            }
        );

        expect(tokens.rememberOfRefreshToken).toHaveBeenCalledWith('old-refresh', USER_ID);
        expect(tokens.continueSession).toHaveBeenCalledWith(USER_ID, ['pwd', 'otp'], 'medium', {
            remember: 'medium'
        });
        expect(tokens.startSession).not.toHaveBeenCalled();
        expect(sessions.removeByHash).toHaveBeenCalledWith(hashToken('old-refresh'));
        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBe(86_400_000);
        expect(issued).toEqual({ token: 'access-token' });
    });

    it('continues the presented session: same family and expiry, then drops the family’s other rows', async () => {
        const familyId = new Types.ObjectId();
        const expiresAt = new Date(Date.now() + 3_600_000);
        sessions.findByHash.mockResolvedValue({
            mode: 'jwt',
            userId: new Types.ObjectId(USER_ID),
            familyId,
            startedAt: new Date(),
            expiresAt
        });
        tokens.continueSession.mockResolvedValue('successor');

        await jwtStrategy.reissue(
            requestWith({ cookie: 'old-refresh' }),
            recordingResponse().response,
            USER_ID,
            { amr: ['pwd'] }
        );

        expect(tokens.continueSession).toHaveBeenCalledWith(
            USER_ID,
            ['pwd'],
            undefined,
            expect.objectContaining({ familyId, expiresAt })
        );
        expect(sessions.removeFamilyExcept).toHaveBeenCalledWith(
            USER_ID,
            String(familyId),
            hashToken('successor')
        );
        expect(sessions.removeByHash).not.toHaveBeenCalled();
    });

    it('takes the tier from a snapshot when the change already deleted the row', async () => {
        await jwtStrategy.reissue(requestWith(), recordingResponse().response, USER_ID, {
            amr: ['pwd'],
            snapshot: { remember: RefreshTokenExpiryTime.LONG }
        });

        expect(tokens.rememberOfRefreshToken).not.toHaveBeenCalled();
        expect(tokens.continueSession).toHaveBeenCalledWith(USER_ID, ['pwd'], 'long', {
            remember: 'long'
        });
        expect(sessions.removeByHash).not.toHaveBeenCalled();
    });

    it('still answers the new session when the old one cannot be retired', async () => {
        sessions.removeByHash.mockRejectedValue(new Error('store down'));

        await expect(
            jwtStrategy.reissue(
                requestWith({ cookie: 'old-refresh' }),
                recordingResponse().response,
                USER_ID,
                {
                    amr: ['pwd']
                }
            )
        ).resolves.toEqual({ token: 'access-token' });
    });
});

describe('remint', () => {
    it('sets a fresh refresh cookie from the unguarded door, and answers no token', async () => {
        const { cookie, response } = recordingResponse();

        await expect(
            jwtStrategy.remint(requestWith(), response, USER_ID, {
                amr: ['pwd', 'otp'],
                snapshot: { remember: RefreshTokenExpiryTime.MEDIUM }
            })
        ).resolves.toEqual({});

        expect(tokens.continueSession).toHaveBeenCalledWith(USER_ID, ['pwd', 'otp'], 'medium', {
            remember: 'medium'
        });
        expect(cookieSet(cookie, '__Host-session')?.[1]).toBe('refresh-from-remint');
        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBe(86_400_000);
        expect(tokens.createAccessToken).not.toHaveBeenCalled();
    });

    it('never fails the response: a failed re-mint degrades to "sign in again"', async () => {
        tokens.continueSession.mockRejectedValue(new Error('store down'));
        const { cookie, response } = recordingResponse();

        await expect(
            jwtStrategy.remint(requestWith(), response, USER_ID, { amr: ['pwd'], snapshot: {} })
        ).resolves.toEqual({});
        expect(cookie).not.toHaveBeenCalled();
    });
});

describe.each([
    ['resolveBearer', 'verifyAccessToken'],
    ['resolveCookie', 'verifyRefreshToken']
] as const)('%s', (method, verifier) => {
    it(`verifies with ${verifier} and hands the claims' proof to the shared resolver`, async () => {
        tokens[verifier].mockResolvedValue({
            sub: USER_ID,
            auth_time: 1_700_000_000,
            amr: ['pwd'],
            sid: FAMILY_ID
        });
        proof.mockResolvedValue({ id: USER_ID });
        sessions.familyIsLive.mockResolvedValue(true);

        await expect(jwtStrategy[method]('a-token')).resolves.toEqual({ ok: { id: USER_ID } });
        expect(tokens[verifier]).toHaveBeenCalledWith('a-token');
        expect(proof).toHaveBeenCalledWith(USER_ID, { authTime: 1_700_000_000, amr: ['pwd'] });
    });

    it('answers a refused token as a miss, naming why', async () => {
        tokens[verifier].mockRejectedValue(new jwt.TokenRejection('expired', 'lapsed'));

        await expect(jwtStrategy[method]('a-token')).resolves.toEqual({ miss: 'expired' });
        expect(proof).not.toHaveBeenCalled();
    });

    it('keeps an outage a rejection, so the guard can tell "bad token" from "we are down"', async () => {
        tokens[verifier].mockRejectedValue(new Error('store down'));

        await expect(jwtStrategy[method]('a-token')).rejects.toThrow('store down');
    });
});

describe('resolveBearer and the session it names', () => {
    beforeEach(() => {
        tokens.verifyAccessToken.mockResolvedValue({
            sub: USER_ID,
            auth_time: 1_700_000_000,
            amr: ['pwd'],
            sid: FAMILY_ID
        });
        proof.mockResolvedValue({ id: USER_ID });
    });

    it('asks whether the token’s own session family is still live', async () => {
        sessions.familyIsLive.mockResolvedValue(true);

        await jwtStrategy.resolveBearer('a-token');

        expect(sessions.familyIsLive).toHaveBeenCalledWith(
            USER_ID,
            FAMILY_ID,
            'jwt',
            expect.any(Date)
        );
    });

    it('answers a miss for a token whose session was revoked, though the token itself verifies', async () => {
        sessions.familyIsLive.mockResolvedValue(false);

        await expect(jwtStrategy.resolveBearer('a-token')).resolves.toEqual({ miss: 'revoked' });
    });
});

describe('watchCookie, the recheck of an open stream', () => {
    const claims = { sub: USER_ID, auth_time: 1_700_000_000, amr: ['pwd'] };

    beforeEach(() => {
        tokens.verifyRefreshWithRow.mockResolvedValue({
            data: claims,
            row: { familyId: FAMILY_ID }
        });
        proof.mockResolvedValue({ id: USER_ID });
    });

    it('answers who the cookie names at connect', async () => {
        const watch = await jwtStrategy.watchCookie('a-token');

        expect(watch).toEqual({ ok: { context: { id: USER_ID }, recheck: expect.any(Function) } });
    });

    it('rechecks the family, not the token, so a later rotation does not end the stream', async () => {
        sessions.familyIsLive.mockResolvedValue(true);
        const watch = await jwtStrategy.watchCookie('a-token');
        // The connect-time token is superseded by now: verifying it again would be refused.
        tokens.verifyRefreshWithRow.mockRejectedValue(new jwt.TokenRejection('revoked', 'gone'));

        const recheck = 'ok' in watch ? watch.ok.recheck : undefined;

        await expect(recheck?.()).resolves.toEqual({ ok: { id: USER_ID } });
        expect(sessions.familyIsLive).toHaveBeenCalledWith(
            USER_ID,
            FAMILY_ID,
            'jwt',
            expect.any(Date)
        );
    });

    it('rechecks to a miss once the family is revoked', async () => {
        sessions.familyIsLive.mockResolvedValue(false);
        const watch = await jwtStrategy.watchCookie('a-token');

        const recheck = 'ok' in watch ? watch.ok.recheck : undefined;

        await expect(recheck?.()).resolves.toEqual({ miss: 'revoked' });
    });

    it('answers a refused token as a miss, naming why', async () => {
        tokens.verifyRefreshWithRow.mockRejectedValue(new jwt.TokenRejection('expired', 'lapsed'));

        await expect(jwtStrategy.watchCookie('a-token')).resolves.toEqual({ miss: 'expired' });
    });
});

describe('credentialOf', () => {
    it('is the refresh cookie, whatever bearer rides beside it', () => {
        const request = requestWith({
            cookie: 'the-refresh',
            authorization: 'Bearer ses_whatever'
        });

        expect(jwtStrategy.credentialOf(request)).toBe('the-refresh');
        expect(
            jwtStrategy.credentialOf(requestWith({ authorization: 'Bearer x' }))
        ).toBeUndefined();
    });
});
