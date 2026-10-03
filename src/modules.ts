/**
 * @module
 * THE registry: which domains this build serves. Adding one is a folder under `src/modules/` plus
 * one line here; removing one is `rm -rf` plus deleting its line, and any resulting break is real
 * coupling worth seeing. Order is alphabetical only to keep diffs boring — mount order, import
 * resolution and `subscribe` timing don't depend on it. The contract bundlers do not read this
 * list: they run before `enabledModules` is even importable (its modules import the generated
 * `@api/` client the bundler produces), so they discover modules from disk instead
 * (`scripts/contracts/section-order.ts`).
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
import example from './modules/example/module';
import feedback from './modules/feedback/module';
import inventory from './modules/inventory/module';
import invoicing from './modules/invoicing/module';
import locales from './modules/locales/module';
import observability from './modules/observability/module';
import orders from './modules/orders/module';
import payments from './modules/payments/module';
import products from './modules/products/module';
import returns from './modules/returns/module';
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
    example,
    feedback,
    inventory,
    invoicing,
    locales,
    observability,
    orders,
    payments,
    products,
    returns,
    users,
    webhooks,
    wishlist
];

/**
 * Every enabled module's own locale directory, in registry order — what `bootI18n` needs to load
 * translations for exactly the modules this build serves. A module carries its own copy or none;
 * this is the one place that turns the registry into the flat list `bootI18n` takes.
 * @returns the locale directories to register, one per module that ships one
 */
export const enabledModuleLocales = (): string[] =>
    enabledModules
        .map((appModule) => appModule.locales)
        .filter((directory) => directory !== undefined);

/**
 * Every enabled module's own template directory, in registry order — what
 * `registerTemplateDirectories` needs to know which EJS templates this build can render (SK-15).
 * A module carries its own copy or none; this is the one place that turns the registry into the
 * flat list `mailer.ts` takes, the same shape {@link enabledModuleLocales} gives `bootI18n`.
 * @returns the template directories to register, one per module that ships one
 */
export const enabledModuleTemplateDirectories = (): string[] =>
    enabledModules
        .map((appModule) => appModule.templates)
        .filter((directory) => directory !== undefined);

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
    | 'example'
    | 'feedback'
    | 'inventory'
    | 'invoicing'
    | 'locales'
    | 'observability'
    | 'orders'
    | 'payments'
    | 'products'
    | 'returns'
    | 'users'
    | 'webhooks'
    | 'wishlist';
