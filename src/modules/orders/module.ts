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
    /*
     * The module with the real invariants: what an order totals, which status transitions are legal,
     * what cancelling restores. Three other modules are downstream of its status changes. If any one
     * module here ever grows an aggregate, it is this one — see `DDD_EXPLORATION.md` §6.
     */
    subdomain: 'core',
    language: {
        Order: 'What a customer bought, frozen. Immutable in substance: only its status moves.',
        'Order item':
            'A line holding an embedded copy of the product as it stood at purchase time, not a reference to it.',
        Status: 'Where an order is in its lifecycle. A closed set today enforced at the edge, not a modelled transition table.',
        Cancellation:
            'A status change that restores stock and triggers a refund. Legal only from the statuses in `CANCELLABLE_ORDER_STATUSES`.',
        Total: 'Line price × quantity, summed and rounded to cents. Computed, never stored as truth.'
    },
    basePath: '/orders',
    routes: router,
    dependsOn: [
        {
            module: 'products',
            as: 'conformist',
            because:
                'An order item embeds `productSchema` itself, so the catalogue’s shape is this module’s shape too.'
        }
    ],
    seeds: seedOrdersCollection,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
