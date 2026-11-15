/**
 * @module
 * The one runtime door from `src/` to `scenarios/`: a process booted with `NODE_ENV=development`
 * loads the development doubles here, at boot, instead of through a per-script `--import`.
 *
 * Called by: `src/main.ts`, `src/cluster.ts` and `scripts/run-script.ts`. Nowhere else.
 * Why a runtime `import()`: the production image has no `scenarios/`, and a static import would
 * break both the build and `src-cannot-reach-scenarios`. Only this branch can reach the file.
 *
 * @see docs/build/test-doubles.md#the-door-node-env-development
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { nodeEnvironment } from '@infrastructure/runtime/config';

/**
 * The doubles file, relative to the working directory — the rule `dotenv` follows for `.env`.
 * Written out as a literal on purpose: depcruise, knip and tsc cannot follow the computed path
 * below, so a unit test asserts this one still names a file.
 */
export const DEVELOPMENT_DOUBLES_PATH = 'scenarios/support/development-doubles.ts';

/**
 * Register the development doubles when this process runs as `NODE_ENV=development`.
 *
 * Any other `NODE_ENV` resolves at once and registers nothing (jest registers its own through
 * `tests/support/setup.ts`; production has none to register).
 *
 * @returns resolves once the doubles are registered, or at once outside development
 * @throws {Error} in development when the working directory has no `scenarios/` — the production
 *                 image run with the wrong `NODE_ENV`
 */
export const loadDevelopmentDoubles = (): Promise<void> => {
    if (nodeEnvironment() !== 'development') return Promise.resolve();

    const file = path.join(process.cwd(), DEVELOPMENT_DOUBLES_PATH);
    return (
        access(file)
            .catch(() => {
                throw new Error(
                    'NODE_ENV=development, but this image has no `scenarios/`: the development doubles ' +
                        'ship only in the dev image. Production runs with NODE_ENV=production.'
                );
            })
            // Dynamic `import()` of a computed path: tsx and ts-jest both resolve a bare `.ts` path.
            .then(() => import(file))
            .then(() => undefined)
    );
};
