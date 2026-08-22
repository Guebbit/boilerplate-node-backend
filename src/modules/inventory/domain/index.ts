/**
 * Inventory — domain layer. Pure rules, lint-guaranteed free of Express, Mongoose and every tier.
 *
 * What belongs here: anything testable without a database — above all the reason→delta table,
 * which is the model itself rather than a detail of how it is stored.
 * What does not: the conditional writes that enforce the table, the ledger row, the HTTP envelopes.
 *
 * See `docs/theory/domain-layer.md`.
 */

export { counterDeltaFor, availabilityOf } from './transitions';
export type { CounterDelta } from './transitions';
