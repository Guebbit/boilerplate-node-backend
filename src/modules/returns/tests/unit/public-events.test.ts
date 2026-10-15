/**
 * @module
 * What webhook subscribers are told about a return: the public event name and its payload,
 * projected from the domain event by the module's manifest.
 */

import returnsModule from '../../module';
import { RETURN_RECEIVED, RETURN_REQUESTED } from '../../events';

// `as never`: the slot takes `never` so one registry can hold every module's projections.
describe('the returns module’s public events', () => {
    it('tells subscribers a return was requested, with its order and reason', () => {
        const target = returnsModule.publicEvents[RETURN_REQUESTED];

        expect(
            target.toPublicEvent({ returnId: 'r1', orderId: 'o1', reason: 'defective' } as never)
        ).toEqual({
            eventType: 'return.requested',
            data: { returnId: 'r1', orderId: 'o1', reason: 'defective' }
        });
    });

    it('never carries the customer’s own words, even when the domain event holds them', () => {
        const target = returnsModule.publicEvents[RETURN_REQUESTED];

        const projected = target.toPublicEvent({
            returnId: 'r1',
            orderId: 'o1',
            reason: 'defective',
            note: 'call me on 555-0100'
        } as never);

        expect(JSON.stringify(projected)).not.toContain('555-0100');
        expect(projected?.data).not.toHaveProperty('note');
    });

    it('tells subscribers the goods were received, with the return and its order', () => {
        const target = returnsModule.publicEvents[RETURN_RECEIVED];

        expect(target.toPublicEvent({ returnId: 'r1', orderId: 'o1' } as never)).toEqual({
            eventType: 'return.received',
            data: { returnId: 'r1', orderId: 'o1' }
        });
    });
});
