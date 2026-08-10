import path from 'node:path';

/**
 * Default sibling-checkout location of the paired frontend, relative to this repo's root.
 *
 * Mirrors `scripts/backendPath.ts` in the frontend, which resolves this repo from over there.
 * The two conventions have to agree — each repo assumes the other sits beside it — so changing
 * one without the other breaks the contract check in exactly one direction, which is the
 * confusing half.
 */
export const DEFAULT_FRONTEND_PATH = '../boilerplate-vue-frontend';

/**
 * Resolves the frontend checkout used by the cross-repo contract check: `FRONTEND_PATH` env
 * override when set, `DEFAULT_FRONTEND_PATH` otherwise — always returned as an absolute path, so
 * a checkout laid out differently from the sibling-directory convention fails with an
 * unambiguous path instead of a relative one resolved against whatever `cwd` happened to be.
 */
export const resolveFrontendPath = (): string =>
    path.resolve(process.cwd(), process.env.FRONTEND_PATH ?? DEFAULT_FRONTEND_PATH);
