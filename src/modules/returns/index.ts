/**
 * @module
 * Returns — public barrel; the only surface a sibling module may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). `returnRepository` and the model's runtime stay
 * inside: the service is the door, and a return is only ever opened, decided or received through
 * the rules that make each of those exactly-once.
 *
 * @see docs/modules/returns.md#its-neighbourhood
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
