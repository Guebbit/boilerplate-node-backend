/**
 * The analytics event names BOTH repos emit.
 *
 * ─── Generated, and byte-identical in the paired repository — do not hand-edit ───────────────
 * Backend:  src/infrastructure/observability/analytics-events.ts
 * Frontend: src/infrastructure/analyticsEvents.ts
 * Each domain owns its names in `src/modules/<name>/analytics.fragment.ts`; the backend runs
 * `npm run contracts:bundle` and the frontend receives a copy. `npm run check:spec-identity`
 * fails the build on the commit that forks them. Two filenames because the lint configs disagree
 * on case; the CONTENT must match exactly.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * One funnel is built across both trackers, so a name spelled differently on each side errors
 * nowhere and silently produces two half-events no dashboard adds up. Hence a closed set, and
 * snake_case `noun_pastTenseVerb`, which PostHog's UI sorts well.
 *
 * A `const` object rather than an `enum`: the frontend's lint requires `E`-prefixed enums and the
 * backend's does not, so no single `enum` satisfies both.
 *
 * Events only ONE side emits do not belong here.
 */
export const analyticsEvents = {
