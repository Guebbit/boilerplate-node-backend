import path from 'node:path';
import type { IAppModule } from '@kernel/registry';
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
    basePath: '/delivery',
    routes: router,
    dependsOn: ['orders', 'users'],
    subscribe: () => {
        onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) => {
            if (to === 'shipped') return shipOrder(orderId);
            return undefined;
        });
    },
    locales: path.join(__dirname, 'locales')
} satisfies IAppModule;
