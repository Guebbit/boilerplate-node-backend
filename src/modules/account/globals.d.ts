/**
 * @module
 * This module's own `Request` augmentation. Infrastructure's `src/globals.d.ts` must not name a
 * module, so a field only `account` sets and reads lives here
 * instead, merged onto the same interface by declaration merging.
 *
 * The empty `export {}` is required, not decorative: with no top-level import or export this
 * file is a global SCRIPT, and `declare module` in a script redeclares the named module from
 * scratch instead of augmenting it — which silently erases every property Express's own types
 * declare on `Request`/`Response`/`Express` everywhere in the program.
 *
 * @see docs/understand/layers.md#layer-stack-inside-one-module
 */
export {};

declare module 'express-serve-static-core' {
    interface Request {
        /**
         * Whether an OAuth callback failed by redirecting (a 302 carrying `?error=`) — set by the
         * callback controller, read by `rate-limits.ts`'s credential budgets so a failure that
         * answers below 400 still spends them.
         */
        credentialAttemptFailed?: boolean;
    }
}
