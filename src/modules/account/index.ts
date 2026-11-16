/**
 * @module
 * Account — public barrel; the only surface a sibling module may import (the
 * rule is linked below). `session/`'s token surface is never published,
 * since every request goes through `kernel/authentication.ts`; `oauth/` and `two-factor/` are the
 * same, reached only through `accountService`/`twoFactorService`. The export build
 * (`services/export*.ts`) is never published: it reaches every sibling's data.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 * @see docs/modules/account.md#its-neighbourhood
 */

export * from './services';

export * from './domain';

export * from './emails';

export * from './events';

export type * from './model';
