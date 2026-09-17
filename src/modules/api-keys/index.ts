/**
 * @module
 * Api-keys — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `credentials.ts` stays internal: minting and
 * verifying a credential is this module's own resource, and nothing else has business doing
 * either. `module.ts` wires the `CredentialResolver` itself at import time.
 *
 * See: docs/modules/api-keys.md
 */

export * from './services';

export type * from './model';
