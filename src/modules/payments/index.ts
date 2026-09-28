/**
 * @module
 * Payments — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `paymentRepository` and the model's runtime
 * stay inside — every write still goes through the provider-confirmed choreography in
 * `services/settlement.ts`, never a direct document write from outside.
 *
 * See: docs/modules/payments.md
 */

export * from './services';

export * from './domain';

export * from './events';

export type * from './model';
