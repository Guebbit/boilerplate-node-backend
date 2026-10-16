/**
 * @module
 * What webhook subscribers are told about an order: the public event name and its payload,
 * projected from the domain event by the module's manifest.
 */

import ordersModule from '../../module';
import { ORDER_CANCELLED, ORDER_CREATED, ORDER_STATUS_CHANGED } from '../../events';

// `as never`: the slot takes `never` so one registry can hold every module's projections.
describe('the orders module’s public events', () => {
    it('tells subscribers an order was created, with its id alone', () => {
        const target = ordersModule.publicEvents[ORDER_CREATED];

        expect(target.toPublicEvent({ orderId: 'o1' } as never)).toEqual({
            eventType: 'order.created',
            data: { orderId: 'o1' }
        });
    });

    it('announces order.paid for a move to paid and nothing for any other move', () => {
        const target = ordersModule.publicEvents[ORDER_STATUS_CHANGED];

        expect(target.toPublicEvent({ orderId: 'o1', to: 'paid' } as never)).toEqual({
            eventType: 'order.paid',
            data: { orderId: 'o1' }
        });
        expect(target.toPublicEvent({ orderId: 'o1', to: 'shipped' } as never)).toBeUndefined();
    });

    // Whether a cancel owes money back is a policy for `payments`: "owed" is not "paid back", and
    // a subscriber hears `payment.refunded` when money actually moved.
    it.each([true, false])(
        'tells subscribers an order was cancelled without the refund policy (refund: %s)',
        (refund) => {
            const target = ordersModule.publicEvents[ORDER_CANCELLED];

            const projected = target.toPublicEvent({ orderId: 'o1', refund } as never);

            expect(projected).toEqual({ eventType: 'order.cancelled', data: { orderId: 'o1' } });
            expect(projected?.data).not.toHaveProperty('refund');
        }
    );
});
