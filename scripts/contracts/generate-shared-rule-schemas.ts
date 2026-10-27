#!/usr/bin/env tsx
/**
 * Everything `regenerate` derives from the shared rules files, in one step:
 *
 * - `shared/<folder>/schemas/<name>.schema.json`: each file's Zod schema as JSON Schema. The PHP
 *   twin has no Zod, so it validates with any JSON Schema library.
 * - `<out>.generated.ts`: for a rules file that types a union or holds plain numbers, the
 *   committed `as const` TypeScript code imports instead of reading the YAML.
 *
 * Module-owned rules (`src/modules/<m>/rules.yaml` + `rules.schema.ts`) are discovered, not listed.
 * `--check` reports a stale file instead of rewriting it.
 *
 * See: docs/theory/shared-rules.md
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { MODULES_ROOT, REPO_ROOT, modulesWith } from '../modules-on-disk';
import { failScript } from '../fail-script';
import { formatWithRepoConfig } from '../scaffold/format-text';
import { writeOrCheck } from './generated-file';
import { renderGenerated } from './shared-rules-render';
import type { GenerateSpec } from '../../src/infrastructure/config/shared-rules/generate-spec';
import { SHARED_RULES } from '../../src/infrastructure/config/shared-rules/registry';
import { personasSchema } from '../../scenarios/personas-schema';
import { rateLimitsBlockSchema } from '../../src/infrastructure/config/shared-rules/rate-limits';

/** The folder every exported schema is committed under, beside its data. */
const SHARED_DIRECTORY = path.join(REPO_ROOT, 'shared');

/** A rules file to generate TypeScript from: where it is, how it is checked, what it writes. */
interface GeneratedSource {
    /** Repo-relative path of the YAML. */
    source: string;
    schema: z.ZodType;
    spec: GenerateSpec;
}

/**
 * Every schema and the folder it is committed in. The demo accounts' schema lives in `scenarios/`
 * because infrastructure must not import it, so it is listed here, not in the registry.
 */
const SCHEMA_EXPORTS: readonly (readonly [folder: string, name: string, schema: z.ZodType])[] = [
    ...Object.entries(SHARED_RULES).map(([name, entry]) => ['rules', name, entry.schema] as const),
    ['scenarios', 'personas', personasSchema]
];

/** Writes (or checks) the JSON Schema of every rules file. */
const writeSchemas = (): void => {
    for (const [folder, name, schema] of SCHEMA_EXPORTS) {
        // Zod 4's built-in exporter. https://zod.dev/json-schema
        const document = JSON.stringify(z.toJSONSchema(schema), undefined, 2);

        writeOrCheck(
            path.join(SHARED_DIRECTORY, folder, 'schemas', `${name}.schema.json`),
            `${document}\n`,
            `shared/${folder}/schemas/${name}.schema.json`,
            'npm run regenerate'
        );
    }
};

/**
 * Loads a module's `rules.schema.ts`: its schema and its generate spec.
 *
 * @param moduleName - the module's folder name
 * @returns what to generate from `rules.yaml`
 */
const loadModuleSource = (moduleName: string): Promise<GeneratedSource> =>
    import(path.join(MODULES_ROOT, moduleName, 'rules.schema.ts')).then(
        (loaded: { rulesSchema: z.ZodType; rulesGenerate: GenerateSpec }) => ({
            source: `src/modules/${moduleName}/rules.yaml`,
            schema: loaded.rulesSchema,
            spec: loaded.rulesGenerate
        })
    );

/** The camelCase of a folder name (`some-module` becomes `someModule`). */
const camelCaseOf = (name: string): string =>
    name.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** A `module.yaml` seen only for its `rateLimits:` block; the rest is the descriptor's business. */
const moduleRateLimitsSchema = z.looseObject({ rateLimits: rateLimitsBlockSchema });

/**
 * The generated budgets file of every module whose `module.yaml` declares `rateLimits:`.
 *
 * @returns one source per such module
 */
const collectRateLimitSources = (): GeneratedSource[] =>
    modulesWith(MODULES_ROOT, 'module.yaml').flatMap((moduleName) => {
        const source = `src/modules/${moduleName}/module.yaml`;
        const parsed = parse(readFileSync(path.join(REPO_ROOT, source), 'utf8')) as
            | Record<string, unknown>
            | undefined;
        if (!parsed || !('rateLimits' in parsed)) return [];
        return [
            {
                source,
                schema: moduleRateLimitsSchema,
                spec: {
                    out: `src/modules/${moduleName}/rate-limits.generated.ts`,
                    exports: [
                        {
                            exportName: `${camelCaseOf(moduleName)}RateLimitData`,
                            shape: 'verbatim' as const,
                            field: 'rateLimits',
                            description: `${moduleName}'s rate-limit budgets as data; \`rate-limits.ts\` adds their key and skip logic.`
                        }
                    ]
                }
            }
        ];
    });

/** Every rules file that generates TypeScript: the registry's, each module's, then the budgets. */
const collectSources = (): Promise<GeneratedSource[]> =>
    Promise.all(
        modulesWith(MODULES_ROOT, 'rules.yaml').map((moduleName) => loadModuleSource(moduleName))
    ).then((moduleSources) => [
        ...Object.entries(SHARED_RULES).flatMap(([name, entry]) =>
            entry.generate
                ? [
                      {
                          source: `shared/rules/${name}.yaml`,
                          schema: entry.schema,
                          spec: entry.generate
                      }
                  ]
                : []
        ),
        ...moduleSources,
        ...collectRateLimitSources()
    ]);

/**
 * Validates one rules file and writes (or checks) its generated TypeScript.
 *
 * @param entry - the file and its spec
 * @returns once the file is written or checked
 */
const writeGenerated = (entry: GeneratedSource): Promise<void> => {
    const absolute = path.join(REPO_ROOT, entry.spec.out);
    // `yaml`'s `parse` throws on a syntax error, naming the line.
    const parsed: unknown = parse(readFileSync(path.join(REPO_ROOT, entry.source), 'utf8'));
    const document = entry.schema.parse(parsed);

    return formatWithRepoConfig(
        REPO_ROOT,
        absolute,
        renderGenerated(entry.source, entry.spec, document)
    ).then((text) => {
        writeOrCheck(absolute, text, entry.source, 'npm run regenerate');
    });
};

writeSchemas();
collectSources()
    .then((sources) => Promise.all(sources.map((entry) => writeGenerated(entry))))
    .catch(failScript);
