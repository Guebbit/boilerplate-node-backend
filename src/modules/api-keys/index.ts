/**
 * @module
 * Api-keys — public barrel; the only surface a sibling module may import (the rule
 * is linked below). `credentials.ts` stays internal: minting and
 * verifying a credential is this module's own resource, and nothing else has business doing
 * either. `module.ts` wires the `CredentialResolver` from its `onRegistered` hook.
 *
 * @see docs/modules/api-keys.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './emails';

export type * from './model';
