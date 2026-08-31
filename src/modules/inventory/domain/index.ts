/**
 * @module
 * Inventory — domain layer. Pure rules, lint-guaranteed free of Express, Mongoose and every tier.
 *
 * Belongs here: rules testable without a database, above all the reason→delta table — the model
 * itself, not a detail of how it's stored. Not here: the conditional writes that enforce it, the
 * ledger row, the HTTP envelopes.
 *
 * See: docs/theory/domain-layer.md
 */

export { counterDeltaFor, availabilityOf } from './transitions';
