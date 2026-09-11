/**
 * @module
 * Order service — all business logic for the Order entity, and the one place a controller may call
 * into. A folder rather than one file because it passed ~300 lines; see `docs/theory/layers.md`.
 *
 * `crud.ts` reads and writes an order, `cancel.ts` runs the cancellation and the sweep behind its
 * marker, `retention.ts` answers an erased account, `scope.ts` decides who may see what.
 */

import {
    search,
    getById,
    create,
    recordCreated,
    update,
    updateById,
    remove,
    removeById
} from './crud';
import { detachUserId, anonymizeDueOrders } from './retention';
import { callerScope, withActions } from './scope';
import { cancelById, retryPendingEffects } from './cancel';

/*
 * Every operation is published by name as well as through the object below, exactly as the single
 * file did: `module.ts` wires `cancelById` and `detachUserId` into the events that trigger them,
 * `orders/index.ts` publishes `retractOrder` to `cart`, and the suites drive the operations
 * directly. A barrel that published less would make this split a breaking change.
 */
export {
    search,
    getById,
    create,
    recordCreated,
    retractOrder,
    update,
    updateById,
    remove,
    removeById
} from './crud';
export { cancelById, retryPendingEffects } from './cancel';
export { detachUserId, anonymizeDueOrders } from './retention';
export { callerScope, actorOf, withActions } from './scope';
export { freezeOrderLines } from './snapshot';

/** The service's public surface — every controller and cross-module caller goes through this. */
export const orderService = {
    search,
    getById,
    callerScope,
    create,
    recordCreated,
    update,
    updateById,
    remove,
    removeById,
    detachUserId,
    anonymizeDueOrders,
    cancelById,
    retryPendingEffects,
    withActions
};
