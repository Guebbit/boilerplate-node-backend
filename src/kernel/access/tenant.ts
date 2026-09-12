/**
 * @module
 * The one shop's pinned `_id`, split out of `seed.ts` to avoid a circular import: `permissions.ts`
 * needs the constant too (`anonymousCaller`, `SYSTEM_ACTOR`), and `seed.ts` already imports from
 * `permissions.ts`. `seed.ts` re-exports this, so every existing `@kernel/access/seed` import
 * keeps working.
 */

/**
 * The one shop's pinned `_id` — same format and vintage as `@scenarios/accounts`'s ids.
 *
 * Every deployment reads this constant directly rather than looking its shop up: with one shop per
 * database, the id can be fixed at build time instead of resolved at boot, the Django `SITE_ID`
 * pattern. `ensureTenant` only sets it on INSERT, so it survives every reseed unchanged:
 * `emptyDatabase()` (never `dropDatabase()`) leaves the row itself in place, and even a
 * from-empty reseed recreates the same id rather than minting a fresh one.
 */
export const DEMO_TENANT_ID = '65dd20000000000000000001';
