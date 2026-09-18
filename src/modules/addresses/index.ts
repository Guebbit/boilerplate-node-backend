/**
 * @module
 * Addresses — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). See docs/modules/account.md — the address book
 * is documented alongside `account`, which shares its URL prefix and frontend screen.
 */

export * from './service';

export type * from './model';
