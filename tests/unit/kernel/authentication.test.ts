/**
 * `resolveAccessToken`/`resolveRefreshToken` — `src/kernel/authentication.ts`, the one branch
 * `tests/unit/kernel/authorizations.test.ts` cannot reach: that file registers a resolver at
 * module load, so this is a separate file specifically to keep `resolver` unset — Jest gives each
 * test file its own module registry, so importing `@kernel/authentication` here without calling
 * `registerAuthResolver` first is what exercises the "no `account` module in this build" branch.
 *
 * D16's own trap: this used to THROW, which `getAuth`'s catch-all folded into "anonymous" by
 * accident. Answering 503 for a genuine DB outage meant that accident had to be closed first, or
 * a build with no `account` module would 503 every bearer token forever instead of ignoring it.
 */

import { resolveAccessToken, resolveRefreshToken } from '@kernel/authentication';

describe('resolveAccessToken / resolveRefreshToken with no resolver registered', () => {
    it('resolves undefined rather than rejecting', async () => {
        await expect(resolveAccessToken('any.token.here')).resolves.toBeUndefined();
        await expect(resolveRefreshToken('any.token.here')).resolves.toBeUndefined();
    });
});
