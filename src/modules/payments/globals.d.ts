/**
 * @module
 * This module's own `Request` augmentation. Infrastructure's `src/globals.d.ts` must not name a
 * module (see `docs/theory/layers.md`), so a field only `payments` sets and reads lives here
 * instead, merged onto the same interface by declaration merging.
 *
 * The empty `export {}` is required, not decorative: with no top-level import or export this
 * file is a global SCRIPT, and `declare module` in a script redeclares the named module from
 * scratch instead of augmenting it — which silently erases every property Express's own types
 * declare on `Request`/`Response`/`Express` everywhere in the program.
 */
// eslint-disable-next-line unicorn/require-module-specifiers -- the module marker itself IS the fix (see the docblock above), not an import left over by accident
export {};

declare module 'express-serve-static-core' {
    interface Request {
        /**
         * Whether `POST /payments/:id/confirm` settled as `PAYMENT_DECLINED` — set by the confirm
         * controller, read by `rate-limits.ts`'s decline-budget limiter
         * (`paymentConfirmDeclineLimiter`) so it can tell a genuine decline apart from the route's
         * other 409, `PAYMENT_ORDER_NOT_PAYABLE` (a race, not a decline), which must not spend the
         * same budget.
         */
        paymentConfirmDeclined?: boolean;
    }
}
