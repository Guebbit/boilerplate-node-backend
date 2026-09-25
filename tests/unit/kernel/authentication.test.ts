/**
 * `resolveAccessToken`/`resolveRefreshToken` — `src/kernel/authentication.ts`, the one branch
 * `tests/unit/kernel/authorizations.test.ts` cannot reach: that file registers a resolver at
 * module load, so this is a separate file specifically to keep `resolver` unset — Jest gives each
 * test file its own module registry, so importing `@kernel/authentication` here without calling
 * `registerAuthResolver` first is what exercises the "no `account` module in this build" branch.
 */

import { resolveAccessToken, resolveRefreshToken } from '@kernel/authentication';
import { isInfrastructureError } from '@infrastructure/http/errors';

describe('resolveAccessToken / resolveRefreshToken with no resolver registered', () => {
    it('rejects the way a bad token does — never with an outage the guards would answer 503 for', async () => {
        const rejection: unknown = await resolveAccessToken('any.token.here').catch(
            (error: unknown) => error
        );

        expect(rejection).toBeInstanceOf(Error);
        expect(isInfrastructureError(rejection)).toBe(false);
        await expect(resolveRefreshToken('any.token.here')).rejects.toThrow();
    });
});
