/**
 * @module
 * Account — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `session/`'s token surface is never published,
 * since every request goes through `kernel/authentication.ts`; `oauth/` and `two-factor/` are the
 * same, reached only through `accountService`/`twoFactorService`. See docs/modules/account.md.
 */

export * from './services';

export * from './emails';

export type * from './model';
