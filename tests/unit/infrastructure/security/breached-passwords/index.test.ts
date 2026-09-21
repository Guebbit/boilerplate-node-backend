/**
 * @module
 * Breached-password checks — rung 1 (the bundled list), rung 2 (HIBP, `fetch` faked throughout,
 * same as `oauth-github.test.ts` / `oauth-google.test.ts`), and `assertPasswordNotBreached`
 * combining both.
 */

import { createHash } from 'node:crypto';
import {
    isInBundledBreachList,
    checkHibpRange,
    checkPasswordBreach,
    assertPasswordNotBreached
} from '@infrastructure/security/breached-passwords';

/** In the committed list — see `scripts/ops/refresh-breached-passwords.ts`. */
const IN_LIST_PASSWORD = 'Password1!';

/** Composition-valid but not in the (filtered, ~20k-entry) bundled list. */
const NOT_IN_LIST_PASSWORD = 'Xk9$mQzR7pL2!';

/** One mocked `fetch` text response. `ok = false` is how a case makes HIBP answer a non-200. */
const textResponse = (body: string, ok = true): Response =>
    ({ ok, status: ok ? 200 : 503, text: () => Promise.resolve(body) }) as Response;

/** The saved switches, restored after every case — the same pattern `antibot-providers` uses. */
const original = {
    list: process.env.NODE_PASSWORD_BREACH_LIST,
    hibp: process.env.NODE_PASSWORD_BREACH_HIBP
};

afterEach(() => {
    jest.restoreAllMocks();
    if (original.list === undefined) delete process.env.NODE_PASSWORD_BREACH_LIST;
    else process.env.NODE_PASSWORD_BREACH_LIST = original.list;
    if (original.hibp === undefined) delete process.env.NODE_PASSWORD_BREACH_HIBP;
    else process.env.NODE_PASSWORD_BREACH_HIBP = original.hibp;
});

describe('isInBundledBreachList', () => {
    it('matches a password known to be in the committed list', () => {
        expect(isInBundledBreachList(IN_LIST_PASSWORD)).toBe(true);
    });

    it('misses a composition-valid password absent from the list', () => {
        expect(isInBundledBreachList(NOT_IN_LIST_PASSWORD)).toBe(false);
    });
});

describe('checkHibpRange', () => {
    it('sends only the first 5 hex characters of the SHA-1 hash, never the full one', async () => {
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(textResponse(''));

        await checkHibpRange(NOT_IN_LIST_PASSWORD);

        const hash = createHash('sha1').update(NOT_IN_LIST_PASSWORD).digest('hex').toUpperCase();
        const [url] = fetchSpy.mock.calls[0] as [string];
        expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
        expect(url).not.toContain(hash.slice(5));
    });

    it('rejects when the response contains the matching suffix', async () => {
        const hash = createHash('sha1').update(NOT_IN_LIST_PASSWORD).digest('hex').toUpperCase();
        const suffix = hash.slice(5);
        jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            textResponse(`${suffix}:584516\r\nSOMEOTHERSUFFIX0000000000000000000:1`)
        );

        await expect(checkHibpRange(NOT_IN_LIST_PASSWORD)).resolves.toEqual({
            breached: true,
            count: 584_516
        });
    });

    it('accepts (fails open) when fetch rejects outright', async () => {
        jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));

        await expect(checkHibpRange(NOT_IN_LIST_PASSWORD)).resolves.toEqual({ breached: false });
    });

    it('accepts (fails open) on a non-200 response', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(textResponse('', false));

        await expect(checkHibpRange(NOT_IN_LIST_PASSWORD)).resolves.toEqual({ breached: false });
    });
});

describe('checkPasswordBreach', () => {
    it('short-circuits on rung 1 without calling fetch', async () => {
        process.env.NODE_PASSWORD_BREACH_LIST = 'on';
        process.env.NODE_PASSWORD_BREACH_HIBP = 'on';
        const fetchSpy = jest.spyOn(globalThis, 'fetch');

        await expect(checkPasswordBreach(IN_LIST_PASSWORD)).resolves.toEqual({ breached: true });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips rung 2 entirely when it is disabled', async () => {
        process.env.NODE_PASSWORD_BREACH_LIST = 'on';
        process.env.NODE_PASSWORD_BREACH_HIBP = 'off';
        const fetchSpy = jest.spyOn(globalThis, 'fetch');

        await expect(checkPasswordBreach(NOT_IN_LIST_PASSWORD)).resolves.toEqual({
            breached: false
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls through to rung 2 when rung 1 misses and HIBP is enabled', async () => {
        process.env.NODE_PASSWORD_BREACH_LIST = 'on';
        process.env.NODE_PASSWORD_BREACH_HIBP = 'on';
        jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(textResponse(''));

        await expect(checkPasswordBreach(NOT_IN_LIST_PASSWORD)).resolves.toEqual({
            breached: false
        });
    });
});

describe('assertPasswordNotBreached', () => {
    it('returns a validation error, never saying which rung caught it', async () => {
        process.env.NODE_PASSWORD_BREACH_LIST = 'on';

        await expect(assertPasswordNotBreached(IN_LIST_PASSWORD)).resolves.toEqual([
            {
                code: 'VALIDATION_ERROR',
                message: expect.any(String) as string,
                details: { field: 'password' }
            }
        ]);
    });

    it('returns no errors for an acceptable password', async () => {
        process.env.NODE_PASSWORD_BREACH_LIST = 'on';
        process.env.NODE_PASSWORD_BREACH_HIBP = 'off';

        await expect(assertPasswordNotBreached(NOT_IN_LIST_PASSWORD)).resolves.toEqual([]);
    });
});
