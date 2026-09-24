/**
 * @module
 * THE registry: which domains this build serves. Adding one is a folder under `src/modules/` plus
 * one line here; removing one is `rm -rf` plus deleting its line, and any resulting break is real
 * coupling worth seeing. Order is alphabetical only to keep diffs boring — mount order, import
 * resolution and `subscribe` timing don't depend on it. A module shipping its own `openapi.yaml`
 * needs a matching line in `MODULE_SECTIONS` (`scripts/contracts/openapi-bundle.ts`) — checked
 * against this list by `tests/cross-cutting/contract-bundles.test.ts`, not at import time: the
 * bundler reads `openapi.yaml` from disk only, so it can run before `enabledModules` is even
 * importable (its modules import the generated `@api/` client the bundler produces).
 */

import type { AppModule } from '@kernel/registry';
import access from './modules/access/module';
import account from './modules/account/module';
import addresses from './modules/addresses/module';
import antibot from './modules/antibot/module';
import apiKeys from './modules/api-keys/module';
import auditLogs from './modules/audit-logs/module';
import cart from './modules/cart/module';
import delivery from './modules/delivery/module';
import feedback from './modules/feedback/module';
import inventory from './modules/inventory/module';
import locales from './modules/locales/module';
import observability from './modules/observability/module';
import orders from './modules/orders/module';
import payments from './modules/payments/module';
import products from './modules/products/module';
import users from './modules/users/module';
import webhooks from './modules/webhooks/module';
import wishlist from './modules/wishlist/module';

/** Every module this build serves, in the one list the app tier, docs and scripts all walk. */
export const enabledModules: AppModule[] = [
    access,
    account,
    addresses,
    antibot,
    apiKeys,
    auditLogs,
    cart,
    delivery,
    feedback,
    inventory,
    locales,
    observability,
    orders,
    payments,
    products,
    users,
    webhooks,
    wishlist
];

/**
 * Every name a module in this build can carry — what a module table may key itself on instead of
 * `string`, so naming one this build does not mount is a compile error rather than a test that has
 * to run first (`scenarios/index.ts`'s `shopModules`).
 *
 * Hand-listed rather than read off {@link enabledModules}: `AppModule.name` is `string`, and a
 * plain object literal widens a literal property to its declared field type regardless — there is
 * no `typeof` expression that would claw the literal back. One more line here is the cost of
 * adding a module already; this one carries an alphabetical order to keep it boring, same as the
 * array above.
 */
export type ModuleName =
    | 'access'
    | 'account'
    | 'addresses'
    | 'antibot'
    | 'api-keys'
    | 'audit-logs'
    | 'cart'
    | 'delivery'
    | 'feedback'
    | 'inventory'
    | 'locales'
    | 'observability'
    | 'orders'
    | 'payments'
    | 'products'
    | 'users'
    | 'webhooks'
    | 'wishlist';
