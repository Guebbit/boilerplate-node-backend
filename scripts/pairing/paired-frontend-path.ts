import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Default sibling-checkout location of the paired frontend, relative to this repo's root.
 *
 * Mirrors `<paired-frontend>/scripts/pairing/paired-backend-path.ts`, which resolves this repo
 * from over there.
 * The two conventions have to agree — each repo assumes the other sits beside it — so changing
 * one without the other breaks the contract check in exactly one direction, which is the
 * confusing half.
 */
export const DEFAULT_FRONTEND_PATH = '../boilerplate-vue-frontend';

/**
 * `FRONTEND_PATH` as the working directory's `.env` sets it, or undefined when there is no file.
 *
 * Read here, once for every caller, because `npm run` does not load `.env`.
 * A CLI left to load it itself can forget, and then reads a different frontend than its siblings:
 * the check compares against a lane's paired worktree while the sync writes into the default one.
 *
 * `parseEnv` rather than `process.loadEnvFile()`: reading one variable merges nothing else into
 * the environment of whatever this script spawns next.
 * https://nodejs.org/api/util.html#utilparseenvcontent
 */
const frontendPathFromEnvironmentFile = (): string | undefined => {
    const environmentFile = path.resolve(process.cwd(), '.env');
    // Checked rather than caught: a checkout without a `.env` is ordinary — CI has none.
    return existsSync(environmentFile)
        ? parseEnv(readFileSync(environmentFile, 'utf8')).FRONTEND_PATH
        : undefined;
};

/**
 * Resolves the paired frontend checkout, always absolute. The first non-empty value wins:
 *
 * 1. `FRONTEND_PATH` in the real environment — a one-off run, or CI;
 * 2. `FRONTEND_PATH` in `.env` — a lane pointing at its own paired worktree;
 * 3. {@link DEFAULT_FRONTEND_PATH}.
 *
 * An EMPTY value counts as unset, which `??` alone would not do: `.env-example` declares
 * `FRONTEND_PATH =` with no value, so every copied `.env` defines it as `''`, which `??` would
 * resolve to this repo's own root — comparing the backend against itself.
 *
 * @returns the absolute path of the frontend checkout, whether or not anything is there
 */
export const resolveFrontendPath = (): string =>
    path.resolve(
        process.cwd(),
        process.env.FRONTEND_PATH?.trim() ||
            frontendPathFromEnvironmentFile()?.trim() ||
            DEFAULT_FRONTEND_PATH
    );
