/**
 * @module
 * A parcel's moves: the one table every write, flag and test reads, with no I/O.
 *
 * Not a move: a digital shipment is BORN `delivered` (`services/cut.ts`), and a physical one is
 * born `shipped`. A birth is a write of its own, so it is not an event here.
 *
 * See: docs/modules/delivery.md#the-two-records
 */

import { ShipmentStatus } from '@types';
import { defineLifecycle } from '@domain-primitives/lifecycle';
import type { LifecycleEvent } from '@domain-primitives/lifecycle';

/** One of a shipment's events: it arrives, staff report it lost, a lost one turns up. */
export type ShipmentEvent = 'deliver' | 'lose' | 'find';

/** The events by name, each with the statuses it may start from and the one it lands on. */
export const SHIPMENT_EVENTS = {
    deliver: { from: [ShipmentStatus.shipped], to: ShipmentStatus.delivered },
    lose: { from: [ShipmentStatus.shipped], to: ShipmentStatus.lost },
    find: { from: [ShipmentStatus.lost], to: ShipmentStatus.delivered }
} as const satisfies Record<ShipmentEvent, LifecycleEvent<ShipmentStatus>>;

/**
 * The table, checked once at load. `initial` is the status a physical parcel is born in; every
 * repository write and every `actions` flag asks this instead of spelling a status.
 */
export const shipmentLifecycle = defineLifecycle<ShipmentStatus, ShipmentEvent>(
    Object.values(ShipmentStatus),
    { initial: ShipmentStatus.shipped, events: SHIPMENT_EVENTS }
);
