/**
 * A PUT and a PATCH on the same resource declare the same writable fields — AUDIT_0924 D17's
 * shared `createUpdateController` factory only works because `TReplace`/`TPatch` are the same
 * shape apart from which properties are `required`. A field added to one schema and forgotten on
 * the other is a field a PUT can set but a PATCH cannot, or the reverse — invisible in either
 * schema alone, since each is independently valid YAML.
 *
 * Read from the fragments, not the bundle — see `contract-error-declarations.test.ts`'s own note
 * on why: a failure in the bundle names a line nobody edits.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { MODULES_ROOT } from '@tests/paths';

/** One schema component's declared property names, keyed by the module fragment it came from. */
interface SchemaShape {
    module: string;
    name: string;
    properties: Set<string>;
}

/**
 * `Replace<Entity>Request`/`Patch<Entity>Request` name the same entity — `Replace` and `Patch`
 * are this repo's own two prefixes (AUDIT_0924 D17), never part of an entity's own name, so
 * stripping either leaves the same remainder for a matched pair. Excludes the `Multipart`
 * variant: the factory validates the JSON-shaped schema for both content types (D17d), so only
 * that one has to agree.
 */
const REPLACE_OR_PATCH = /^(Replace|Patch)(.+)Request$/;

/** Every `components.schemas` entry declared by every module's own contract fragment. */
const schemas = (): SchemaShape[] =>
    readdirSync(MODULES_ROOT)
        .map((module) => ({ module, file: path.join(MODULES_ROOT, module, 'openapi.yaml') }))
        .filter(({ file }) => existsSync(file))
        .flatMap(({ module, file }) => {
            const document = YAML.parse(readFileSync(file, 'utf8')) as {
                components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
            };

            return Object.entries(document.components?.schemas ?? {}).map(([name, schema]) => ({
                module,
                name,
                properties: new Set(Object.keys(schema.properties ?? {}))
            }));
        });

describe('Replace/Patch schema parity', () => {
    it('finds at least one declared pair — a canary against an empty sweep', () => {
        const matched = schemas().filter(({ name }) => REPLACE_OR_PATCH.test(name));
        expect(matched.length).toBeGreaterThanOrEqual(2);
    });

    it('declares the same property names on both verbs of every resource that has both', () => {
        const byEntity = new Map<string, SchemaShape[]>();
        for (const schema of schemas()) {
            const match = REPLACE_OR_PATCH.exec(schema.name);
            if (!match) continue;
            const entity = match[2];
            byEntity.set(entity, [...(byEntity.get(entity) ?? []), schema]);
        }

        const mismatches = [...byEntity.entries()]
            .filter(([, pair]) => pair.length === 2)
            .map(([entity, [first, second]]) => {
                const onlyInFirst = [...first.properties].filter((p) => !second.properties.has(p));
                const onlyInSecond = [...second.properties].filter(
                    (p) => !first.properties.has(p)
                );
                return { entity, first, second, onlyInFirst, onlyInSecond };
            })
            .filter(({ onlyInFirst, onlyInSecond }) => onlyInFirst.length + onlyInSecond.length > 0)
            .map(
                ({ entity, first, second, onlyInFirst, onlyInSecond }) =>
                    `${entity} (${first.module}): ${first.name} only has [${onlyInFirst.join(', ')}], ` +
                    `${second.name} only has [${onlyInSecond.join(', ')}]`
            );

        expect(mismatches).toEqual([]);
    });
});
