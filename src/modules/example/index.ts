/**
 * @module
 * In any module: the public barrel, the only surface a sibling may import. It exports services,
 * domain rules, events and emails, and the model's TYPES. Never a repository, the model's runtime
 * value, a wiring file or `factories.ts`.
 *
 * See: docs/theory/strategic-ddd.md
 */

export * from './services';

export * from './domain';

export * from './events';

export * from './emails';

export type * from './model';
