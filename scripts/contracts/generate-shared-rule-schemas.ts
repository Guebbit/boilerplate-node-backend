#!/usr/bin/env tsx
/**
 * `shared/<folder>/schemas/<name>.schema.json` — part of `npm run regenerate`.
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
import { personasSchema } from '../../scenarios/personas-schema';

/** The folder every exported schema is committed under, beside its data. */
const SHARED_DIRECTORY = path.join(REPO_ROOT, 'shared');

/**
 * Every schema and the folder it is committed in. The demo accounts' schema lives in `scenarios/`
 * because infrastructure must not import it, so it is listed here, not in the registry.
 */
const EXPORTS: readonly (readonly [folder: string, name: string, schema: z.ZodType])[] = [
    ...Object.entries(SHARED_RULE_SCHEMAS).map(
        ([name, schema]) => ['rules', name, schema] as const
    ),
    ['scenarios', 'personas', personasSchema]
];

for (const [folder, name, schema] of EXPORTS) {
    // Zod 4's built-in exporter. https://zod.dev/json-schema
    const document = JSON.stringify(z.toJSONSchema(schema), undefined, 2);

    writeOrCheck(
        path.join(SHARED_DIRECTORY, folder, 'schemas', `${name}.schema.json`),
        `${document}\n`,
        `shared/${folder}/schemas/${name}.schema.json`,
        'npm run regenerate'
    );
}
