/**
 * Inventory — public barrel.
 *
 * The only surface a sibling module may import; lint enforces that reaching `./service` from
 * outside is an error rather than a shortcut.
 *
 * The repositories, both models and every counter primitive are deliberately absent. This module
 * exists so that nothing outside it can move a stock number, and publishing a repository would
 * hand back the ability it was created to take away. A sibling asks for a transition by name and
 * gets a boolean; what it costs in counters is not their business.
 */

export { inventoryService } from './service';

/**
 * Availability, in the one place it is defined: `onHand - reserved`, clamped at zero.
 *
 * The single exception to the "ask for a transition, never compute" rule above, and it earns the
 * exception by being a pure function over plain data rather than a way in to the counters — the
 * `published-language` shape the registry describes. Anything rendering or checking availability
 * should reach this rather than subtract for itself.
 *
 * `cart`'s domain layer is the one caller that cannot, because the domain tier may not import a
 * sibling at all (`eslint.config.ts`). It keeps a copy, and its test compares the two against
 * this — which is why the boundary being importable from a test matters.
 */
export { availabilityOf } from './domain';

/*
 * `StockMovementReason` and `StockLine` are deliberately NOT re-exported: a barrel line is a promise
 * that a shape will not move, worth making for a real caller and never on speculation.
 * `releaseForOrder` defaults its reason, so no caller names one; `StockLine` describes a shape
 * that only crosses the wire, where the generated contract types are what a client reads.
 * `InventoryLevel` is one of those generated types — `service.ts` imports it from `@types` — so
 * there is no local declaration here to publish.
 */

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { RESERVATION_EXPIRED } from './events';
