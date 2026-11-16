/**
 * @module
 * Payments — public barrel; the only surface a sibling may import. `paymentRepository` and the model's runtime
 * stay inside — every write still goes through the provider-confirmed choreography in
 * `services/settlement.ts`, never a direct document write from outside.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 * @see docs/modules/payments.md#its-neighbourhood
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
