/**
 * @module
 * Inventory — public barrel.
 *
 * The only surface a sibling module may import; lint enforces that reaching `./service` from
 * outside is an error rather than a shortcut.
 *
 * The repositories, both models and every counter primitive are deliberately absent. This module
 * exists so that nothing outside it can move a stock number, and publishing a repository would
 * hand back the ability it was created to take away. A sibling asks for a transition by name and
 * gets a boolean; what it costs in counters is not their business.
 *
 * See: docs/modules/inventory.md
 */

export { inventoryService } from './service';

/**
 * Availability, in the one place it is defined: `onHand - reserved`, clamped at zero. The one
 * exception to "ask for a transition, never compute" — a pure function over plain data, not a way
 * in to the counters. `cart`'s domain layer keeps its own copy (the domain tier may not import a
 * sibling) and tests it against this one.
 */
export { availabilityOf } from './domain';

// `StockMovementReason` and `StockLine` stay unpublished — no caller needs either shape yet, and a
// barrel line is a promise worth making only for a real one.

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { RESERVATION_EXPIRED } from './events';
