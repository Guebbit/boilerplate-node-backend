/**
 * `resolveBearer`/`resolveCookie` — `src/kernel/authentication.ts`, the one branch
 * `tests/unit/kernel/authorizations.test.ts` cannot reach: that file registers a resolver at
 * module load, so this is a separate file specifically to keep `resolver` unset — Jest gives each
 * test file its own module registry, so importing `@kernel/authentication` here without calling
 * `registerAuthResolver` first is what exercises the "no `account` module in this build" branch.
 */

import { resolveBearer, resolveCookie, cookieAuthenticatesRequests } from '@kernel/authentication';
import { isInfrastructureError } from '@infrastructure/http/errors';

describe('resolveBearer / resolveCookie with no resolver registered', () => {
    it('rejects the way a bad token does — never with an outage the guards would answer 503 for', async () => {
        const rejection: unknown = await resolveBearer('any.token.here').catch(
            (error: unknown) => error
        );

        expect(rejection).toBeInstanceOf(Error);
        expect(isInfrastructureError(rejection)).toBe(false);
        await expect(resolveCookie('any.token.here')).rejects.toThrow();
    });

    it('says the cookie authenticates nothing, rather than throwing', () => {
        // A build with no `account` has no sessions at all; `getAuth` asks this on every cookie-
        // carrying request, so it must be a plain answer.
        expect(cookieAuthenticatesRequests()).toBe(false);
    });
});
