#!/usr/bin/env tsx
/**
 * @module
 * Refuses a commit whose committed generated files are stale — `npm run check:generated`, run by
 * `.husky/pre-commit`. It only checks; it never stages and never writes into the working tree.
 *
 * Which files: whatever `regenerate` writes that is not gitignored (the shared-rules schemas,
 * `shared/authorization-keys.generated.yaml`, `docker/crontab`, `docker/Dockerfile.dockerignore`, the tables
 * inside `docs/`). The core is `stale-generated-files.ts`.
 *
 * See: docs/api/regenerating.md#the-pre-commit-hook
 */

import { execFileSync } from 'node:child_process';
import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { gitEnvironment } from '../git-base';
import { REPO_ROOT } from '../modules-on-disk';
import { staleGeneratedFiles } from './stale-generated-files';

/**
 * `regenerate --no-sync` inside the scratch export, with this checkout's dependencies linked in
 * (resolved through the symlink exactly as through a real directory). Output is held back and
 * shown only when the run fails.
 *
 * @param tree - the scratch copy of the index
 */
const regenerateIn = (tree: string): void => {
    symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(tree, 'node_modules'), 'dir');
    execFileSync('npx', ['tsx', 'scripts/regenerate-artifacts.ts', '--no-sync'], {
        cwd: tree,
        env: gitEnvironment(),
        stdio: 'pipe',
        encoding: 'utf8'
    });
};

/** Files a regeneration would change in what is being committed. */
const stale = staleGeneratedFiles({ repo: REPO_ROOT, regenerate: regenerateIn });

if (stale.length > 0) {
    console.error(
        `[generated] ${stale.length} committed generated file(s) are stale in this commit:\n` +
            stale.map((file) => `  ${file}`).join('\n') +
            '\n\nRun `npm run regenerate` and stage them.'
    );
    process.exit(1);
}
console.info('[generated] every committed generated file is current.');
