/**
 * @module
 * One module extending another module's open enums and unions, by a fragment of its own.
 *
 * A module that adds to what another module published ships `src/modules/<m>/openapi.<owner>.yaml`.
 * It carries an `x-extends` map and, for a union, the schemas the union gains:
 *
 * ```yaml
 * x-extends:
 *     TaskKind: [manual_refund_owed]           # an enum: values appended
 *     Notification: [ShopNoticeLowStock]       # a oneOf: schema names appended
 * components:
 *     schemas: { ShopNoticeLowStock: {...} }   # refs into the owner's file are made local
 * ```
 *
 * The owner opts in, by shape:
 * - an enum declares `x-enum-from: <its own name>` beside its written values (`./fill-enum`
 *   appends the extension's values after them);
 * - a union is a `oneOf`; each variant's discriminator value is read off its `code.enum`.
 *
 * Delete the extending module and its fragment goes with it: the owner's contract falls back to
 * its own values and variants. The owner never names the extension.
 *
 * Runs on the bundled document, like the other post-bundle steps in `./openapi-bundle`.
 * Not OpenAPI Overlay 1.0: that is OpenAPI only (AsyncAPI has no twin) and a new tool beside the
 * bundler's own `x-` steps.
 *
 * See: docs/api/contract-fragmentation.md#extending-another-modules-contract
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { OpenApiDocument, Step } from './openapi-document';
import { MODULES_ROOT } from '../modules-on-disk';

/** `openapi.<owner>.yaml`: the owner is the module whose contract the file extends. */
const FRAGMENT_NAME = /^openapi\.([a-z][a-z0-9-]*)\.yaml$/;

/** A `$ref` into a components section, whatever file it names (redocly would have made it local). */
const COMPONENT_REF = /^[^#]*#(\/components\/.+)$/;

/** A JSON object, as far as this step reads it. */
type Json = Record<string, unknown>;

/** One extending fragment, parsed. */
export interface ExtensionFragment {
    /** The module that ships the file. */
    module: string;
    /** The module whose contract it extends (from the file name). */
    owner: string;
    /** Absolute path, for the staleness check and error messages. */
    file: string;
    /** Schema name to the values (enum) or schema names (union) it appends. */
    extendsSchemas: Record<string, string[]>;
    /** The schemas the fragment adds to the document. */
    schemas: Record<string, unknown>;
}

/** Narrows a parsed node to an object. */
const isObject = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Narrows `x-extends` values to lists of strings. */
const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Parses one candidate file, or undefined when it is not an extension (no `x-extends`).
 *
 * @throws Error if `x-extends` is not a map of string lists
 */
const readFragment = (
    module: string,
    owner: string,
    file: string
): ExtensionFragment | undefined => {
    // `yaml`'s YAML 1.2 loader; the guards below narrow its `any`.
    const parsed: unknown = parseYaml(readFileSync(file, 'utf8'));
    if (!isObject(parsed) || parsed['x-extends'] === undefined) return undefined;
    const declared = parsed['x-extends'];
    if (!isObject(declared) || Object.values(declared).some((list) => !isStringList(list)))
        throw new Error(
            `[openapi] ${file}: x-extends must map a schema name to a list of strings.`
        );
    const { components } = parsed;
    const schemas = isObject(components) && isObject(components.schemas) ? components.schemas : {};
    return {
        module,
        owner,
        file,
        // Every value was checked to be a string list just above.
        extendsSchemas: declared as Record<string, string[]>,
        schemas
    };
};

/**
 * Every extending fragment, discovered from disk.
 *
 * @param modulesRoot - a `src/modules` directory (the real one, or a scratch tree)
 * @returns fragments ordered by module name, then file name
 */
export const extensionFragments = (modulesRoot: string = MODULES_ROOT): ExtensionFragment[] =>
    readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) =>
            readdirSync(path.join(modulesRoot, entry.name))
                .toSorted()
                .flatMap((name) => {
                    const owner = FRAGMENT_NAME.exec(name)?.[1];
                    if (owner === undefined) return [];
                    const fragment = readFragment(
                        entry.name,
                        owner,
                        path.join(modulesRoot, entry.name, name)
                    );
                    return fragment === undefined ? [] : [fragment];
                })
        );

/**
 * The values every fragment appends to each extended schema, for `withFilledEnums`.
 *
 * @param fragments - the discovered fragments
 * @returns schema name to its appended values, fragment order
 */
export const enumSourcesOf = (
    fragments: readonly ExtensionFragment[]
): Record<string, readonly string[]> => {
    const sources: Record<string, string[]> = {};
    for (const fragment of fragments)
        for (const [name, values] of Object.entries(fragment.extendsSchemas))
            sources[name] = [...(sources[name] ?? []), ...values];
    return sources;
};

