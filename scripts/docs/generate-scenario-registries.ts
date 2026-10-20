#!/usr/bin/env tsx
/**
 * `npm run scenarios:generate` — rebuilds the two scenario registries from the file tree
 * (`scripts/scaffold/scenario-registry.ts`). `--check` reports drift instead of writing, which is
 * what `complete` runs.
 */

import { REPO_ROOT } from '../modules-on-disk';
import { formatWithRepoConfig } from '../scaffold/format-text';
import { staleScenarioRegistries, writeScenarioRegistries } from '../scaffold/scenario-registry';
import { hasFlag } from '../cli';

/** Report drift instead of rewriting — what `complete` runs. */
const checkOnly = hasFlag('check');

(checkOnly
    ? staleScenarioRegistries(REPO_ROOT, formatWithRepoConfig).then((stale) => {
          for (const file of stale)
              console.error(
                  `${file} is not what the scenario files generate.\n  Run: npm run scenarios:generate`
              );
          return stale.length === 0 ? 0 : 1;
      })
    : writeScenarioRegistries(REPO_ROOT, formatWithRepoConfig).then((written) => {
          for (const file of written) console.info(`✓ Generated ${file}`);
          return 0;
      })
)
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
