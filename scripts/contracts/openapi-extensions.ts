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
 *     schemas: { ShopNoticeLowStock: {...} }   # refs resolve like any module's, relative to the file
 * ```
 *
 * The owner opts in, by shape:
 * - an enum declares `x-enum-from: <its own name>` beside its written values (`./fill-enum`
 *   appends the extension's values after them);
 * - a union is a `oneOf`; each variant's discriminator value is read off its `code.enum`.
 *
 * The fragment's schemas reach the bundle through redocly, not a hand-made merge: each one is
 * staged as a `$ref` from the root ({@link withExtensionSchemas}), so a bad `$ref` in the
 * fragment fails the bundle like a bad one anywhere else, and its own `x-enum-from` is filled.
 *
 * Delete the extending module and its fragment goes with it: the owner's contract falls back to
 * its own values and variants. The owner never names the extension.
 *
 * Runs on the bundled document, like the other post-bundle steps in `./openapi-bundle`.
 * Not OpenAPI Overlay 1.0: that is OpenAPI only (AsyncAPI has no twin) and a new tool beside the
 * bundler's own `x-` steps.
 *
 * @see docs/build/contract-fragmentation.md#extending-another-modules-contract
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isMap, parse as parseYaml, parseDocument } from 'yaml';

import { parseExtendsMap, requireDeclared } from './extends-map';
import { readOpenApiFragment } from './fragments';
import type { OpenApiDocument, Step } from './openapi-document';
import { isPlainObject } from '../../src/infrastructure/object-guards';
import { MODULES_ROOT } from '../modules-on-disk';

/** `openapi.<owner>.yaml`: the owner is the module whose contract the file extends. */
const FRAGMENT_NAME = /^openapi\.([a-z][a-z0-9-]*)\.yaml$/;

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

/**
 * Parses one candidate file, or undefined when it is not an extension (no `x-extends`).
 *
 * @throws Error if `x-extends` is malformed (see {@link parseExtendsMap})
 */
const readFragment = (
    module: string,
    owner: string,
    file: string
): ExtensionFragment | undefined => {
    // `yaml`'s YAML 1.2 loader; the guards below narrow its `any`.
    const parsed: unknown = parseYaml(readFileSync(file, 'utf8'));
    /**
     * An empty or comment-only file would otherwise read as "not an extension" and silently drop
     * everything the module meant to add. A mapping without `x-extends` is another fragment kind.
     */
    if (!isPlainObject(parsed)) throw new Error(`[openapi] ${file}: fragment is empty.`);
    if (parsed['x-extends'] === undefined) return undefined;
    const extendsSchemas = parseExtendsMap(parsed['x-extends'], `[openapi] ${file}`);
    const { components } = parsed;
    const schemas =
        isPlainObject(components) && isPlainObject(components.schemas) ? components.schemas : {};
    return {
        module,
        owner,
        file,
        extendsSchemas,
        schemas
    };
};

/**
 * Refuses a fragment whose owner module does not exist, or does not declare an extended schema.
 *
 * @throws Error naming the fragment and the missing owner or schema
 */
const requireOwner = (fragment: ExtensionFragment, modulesRoot: string): void => {
    const where = `[openapi] ${fragment.file}`;
    const ownerFile = path.join(modulesRoot, fragment.owner, 'openapi.yaml');
    if (!existsSync(ownerFile))
        throw new Error(`${where}: the owner module ${fragment.owner} ships no openapi.yaml.`);
    const declared = readOpenApiFragment(ownerFile).components?.schemas ?? {};
    for (const name of Object.keys(fragment.extendsSchemas))
        if (!Object.hasOwn(declared, name))
            throw new Error(`${where}: x-extends ${name} is not a schema of ${fragment.owner}.`);
};

/**
 * Every extending fragment, discovered from disk.
 *
 * @param modulesRoot - a `src/modules` directory (the real one, or a scratch tree)
 * @returns fragments ordered by module name, then file name
 * @throws Error if a fragment is malformed or extends a module or schema that does not exist
 */
export const extensionFragments = (modulesRoot: string = MODULES_ROOT): ExtensionFragment[] => {
    const found = readdirSync(modulesRoot, { withFileTypes: true })
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
    for (const fragment of found) requireOwner(fragment, modulesRoot);
    return found;
};

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
                if (!isPlainObject(target))
                    throw new Error(`${where} names no schema in the bundle.`);
                if (!Array.isArray(target.oneOf) && target['x-enum-from'] !== name)
                    throw new Error(
                        `${where} targets a schema that is neither a oneOf nor declares x-enum-from: ${name}.`
                    );
            }
    };

/**
 * The discriminator value a variant carries: its `<propertyName>.enum[0]`.
 * @throws {Error} when the variant declares no enum for the discriminator property
 */
const discriminatorValueOf = (variant: unknown, property: string, where: string): string => {
    const field =
        isPlainObject(variant) && isPlainObject(variant.properties)
            ? variant.properties[property]
            : undefined;
    const values: unknown = isPlainObject(field) ? field.enum : undefined;
    const value: unknown = Array.isArray(values) ? values.at(0) : undefined;
    if (typeof value !== 'string')
        throw new Error(
            `${where} has no properties.${property}.enum to read its discriminator from.`
        );
    return value;
};

/**
 * The root text with every fragment schema added as a `$ref` to the staged copy of its file.
 *
 * Redocly then resolves the fragment's own refs, fills its `x-enum-from`, and fails the bundle on
 * a ref that answers nothing, exactly as it does for any module's `openapi.yaml`.
 *
 * @param rootText - the assembled root document
 * @param fragments - the discovered fragments
 * @param modulesRoot - the `src/modules` the fragments were discovered under
 * @returns the root text to stage; the fragments are staged at `src/modules/<module>/<file>`
 * @throws Error if the root already declares a schema a fragment adds
 */
export const withExtensionSchemas = (
    rootText: string,
    fragments: readonly ExtensionFragment[],
    modulesRoot: string = MODULES_ROOT
): string => {
    if (fragments.length === 0) return rootText;
    /**
     * `yaml`'s Document API: edited in place, so the root keeps its shape.
     * https://eemeli.org/yaml/#documents
     */
    const document = parseDocument(rootText);
    const schemas = document.getIn(['components', 'schemas']);
    for (const fragment of fragments)
        for (const name of Object.keys(fragment.schemas)) {
            if (isMap(schemas) && schemas.has(name))
                throw new Error(
                    `[openapi] ${fragment.file}: schema ${name} already exists in the root.`
                );
            const staged = path.relative(modulesRoot, fragment.file).split(path.sep).join('/');
            document.setIn(['components', 'schemas', name], {
                $ref: `../../src/modules/${staged}#/components/schemas/${name}`
            });
        }
    return document.toString({ lineWidth: 0, indent: 4 });
};

