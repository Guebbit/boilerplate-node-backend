import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { RESERVATION_EXPIRED } from '@modules/inventory';
import { router } from './routes';
import { seedOrdersCollection, exportSeededOrders } from './demo';
import { cancelById } from './service';
// Installs this module's event declarations (ORDER_CANCELLED, ORDER_STATUS_CHANGED).
import './events';

/**
 * Placed orders: admin write and soft delete, plus each account reading back its own.
 *
 * Depends on products because an order embeds the catalogue row as it stood at purchase time — the
 * schema itself, not a reference, so a later edit to the product cannot rewrite the history of an
 * order. Nothing in products reaches back, so this stays a plain import rather than an event.
 *
 * Depends on inventory because an order is a claim on units: creating one holds them, cancelling
 * one gives them back. Inventory reaches back exactly once, when a hold times out, and that
 * arrives as `RESERVATION_EXPIRED` — so the import graph stays acyclic even though the two
 * domains are mutually aware.
 *
 * The cart depends on this module in turn: a checkout is the one place an order is created outside
 * the admin routes. That arrow points cart → orders and does not come back.
 */
export default {
    name: 'orders',
    /*
     * The module with the real invariants: what an order totals, which status transitions are legal,
     * what cancelling restores. Three other modules are downstream of its status changes. If any one
     * module here ever grows an aggregate, it is this one — see `TACTICAL_DDD_PLAN.md` §5.
     */
    subdomain: 'core',
    language: {
        Order: 'What a customer bought, frozen. Immutable in substance: only its status moves.',
        'Order item':
            'A line holding an embedded copy of the product as it stood at purchase time, not a reference to it.',
        Status: 'Where an order is in its lifecycle. A closed set from the contract, moving along the edges `domain/lifecycle.ts` declares — every guard in this module and in `payments` reads that one table.',
        Cancellation:
            'A status change that releases the order’s held units and triggers a refund. Legal from the statuses the lifecycle table gives a customer — `pending` and `paid`.',
        Expiry: 'A cancellation the shop initiates because the order’s hold on its units ran out before payment did. Arrives as `inventory.reservation_expired`.',
        Total: 'Line price × quantity, summed in minor units and returned as a decimal. Computed, never stored as truth.'
    },
    basePath: '/orders',
    routes: router,
    dependsOn: [
        {
            module: 'inventory',
            as: 'customer-supplier',
            because:
                'Creating an order holds its units and cancelling one gives them back; this module asks for both by name and never touches a counter itself.'
        },
        {
            module: 'products',
            as: 'conformist',
            because:
                'An order item embeds `productSchema` itself, so the catalogue’s shape is this module’s shape too.'
        }
    ],
    /*
     * A hold that timed out takes its order with it. The units are already released by the time
     * this fires; what `inventory` cannot do is cancel an order without importing this module.
     *
     * Admin scope because the shop is cancelling, not the customer, so the write must not be
     * filtered by whose order it is. `cancelById` calls back into `releaseForOrder`, which finds
     * the hold already released — the two paths converge and neither can double-release.
     */
    subscribe: () => {
        onDomainEvent(RESERVATION_EXPIRED, ({ orderId }) => cancelById(orderId, { admin: true }));
    },
    seeds: seedOrdersCollection,
    seedExport: exportSeededOrders,
    /* `GET /orders/:id` answers the serialized document as it stands, totals included. */
    demoShapes: { orders: 'response' },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
