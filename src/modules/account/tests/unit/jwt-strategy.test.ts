/**
 * @module
 * `jwt` mode's adapter (`../../session/jwt-strategy.ts`) at the unit level: the wiring between the
 * strategy port and the token layer. Which mint a login uses versus a re-mint, what lands in which
 * cookie, how a token refusal becomes a resolver miss while an outage stays a rejection. The token
 * layer itself is `./session-jwt.test.ts`'s and is REPLACED here.
 */

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
        verifyRefreshToken: jest.fn()
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

/** The token-layer doubles. */
const tokens = asStub<{
    startSession: jest.Mock;
    continueSession: jest.Mock;
    createAccessToken: jest.Mock;
    rememberOfRefreshToken: jest.Mock;
    verifyAccessToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
}>(jwt);

/** The store doubles. */
const sessions = asStub<{ removeByHash: jest.Mock; listLive: jest.Mock }>(sessionRepository);

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
});

describe('issue', () => {
    it('mints through the guarded login door, sets the refresh cookie and answers the access token', async () => {
        const { cookie, response } = recordingResponse();

        const issued = await jwtStrategy.issue(requestWith(), response, USER_ID, { amr: ['pwd'] });

        expect(tokens.startSession).toHaveBeenCalledWith(USER_ID, ['pwd'], undefined);
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
            remember: RefreshTokenExpiryTime.MEDIUM
        });

        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBe(86_400_000);
        expect(cookieSet(cookie, 'isAuth')?.[2].maxAge).toBe(86_400_000);
    });

    it('ignores the bearer transport: there is no session id to hand back', async () => {
        const { cookie, response } = recordingResponse();

        const issued = await jwtStrategy.issue(requestWith(), response, USER_ID, {
            amr: ['pwd'],
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
        expect(tokens.continueSession).toHaveBeenCalledWith(USER_ID, ['pwd', 'otp'], 'medium');
        expect(tokens.startSession).not.toHaveBeenCalled();
        expect(sessions.removeByHash).toHaveBeenCalledWith(hashToken('old-refresh'));
        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBe(86_400_000);
        expect(issued).toEqual({ token: 'access-token' });
    });

    it('takes the tier from a snapshot when the change already deleted the row', async () => {
        await jwtStrategy.reissue(requestWith(), recordingResponse().response, USER_ID, {
            amr: ['pwd'],
            snapshot: { remember: RefreshTokenExpiryTime.LONG }
        });

        expect(tokens.rememberOfRefreshToken).not.toHaveBeenCalled();
        expect(tokens.continueSession).toHaveBeenCalledWith(USER_ID, ['pwd'], 'long');
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
        ).resolves.toBeUndefined();

        expect(tokens.continueSession).toHaveBeenCalledWith(USER_ID, ['pwd', 'otp'], 'medium');
        expect(cookieSet(cookie, '__Host-session')?.[1]).toBe('refresh-from-remint');
        expect(cookieSet(cookie, '__Host-session')?.[2].maxAge).toBe(86_400_000);
        expect(tokens.createAccessToken).not.toHaveBeenCalled();
    });

    it('never fails the response: a failed re-mint degrades to "sign in again"', async () => {
        tokens.continueSession.mockRejectedValue(new Error('store down'));
        const { cookie, response } = recordingResponse();

        await expect(
            jwtStrategy.remint(requestWith(), response, USER_ID, { amr: ['pwd'], snapshot: {} })
        ).resolves.toBeUndefined();
        expect(cookie).not.toHaveBeenCalled();
    });
});

describe.each([
    ['resolveBearer', 'verifyAccessToken'],
    ['resolveCookie', 'verifyRefreshToken']
] as const)('%s', (method, verifier) => {
    it(`verifies with ${verifier} and hands the claims' proof to the shared resolver`, async () => {
        tokens[verifier].mockResolvedValue({ id: USER_ID, auth_time: 1_700_000_000, amr: ['pwd'] });
        proof.mockResolvedValue({ id: USER_ID });

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

describe('list', () => {
    it('lists the `jwt` rows only', async () => {
        sessions.listLive.mockResolvedValue([]);

        await jwtStrategy.list(USER_ID, undefined);

        expect(sessions.listLive).toHaveBeenCalledWith(USER_ID, 'jwt', expect.any(Date));
    });
});
