#!/usr/bin/env tsx
/**
 * `shared/rules/schemas/<name>.schema.json` — part of `npm run regenerate`.
 *
 * Each shared rules file is validated by a Zod schema on this side. The PHP twin has no Zod, so
 * the same schema is exported as JSON Schema and committed beside the data; the twin validates
 * with any JSON Schema library. `--check` reports a stale file instead of rewriting it.
 *
 * See: docs/theory/shared-rules.md
 */

import path from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from '../modules-on-disk';
import { writeOrCheck } from './generated-file';
import { SHARED_RULE_SCHEMAS } from '../../src/infrastructure/config/shared-rules/registry';

/** Where the exported schemas are committed. */
const SCHEMAS_DIRECTORY = path.join(REPO_ROOT, 'shared', 'rules', 'schemas');

for (const [name, schema] of Object.entries(SHARED_RULE_SCHEMAS)) {
    // Zod 4's built-in exporter. https://zod.dev/json-schema
    const document = JSON.stringify(z.toJSONSchema(schema), undefined, 2);

    writeOrCheck(
        path.join(SCHEMAS_DIRECTORY, `${name}.schema.json`),
        `${document}\n`,
        `shared/rules/schemas/${name}.schema.json`,
        'npm run regenerate'
    );
}
