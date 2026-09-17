/**
 * @module
 * Inventory — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). The repositories, both models and every
 * counter primitive are deliberately absent: publishing one would hand back the ability this
 * module exists to take away. A sibling asks for a transition by name and gets a boolean — what
 * it costs in counters is not their business.
 *
 * See: docs/modules/inventory.md
 */

export * from './service';

export * from './domain';

export * from './events';

export type * from './model';
