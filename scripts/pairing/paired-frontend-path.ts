import path from 'node:path';

/**
 * Default sibling-checkout location of the paired frontend, relative to this repo's root.
 *
 * Mirrors `scripts/pairing/paired-backend-path.ts` in the frontend, which resolves this repo from over there.
 * The two conventions have to agree — each repo assumes the other sits beside it — so changing
 * one without the other breaks the contract check in exactly one direction, which is the
 * confusing half.
 */
export const DEFAULT_FRONTEND_PATH = '../boilerplate-vue-frontend';

/**
 * Resolves the frontend checkout used by the cross-repo contract check: `FRONTEND_PATH` when set,
 * `DEFAULT_FRONTEND_PATH` otherwise, always absolute.
 *
 * An EMPTY value counts as unset, which `??` alone would not do: `.env-example` declares
 * `FRONTEND_PATH =` with no value, so every copied `.env` defines it as `''`, which `??` would
 * resolve to this repo's own root — comparing the backend against itself.
 */
export const resolveFrontendPath = (): string =>
    path.resolve(process.cwd(), process.env.FRONTEND_PATH?.trim() || DEFAULT_FRONTEND_PATH);
