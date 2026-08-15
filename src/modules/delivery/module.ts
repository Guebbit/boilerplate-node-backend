import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ORDER_STATUS_CHANGED } from '@modules/orders';
import { router } from './routes';
import { shipOrder } from './service';

/**
 * Delivery: shipping rates, shipments and the fake courier.
 *
 * Depends on orders because a shipment is ABOUT an order, and on users only to address the
 * shipped email in the recipient's language. The rates live in `./domain` as pure functions so
 * the cart's checkout can price a method without this module's HTTP surface — that import is
 * cart → delivery, the same direction as cart → orders, and deleting this module takes the
 * shipping selector, the parcel records and the costs with it: orders simply stop carrying a
 * `shippingCost`, which is the state the shop was in before.
 */
export default {
    name: 'delivery',
    /*
     * Shipping is specific to how this shop operates — its methods, its rates, its courier — but it
     * is not what anyone buys here. Supporting: worth its own rules in `domain/`, not worth an
     * aggregate.
     */
    subdomain: 'supporting',
    language: {
        'Shipping method':
            'A named way to ship, with a rate rule. A closed set in `domain/rates.ts`, not a collection.',
        'Shipping cost':
            'What a method charges for a given basket. Computed by a pure function so the cart can quote it without a shipment existing.',
        Shipment:
            'The parcel record for an order that has actually shipped. Created on the status change, never before.',
        Courier:
            'The carrier moving a shipment. Faked here, behind the same seam a real integration would use.'
    },
    basePath: '/delivery',
    routes: router,
    dependsOn: [
        {
            module: 'orders',
            as: 'customer-supplier',
            because:
                'A shipment is about an order: this module reads the order it ships and moves its status.'
        },
        {
            module: 'users',
            as: 'conformist',
            because:
                'Reads the recipient record to address the shipped email in their own language.'
        }
    ],
    subscribe: () => {
        onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) => {
            if (to === 'shipped') return shipOrder(orderId);
            return undefined;
        });
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
