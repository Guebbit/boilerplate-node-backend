/**
 * THE registry: which domains this build serves.
 *
 * Adding a domain is one folder under `src/modules/` plus one line here. Removing one is `rm -rf`
 * plus deleting its line — and if anything else breaks, that break is real coupling worth seeing
 * rather than a chore worth automating away.
 *
 * Order is not significant: routers mount under distinct base paths and dependencies are resolved
 * from `dependsOn`, not from position. Keep it alphabetical so diffs stay boring.
 */

import type { IAppModule } from '@kernel/registry';
import account from './modules/account/module';
import auditLogs from './modules/audit-logs/module';
import cart from './modules/cart/module';
import feedback from './modules/feedback/module';
import locales from './modules/locales/module';
import observability from './modules/observability/module';
import orders from './modules/orders/module';
import products from './modules/products/module';
import users from './modules/users/module';

export const enabledModules: IAppModule[] = [
    account,
    auditLogs,
    cart,
    feedback,
    locales,
    observability,
    orders,
    products,
    users
];
