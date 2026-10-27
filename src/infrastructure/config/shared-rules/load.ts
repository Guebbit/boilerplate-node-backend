/**
 * @module
 * Loads a rule table that both backends read: `shared/rules/<name>.yaml`, parsed and checked
 * against its Zod schema once, at boot. A broken file fails the boot, never a request.
 *
 * Relative imports only: the logger reads its redaction lists through here, and the logger is on
 * jest's `globalSetup` import chain, which runs outside path-alias resolution.
 *
 * See: docs/theory/shared-rules.md
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * The repo-root `shared/` directory. `__dirname`, not `import.meta.url`: the same reason as
 * `i18n/catalog.ts`'s `LOCALES_DIRECTORY`.
 */
export const SHARED_DIRECTORY = path.join(__dirname, '..', '..', '..', '..', 'shared');

/** The repo-root `shared/rules/` directory: the rules both backends read. */
export const SHARED_RULES_DIRECTORY = path.join(SHARED_DIRECTORY, 'rules');

/** The folders under `shared/` that hold schema-checked YAML. */
export type SharedRulesFolder = 'rules' | 'scenarios';

/**
 * Reads and validates one shared rules file.
 *
 * Types come from `z.infer` on `schema`, so there is no type codegen on the Node side.
 * https://zod.dev/api (`safeParse`, `prettifyError`)
 *
 * @param name - the file's name under `shared/<folder>/`, without `.yaml`
 * @param schema - the Zod schema the parsed document must satisfy
 * @param folder - which folder under `shared/` holds the file
 * @returns the typed document
 * @throws {Error} naming the file and every issue the schema found
 */
export const loadSharedRules = <T>(
    name: string,
    schema: z.ZodType<T>,
    folder: SharedRulesFolder = 'rules'
): T => {
    const file = `${name}.yaml`;
    // `yaml`'s `parse` throws on a syntax error, naming the line.
    const parsed: unknown = parse(readFileSync(path.join(SHARED_DIRECTORY, folder, file), 'utf8'));
    const result = schema.safeParse(parsed);

    if (!result.success) {
        throw new Error(
            `[shared-rules] shared/${folder}/${file} does not match its schema:\n${z.prettifyError(result.error)}`
        );
    }

    return result.data;
};
