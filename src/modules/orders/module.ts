import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { seedOrdersCollection } from './seeds';
// Installs this module's event declarations (ORDER_CANCELLED, ORDER_STATUS_CHANGED).
import './events';

/**
 * Placed orders: admin write and soft delete, plus each account reading back its own.
 *
 * Depends on products because an order embeds the catalogue row as it stood at purchase time — the
 * schema itself, not a reference, so a later edit to the product cannot rewrite the history of an
 * order. Nothing in products reaches back, so this stays a plain import rather than an event.
 *
 * The cart depends on this module in turn: a checkout is the one place an order is created outside
 * the admin routes. That arrow points cart → orders and does not come back.
 */
export default {
    name: 'orders',
    basePath: '/orders',
    routes: router,
    dependsOn: ['products'],
    seeds: seedOrdersCollection,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
