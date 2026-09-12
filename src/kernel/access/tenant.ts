/**
 * @module
 * The one shop's pinned `_id`, the sole home every caller imports it from. Its own file rather
 * than `seed.ts`'s, to avoid a circular import: `permissions.ts` needs the constant too
 * (`anonymousCaller`, `SYSTEM_ACTOR`), and `seed.ts` already imports from `permissions.ts`.
 */

/**
 * The one shop's pinned `_id` — same format and vintage as `@scenarios/accounts`'s ids.
 *
 * Named for the DEPLOYMENT, not the demo: `db/bootstrap-access.ts` and `db/grant-access.ts` both
 * ship in the production image and both address the shop through this, so a `DEMO_` prefix would
 * describe the one scenario that is guaranteed absent there.
 *
 * Every deployment reads this constant directly rather than looking its shop up: with one shop per
 * database, the id can be fixed at build time instead of resolved at boot, the Django `SITE_ID`
 * pattern. `ensureTenant` only sets it on INSERT, so it survives every reseed unchanged:
 * `emptyDatabase()` (never `dropDatabase()`) leaves the row itself in place, and even a
 * from-empty reseed recreates the same id rather than minting a fresh one.
 */
export const DEPLOYMENT_TENANT_ID = '65dd20000000000000000001';
