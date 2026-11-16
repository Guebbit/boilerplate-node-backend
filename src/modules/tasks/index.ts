/**
 * @module
 * Tasks — public barrel; the only surface a sibling may import.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 * @see docs/modules/tasks.md#its-neighbourhood
 */

export * from './services';

export * from './domain';

export * from './emails';

export type * from './model';

export * from './events';
