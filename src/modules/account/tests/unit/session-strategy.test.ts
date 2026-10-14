/**
 * @module
 * The seam between the two modes: `activeStrategy` (`../../session/strategy.ts`) picks the adapter
 * per call from `NODE_SESSION_MODE`, and the kernel's resolver (`../../session/resolver.ts`) asks
 * it — never a frozen copy — whether a cookie authenticates ordinary routes. The mint guard
 * (`../../session/mint-guard.ts`) both adapters call from `issue` is here too.
 */

import { setEnvironment } from '@tests/environment';
import { activeStrategy } from '@modules/account/session/strategy';
import { accountAuthResolver } from '@modules/account/session/resolver';
import { cookieStrategy } from '@modules/account/session/cookie-strategy';
import { jwtStrategy } from '@modules/account/session/jwt-strategy';
import { assertSecondFactor, SecondFactorRequiredError } from '@modules/account/session/mint-guard';

describe('activeStrategy', () => {
    it('is the `jwt` adapter on a deployment that names no mode', () => {
        expect(activeStrategy()).toBe(jwtStrategy);
    });

    it.each([
        ['jwt', jwtStrategy],
        ['cookie', cookieStrategy]
    ] as const)('is the adapter its mode names: %s', (mode, adapter) => {
        setEnvironment({ NODE_SESSION_MODE: mode });

        expect(activeStrategy()).toBe(adapter);
        expect(activeStrategy().mode).toBe(mode);
    });

    it('follows a mode changed after import, rather than freezing the first one', () => {
        setEnvironment({ NODE_SESSION_MODE: 'cookie' });
        const first = activeStrategy();
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });

        expect([first, activeStrategy()]).toEqual([cookieStrategy, jwtStrategy]);
    });
});

describe('accountAuthResolver', () => {
    it.each([
        ['jwt', false],
        ['cookie', true]
    ] as const)('in %s mode, lets a cookie authenticate ordinary routes: %s', (mode, expected) => {
        setEnvironment({ NODE_SESSION_MODE: mode });

        expect(accountAuthResolver.cookieAuthenticates()).toBe(expected);
    });

    it('turns a cookie-mode bearer that is not a session id away without a lookup', async () => {
        setEnvironment({ NODE_SESSION_MODE: 'cookie' });

        const jwtShaped = 'eyJhbGciOiJIUzI1NiJ9.e30.x';

        await expect(accountAuthResolver.fromBearer(jwtShaped)).resolves.toEqual({
            miss: 'malformed'
        });
        await expect(accountAuthResolver.fromCookie('not-a-session')).resolves.toEqual({
            miss: 'malformed'
        });
    });
});

describe('assertSecondFactor', () => {
    const armed = { id: 'u1', twoFactorEnabledAt: new Date() };

    it('refuses an armed account whose proof carries no second factor, naming the account', () => {
        expect(() => {
            assertSecondFactor(armed, ['pwd']);
        }).toThrow(SecondFactorRequiredError);
        expect(() => {
            assertSecondFactor(armed, ['pwd']);
        }).toThrow(expect.objectContaining({ userId: 'u1', name: 'SecondFactorRequiredError' }));
    });

    it('lets an armed account through once the proof carries the factor', () => {
        expect(() => {
            assertSecondFactor(armed, ['pwd', 'otp']);
        }).not.toThrow();
    });

    it('asks nothing of an account with no factor armed', () => {
        expect(() => {
            assertSecondFactor({ id: 'u2' }, ['pwd']);
        }).not.toThrow();
    });
});
