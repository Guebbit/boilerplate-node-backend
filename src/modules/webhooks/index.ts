/**
 * @module
 * Webhooks — public barrel; the only surface a sibling may import. `module.ts` declares the domain-
 * event subscription and the queue consumer on its own manifest entry — neither runs at import
 * time. `secrets.ts` stays internal — signing/encrypting a delivery secret is this module's own
 * business, nothing a sibling calls.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './domain';

export * from './events';

export type * from './model';
