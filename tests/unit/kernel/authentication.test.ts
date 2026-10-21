/**
 * `resolveBearer`/`resolveCookie` — `src/kernel/authentication.ts`, the one branch
 * `tests/unit/kernel/authorizations.test.ts` cannot reach: that file registers a resolver at
 * module load, so this is a separate file specifically to keep `resolver` unset — Jest gives each
 * test file its own module registry, so importing `@kernel/authentication` here without calling
 * `registerAuthResolver` first is what exercises the "no `account` module in this build" branch.
 */

import { resolveBearer, resolveCookie, cookieAuthenticatesRequests } from '@kernel/authentication';

describe('resolveBearer / resolveCookie with no resolver registered', () => {
    it('answers a malformed miss — a guest, never an error and never an outage', async () => {
        await expect(resolveBearer('any.token.here')).resolves.toEqual({ miss: 'malformed' });
        await expect(resolveCookie('any.token.here')).resolves.toEqual({ miss: 'malformed' });
    });

    it('says the cookie authenticates nothing, rather than throwing', () => {
        // A build with no `account` has no sessions at all; `getAuth` asks this on every cookie-
        // carrying request, so it must be a plain answer.
        expect(cookieAuthenticatesRequests()).toBe(false);
    });
});
