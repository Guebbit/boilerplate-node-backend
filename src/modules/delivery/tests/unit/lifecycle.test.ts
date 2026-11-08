import { ShipmentStatus } from '@types';
import { defineLifecycle } from '@domain-primitives/lifecycle';
import { SHIPMENT_EVENTS, shipmentLifecycle } from '../../domain';

describe('shipmentLifecycle', () => {
    it('lets a shipped parcel arrive or be reported lost, and nothing else', () => {
        expect(shipmentLifecycle.eventsFrom(ShipmentStatus.shipped)).toEqual(['deliver', 'lose']);
    });

    it('lets only a lost parcel be found', () => {
        expect(shipmentLifecycle.eventsFrom(ShipmentStatus.lost)).toEqual(['find']);
    });

    it('has no move out of delivered', () => {
        expect(shipmentLifecycle.eventsFrom(ShipmentStatus.delivered)).toEqual([]);
    });

    it('lands each event where it says', () => {
        expect(shipmentLifecycle.toOf('deliver')).toBe(ShipmentStatus.delivered);
        expect(shipmentLifecycle.toOf('lose')).toBe(ShipmentStatus.lost);
        expect(shipmentLifecycle.toOf('find')).toBe(ShipmentStatus.delivered);
    });

    it('starts a physical parcel shipped, a birth and not a move', () => {
        expect(shipmentLifecycle.initial).toBe(ShipmentStatus.shipped);
    });

    it('refuses to load when the table names a status the contract does not have', () => {
        const withoutLost = Object.values(ShipmentStatus).filter(
            (status) => status !== ShipmentStatus.lost
        );

        expect(() =>
            defineLifecycle(withoutLost, {
                initial: ShipmentStatus.shipped,
                events: SHIPMENT_EVENTS
            })
        ).toThrow(/unknown "lost"/);
    });
});