/**
 * Appends one fragment's variants to a union, and to its discriminator mapping if it has one.
 * @throws {Error} when a variant reuses a discriminator value already in the union
 */
const appendVariants = (
    union: Json,
    names: readonly string[],
    schemas: Record<string, unknown>,
    fragment: ExtensionFragment
): void => {
    // A union schema carries a `oneOf` list; the caller picks only unions.
    const oneOf = union.oneOf as unknown[];
    const discriminator = isPlainObject(union.discriminator) ? union.discriminator : undefined;
    const mapping =
        discriminator && isPlainObject(discriminator.mapping) ? discriminator.mapping : undefined;
    const property =
        typeof discriminator?.propertyName === 'string' ? discriminator.propertyName : undefined;
    requireDeclared(names, fragment.schemas, `[openapi] ${fragment.file}`);
    for (const name of names) {
        const where = `[openapi] ${fragment.file}: variant ${name}`;
        const ref = `#/components/schemas/${name}`;
        oneOf.push({ $ref: ref });
        if (mapping === undefined || property === undefined) continue;
        const value = discriminatorValueOf(schemas[name], property, where);
        if (Object.hasOwn(mapping, value))
            throw new Error(`${where} reuses the discriminator value ${value}.`);
        mapping[value] = ref;
    }
};

/**
 * Moves each fragment's schemas to the end of the schema map, in fragment order. Redocly places
 * them where it first meets them; the end is where the contract has always listed an extension,
 * and the generators declare in map order, so the order is part of the output.
 */
const moveToEnd = (schemas: Record<string, unknown>, fragments: readonly ExtensionFragment[]) => {
    for (const fragment of fragments)
        for (const name of Object.keys(fragment.schemas)) {
            const schema = schemas[name];
            // `delete`: the key must leave its place for the re-add to land last.
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- the name is data from the fragment
            delete schemas[name];
            schemas[name] = schema;
        }
};

/**
 * Appends every fragment's variants to the unions it extends. The variants' schemas are already in
 * the bundle ({@link withExtensionSchemas}); enum keys are left to `withFilledEnums`.
 *
 * @param fragments - the discovered fragments
 * @returns the step; runs after redocly and before `pruneUnused`, so the variants are reached
 * @throws Error on an undeclared variant or a reused discriminator value
 */
export const withUnionExtensions =
    (fragments: readonly ExtensionFragment[]): Step =>
    (document_) => {
        const schemas = schemasOf(document_);
        moveToEnd(schemas, fragments);
        for (const fragment of fragments)
            for (const [name, variants] of Object.entries(fragment.extendsSchemas)) {
                const union = schemas[name];
                if (isPlainObject(union) && Array.isArray(union.oneOf))
                    appendVariants(union, variants, schemas, fragment);
            }
    };
