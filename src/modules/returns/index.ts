/**
 * @module
 * Returns — public barrel; the only surface a sibling module may import.
 * `returnRepository` and the model's runtime stay inside: the service is the door, and a return
 * is only ever opened, decided or received through the rules that make each of those
 * exactly-once.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
