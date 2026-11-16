/**
 * @module
 * Inventory — public barrel; the only surface a sibling module may import (the rule
 * is linked below). The repositories, both models and every
 * counter primitive are deliberately absent: publishing one would hand back the ability this
 * module exists to take away. A sibling asks for a transition by name and gets a boolean — what
 * it costs in counters is not their business.
 *
 * @see docs/modules/inventory.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './domain';

export * from './events';

export type * from './model';
