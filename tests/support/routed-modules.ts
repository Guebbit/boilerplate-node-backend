/**
 * Every module that mounts a router, by name.
 *
 * A separate file from `@tests/routes` on purpose, not beside its other helpers: that file's
 * mock factories (`cacheMock` and friends) are read back with `jest.requireActual('@tests/routes')`
 * from inside a `jest.mock(...)` factory, before those middlewares are mocked. Importing the real
 * routers there would drag the real `rate-limit`/`cache`/`upload`/`route-flag` middlewares into
 * that same `requireActual` — a module still mid-evaluation while its own mock is being defined —
 * and each factory comes back `undefined`. Kept apart, `requireActual('@tests/routes')` touches
 * nothing but pure helpers.
 *
 * Imported directly rather than through `src/modules.ts`, so a consumer drags in only what it
 * needs rather than the whole registry. Static, which is the point: a module added under
 * `src/modules/` with no line here fails the "imports one router per module directory" check in
 * `write-routes-are-guarded.test.ts` instead of silently going unguarded. Shared rather than
 * copied per file: two independent copies can drift apart silently, and only one of them was
 * ever checked for completeness.
 *
 * A consuming test file must still declare its own `jest.mock` calls for the middleware
 * factories BEFORE importing this, the same as it would importing any of these routers directly
 * — see `@tests/routes`'s own header for why.
 */
import type { Router } from 'express';
import { router as accountRouter } from '@modules/account/routes';
import { router as addressesRouter } from '@modules/addresses/routes';
import { router as antibotRouter } from '@modules/antibot/routes';
import { router as apiKeysRouter } from '@modules/api-keys/routes';
import { router as auditLogsRouter } from '@modules/audit-logs/routes';
import { router as cartRouter } from '@modules/cart/routes';
import { router as deliveryRouter } from '@modules/delivery/routes';
import { router as feedbackRouter } from '@modules/feedback/routes';
import { router as inventoryRouter } from '@modules/inventory/routes';
import { router as localesRouter } from '@modules/locales/routes';
import { router as observabilityRouter } from '@modules/observability/routes';
import { router as ordersRouter } from '@modules/orders/routes';
import { router as paymentsRouter } from '@modules/payments/routes';
import { router as productsRouter } from '@modules/products/routes';
import { router as usersRouter } from '@modules/users/routes';
import { router as webhooksRouter } from '@modules/webhooks/routes';
import { router as wishlistRouter } from '@modules/wishlist/routes';

/** Every routed module, keyed by directory name under `src/modules/`. */
export const ROUTED_MODULES: Record<string, Router> = {
    account: accountRouter,
    addresses: addressesRouter,
    antibot: antibotRouter,
    'api-keys': apiKeysRouter,
    'audit-logs': auditLogsRouter,
    cart: cartRouter,
    delivery: deliveryRouter,
    feedback: feedbackRouter,
    inventory: inventoryRouter,
    locales: localesRouter,
    observability: observabilityRouter,
    orders: ordersRouter,
    payments: paymentsRouter,
    products: productsRouter,
    users: usersRouter,
    webhooks: webhooksRouter,
    wishlist: wishlistRouter
};
