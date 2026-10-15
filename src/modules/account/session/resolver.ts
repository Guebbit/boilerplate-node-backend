/**
 * @module
 * The kernel's `AuthResolver`, answered by whichever session strategy the deployment runs — turns
 * a presented credential into the `AuthContext` a guard checks. `module.ts` installs
 * {@link accountAuthResolver} via `registerAuthResolver` in its `onRegistered` hook; what a
 * credential means lives in the strategies, and what a proof means (`./auth-context`) is shared.
 *
 * See: docs/modules/account-sessions.md
 */

import type { AuthResolver } from '@kernel/authentication';
import { destroyLoggedCookie, destroySessionCookie } from './cookies';
import { activeStrategy } from './strategy';

/**
 * This module's answer to the kernel's "who is making this request" port — see `module.ts`'s own
 * comment for why it is registered in `onRegistered`, not at import time.
 *
 * Two failures that are not the same failure: a **bad credential** resolves a miss, a **valid
 * credential whose user is gone** resolves `undefined`, and an outage rejects. The guard answers
 * the first two with the same `401`, so nothing tells a caller whether an account exists; the
 * distinction stays in the miss reason the guard counts and audits.
 */
export const accountAuthResolver: AuthResolver = {
    fromBearer: (token, options) => activeStrategy().resolveBearer(token, options),
    fromCookie: (token, options) => activeStrategy().resolveCookie(token, options),
    watchCookie: (token) => activeStrategy().watchCookie(token),
    cookieAuthenticates: () => activeStrategy().cookieAuthenticates,
    clearDeadCookie: (response) => {
        destroySessionCookie(response);
        destroyLoggedCookie(response);
    }
};
