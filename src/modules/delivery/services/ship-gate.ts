/**
 * @module
 * The one order-state question the ship door and the `forceShip` flag both ask: may a shipment
 * leave an order in this status? Kept apart from `ship.ts` (the act) and `actions.ts` (the flags)
 * so neither imports the other.
 */

import { canShip, canStartFulfilment } from '@modules/orders';
import type { OrderStatus } from '@types';

/**
 * Whether a shipment may leave an order in this status: `processing`, or — when the caller forces
 * the first shipment — `paid`, from which the shipment makes the `start` move itself.
 * @param status - the order's status
 * @param forced - whether the caller forces the first shipment
 */
export const isOpenForShipment = (status: OrderStatus, forced: boolean): boolean =>
    canShip(status) || (forced && canStartFulfilment(status));
