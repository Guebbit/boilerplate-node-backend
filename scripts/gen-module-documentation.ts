#!/usr/bin/env tsx
/**
 * Write `docs/modules/` from the code that is actually running — `npm run docs:modules`.
 *
 * With `--check` it writes nothing and fails on the first page that has drifted, which is how it
 * earns its place in `npm run complete`: a module's page cannot describe a route it no longer
 * serves or a field it no longer stores.
 *
 * See: docs/modules/index.md · docs/theory/module-lifecycle.md
 */

import 'dotenv/config';
import { enabledModules } from '../src/modules';
import { generateModuleDocumentation } from './module-docs';

const checkOnly = process.argv.includes('--check');

void generateModuleDocumentation(enabledModules, checkOnly).then((code) => {
    process.exitCode = code;
});
