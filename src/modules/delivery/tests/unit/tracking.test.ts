/**
 * @module
 * `isAwaitingTracking` — the rule behind `Shipment.awaitingTracking` and the staff digest row:
 * a physical, still-`shipped` parcel on a tracked method with no code.
 */

import { FulfillmentOrderKind, ShipmentStatus } from '@types';
import { isAwaitingTracking } from '../../domain';

/** A parcel that left without a code, on a tracked method — the one case that waits. */
const waiting = {
    kind: FulfillmentOrderKind.physical,
    status: ShipmentStatus.shipped
};

describe('isAwaitingTracking', () => {
    it('is true for a physical, shipped parcel on a tracked method with no code', () => {
        expect(isAwaitingTracking(waiting, 'express')).toBe(true);
    });

    it.each([
        ['an untracked method', waiting, 'standard'],
        ['an order with no method', waiting, undefined],
        ['an unknown method', waiting, 'teleport'],
        ['a code already set', { ...waiting, trackingCode: 'TRK-1' }, 'express'],
        ['a delivered parcel', { ...waiting, status: ShipmentStatus.delivered }, 'express'],
        ['a digital fulfilment', { ...waiting, kind: FulfillmentOrderKind.digital }, 'express']
    ])('is false for %s', (_name, facts, method) => {
        expect(isAwaitingTracking(facts, method)).toBe(false);
    });
});
