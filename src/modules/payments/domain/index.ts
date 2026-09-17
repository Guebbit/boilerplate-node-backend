/**
 * @module
 * Payments — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. Anything testable without a database belongs here; queries, transactions, HTTP envelopes
 * and translated copy do not.
 *
 * See `docs/theory/domain-layer.md`.
 */

// `buildReference` is `cart`'s: checkout mints the code for a `bank_transfer` order. `parseReference`
// is this module's own lookup reading one back, published beside it so the pair stays one surface.
export { buildReference, parseReference } from './reference';
