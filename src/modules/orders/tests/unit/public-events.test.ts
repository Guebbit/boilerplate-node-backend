/**
 * @module
 * What webhook subscribers are told about an order: the public event name and its payload,
 * projected from the domain event by the module's manifest.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { MODULES_ROOT } from '@tests/paths';
import ordersModule from '../../module';
import { CANCEL_CAUSES } from '../../services/cancel';
import { ORDER_CANCELLED, ORDER_CREATED, ORDER_REDACTED, ORDER_STATUS_CHANGED } from '../../events';

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

            const projected = target.toPublicEvent({
                orderId: 'o1',
                refund,
                cause: 'operator'
            } as never);

            expect(projected).toEqual({
                eventType: 'order.cancelled',
                data: { orderId: 'o1', cause: 'operator' }
            });
            expect(projected?.data).not.toHaveProperty('refund');
        }
    );

    // A lost parcel is the cause whose summary differs: its units were never restocked.
    it('names a lost parcel as the cause, so a subscriber does not assume the stock came back', () => {
        const target = ordersModule.publicEvents[ORDER_CANCELLED];

        expect(
            target.toPublicEvent({ orderId: 'o1', refund: false, cause: 'lost' } as never)
        ).toEqual({ eventType: 'order.cancelled', data: { orderId: 'o1', cause: 'lost' } });
    });

    // The AsyncAPI enum is a copy of the code's list: no contract file can import it.
    it('keeps the contract’s cause enum equal to the causes the cancel service knows', () => {
        const contract = parse(
            readFileSync(path.join(MODULES_ROOT, 'orders', 'asyncapi.webhooks.yaml'), 'utf8')
        ) as {
            components: {
                schemas: { OrderCancelledPayload: { properties: { cause: { enum: string[] } } } };
            };
        };

        expect(contract.components.schemas.OrderCancelledPayload.properties.cause.enum).toEqual(
            Object.keys(CANCEL_CAUSES)
        );
    });

    it('tells subscribers an order was scrubbed, with its id alone', () => {
        const target = ordersModule.publicEvents[ORDER_REDACTED];

        expect(target.toPublicEvent({ orderId: 'o1' } as never)).toEqual({
            eventType: 'order.redacted',
            data: { orderId: 'o1' }
        });
    });
});