/** The schema map of the document, created when absent. */
const schemasOf = (document_: OpenApiDocument): Record<string, unknown> => {
    document_.components ??= {};
    document_.components.schemas ??= {};
    return document_.components.schemas;
};

/**
 * Refuses an `x-extends` key whose target the owner did not open: missing, or an enum with no
 * `x-enum-from: <name>`, or neither an enum nor a `oneOf`.
 * Runs before `withFilledEnums`, which spends the marker.
 *
 * @param fragments - the discovered fragments
 * @returns the step
 * @throws Error naming the fragment and the schema
 */
export const checkExtensions =
    (fragments: readonly ExtensionFragment[]): Step =>
    (document_) => {
        const schemas = schemasOf(document_);
        for (const fragment of fragments)
            for (const name of Object.keys(fragment.extendsSchemas)) {
                const target = schemas[name];
                const where = `[openapi] ${fragment.file}: x-extends ${name}`;
                if (!isObject(target)) throw new Error(`${where} names no schema in the bundle.`);
                if (!Array.isArray(target.oneOf) && target['x-enum-from'] !== name)
                    throw new Error(
                        `${where} targets a schema that is neither a oneOf nor declares x-enum-from: ${name}.`
                    );
            }
    };

/** The discriminator value a variant carries: its `code.enum[0]`. */
const codeOf = (variant: unknown, where: string): string => {
    const code =
        isObject(variant) && isObject(variant.properties) ? variant.properties.code : undefined;
    const values: unknown = isObject(code) ? code.enum : undefined;
    const value: unknown = Array.isArray(values) ? values.at(0) : undefined;
    if (typeof value !== 'string')
        throw new Error(`${where} has no properties.code.enum to read its discriminator from.`);
    return value;
};

/** Points every `...#/components/...` ref inside the node at the bundle's own components. */
const localise = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map((item) => localise(item));
    if (!isObject(node)) return node;
    return Object.fromEntries(
        Object.entries(node).map(([key, value]) => {
            const local =
                key === '$ref' && typeof value === 'string' ? COMPONENT_REF.exec(value) : null;
            return [key, local ? `#${local[1]}` : localise(value)];
        })
    );
};

/** Adds the fragment's schemas to the document, refusing a name the document already holds. */
const mergeSchemas = (schemas: Record<string, unknown>, fragment: ExtensionFragment): void => {
    for (const [name, schema] of Object.entries(fragment.schemas)) {
        if (Object.hasOwn(schemas, name))
            throw new Error(
                `[openapi] ${fragment.file}: schema ${name} already exists in the bundle.`
            );
        schemas[name] = localise(schema);
    }
};

/** Appends one fragment's variants to a union, and to its discriminator mapping if it has one. */
const appendVariants = (
    union: Json,
    names: readonly string[],
    schemas: Record<string, unknown>,
    fragment: ExtensionFragment
): void => {
    const oneOf = union.oneOf as unknown[];
    const discriminator = isObject(union.discriminator) ? union.discriminator : undefined;
    const mapping =
        discriminator && isObject(discriminator.mapping) ? discriminator.mapping : undefined;
    for (const name of names) {
        const where = `[openapi] ${fragment.file}: variant ${name}`;
        if (!Object.hasOwn(fragment.schemas, name))
            throw new Error(`${where} is not declared in the fragment's components.`);
        const ref = `#/components/schemas/${name}`;
        oneOf.push({ $ref: ref });
        if (mapping === undefined) continue;
        const code = codeOf(schemas[name], where);
        if (Object.hasOwn(mapping, code))
            throw new Error(`${where} reuses the discriminator value ${code}.`);
        mapping[code] = ref;
    }
};

/**
 * Merges every fragment's schemas into the bundle and appends its variants to the unions it
 * extends. Enum keys are left to `withFilledEnums`.
 *
 * @param fragments - the discovered fragments
 * @returns the step; runs after redocly and before `pruneUnused`, so the variants are reached
 * @throws Error on a schema-name collision, an undeclared variant or a reused discriminator value
 */
export const withUnionExtensions =
    (fragments: readonly ExtensionFragment[]): Step =>
    (document_) => {
        const schemas = schemasOf(document_);
        for (const fragment of fragments) {
            mergeSchemas(schemas, fragment);
            for (const [name, variants] of Object.entries(fragment.extendsSchemas)) {
                const union = schemas[name];
                if (isObject(union) && Array.isArray(union.oneOf))
                    appendVariants(union, variants, schemas, fragment);
            }
        }
    };
