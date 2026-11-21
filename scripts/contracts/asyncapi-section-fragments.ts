/**
 * The AsyncAPI fragments modules ship for a section they do not own: the webhook events each
 * module owns (`webhooks`), the notice payloads a module adds to `notifications`, and the domain
 * events each module emits (`domain-events`, backend-only).
 *
 * Merge:    `src/modules/<m>/asyncapi.<section>.yaml` merges into that section's document, only.
 * Extends:  a fragment may carry `x-extends: { <Schema>: [<SchemaName>, ...] }`; each name is
 *           appended as a `$ref` to that schema's `oneOf`, so the owner's union opens to
 *           extension and never names the extender. Read by `./extends-map`, as on the OpenAPI side.
 * Enums:    a payload field with a closed set `$ref`s the owning module's `./openapi.yaml` schema
 *           instead of copying its enum. The bundle must stand alone, so the merge copies each
 *           referenced schema into the fragment's `components.schemas` just before the first
 *           schema using it (the Zod emitter declares in order) and points the ref at the copy.
 *           An OPEN enum (extended by modules, marked `x-enum-from`) is refused: the copy would
 *           be the owner's raw file, without the extenders' values.
 * Own file: the bundler meets it at one call (`withSectionFragments`) and the discovery rule stays
 *           testable. Webhook-event names built on it live in `./asyncapi-webhook-events`.
 *
 * @see docs/build/contract-fragmentation.md#module-owned-webhook-events
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    isMap,
    isNode,
    isScalar,
    isSeq,
    parseDocument,
    visit,
    type Document,
    type Node
} from 'yaml';

import { readOpenApiFragment, type OpenApiFragment } from './fragments';
import { orderSections } from './section-order';
import { parseExtendsMap, requireDeclared } from './extends-map';
import { MODULES_ROOT, modulesWith } from '../modules-on-disk';

/** Narrative order for the shop's webhook fragments; the rest follow alphabetically (a preference, not a registry). */
const WEBHOOK_ORDER: readonly string[] = ['orders', 'delivery', 'payments', 'returns'];

/**
 * Every module's fragment for one section, discovered from disk.
 *
 * @param section - the section the fragments merge into (`webhooks`, `notifications`)
 * @param modulesRoot - a `src/modules` directory (the real one, or a test's scratch tree)
 * @returns absolute paths; webhook fragments in {@link WEBHOOK_ORDER}, then alphabetically
 */
export const sectionFragments = (section: string, modulesRoot: string = MODULES_ROOT): string[] => {
    const file = `asyncapi.${section}.yaml`;
    const owners = modulesWith(modulesRoot, file);
    const preferred = section === 'webhooks' ? WEBHOOK_ORDER : [];
    return orderSections(preferred, owners).map((name) => path.join(modulesRoot, name, file));
};

/**
 * Stamped on every schema copied in from the REST contract, naming the schema it was copied from.
 * The type generators read it to import that type instead of declaring a second one.
 */
const OPENAPI_SCHEMA_MARKER = 'x-openapi-schema';

/**
 * A `$ref` into a REST contract: the fragment's own module (`./openapi.yaml`) or a sibling's
 * (`../<module>/openapi.yaml`). The last capture is the schema's name.
 */
const OPENAPI_SCHEMA_REF = /^(?:\.\/|\.\.\/([\w-]+)\/)openapi\.yaml#\/components\/schemas\/(\w+)$/;

/** One REST schema a fragment references: its name, and the module folder it lives in when not the fragment's own. */
interface RestReference {
    /** The REST schema's name. */
    name: string;
    /** The module folder it lives in; absent when it is the fragment's own. */
    sibling: string | undefined;
}

/**
 * Every REST-schema `$ref` inside one node, rewritten to point at the same name in the fragment
 * itself.
 *
 * @param node - a schema of the fragment
 * @returns what it referenced, in order of appearance, each name once
 */
const localiseReferencesIn = (node: Node): RestReference[] => {
    const found = new Map<string, RestReference>();
    // `yaml`'s `visit`: walks every pair of the node. https://eemeli.org/yaml/#visitors
    visit(node, {
        Pair(_key, pair) {
            const target = pair.value;
            if (!isScalar(pair.key) || pair.key.value !== '$ref' || !isScalar(target)) return;
            const match = OPENAPI_SCHEMA_REF.exec(String(target.value));
            if (match === null) return;
            const [, sibling, name] = match;
            found.set(name, { name, sibling });
            target.value = `#/components/schemas/${name}`;
        }
    });
    return [...found.values()];
};

/**
 * One REST schema, ready to sit among the fragment's own.
 *
 * @throws Error when the schema is missing, holds a `$ref` (the copy would point nowhere) or is an open enum
 */
const restSchemaOf = (rest: OpenApiFragment, openapiFile: string, name: string): object => {
    const source = rest.components?.schemas?.[name];
    if (typeof source === 'object' && source !== null && 'x-enum-from' in source)
        throw new Error(
            `[asyncapi] ${openapiFile}: ${name} is an open enum (x-enum-from), so a copy would lose the values modules extend it with.`
        );
    if (typeof source !== 'object' || source === null || JSON.stringify(source).includes('"$ref"'))
        throw new Error(
            `[asyncapi] ${openapiFile} has no self-contained schema ${name} for the fragment to reference.`
        );
    return source;
};

/**
 * Copies the REST schemas a fragment references into the fragment, so the bundle needs no file
 * beside it, and rewrites the refs to the copies.
 *
 * Each copy is inserted before the first schema that uses it, because the Zod emitter declares in
 * order, and stamps it with {@link OPENAPI_SCHEMA_MARKER}. A `../<module>/openapi.yaml` ref reads
 * the sibling module's file (the fragment of a module extending another one's payloads).
 *
 * @param fragment - the fragment's parsed document, edited in place
 * @param openapiFile - the fragment's own module's `openapi.yaml` (it need not exist unless referenced)
 * @throws Error when a referenced schema is missing, holds a `$ref` or is an open enum, or the fragment declares the same name itself
 */
export const localiseOpenApiReferences = (fragment: Document, openapiFile: string): void => {
    // `true`: keep the node (not its plain value), so `isMap` can see it.
    const schemas = fragment.getIn(['components', 'schemas'], true);
    if (!isMap(schemas)) return;

    // Rewrites every ref first, so a REST file is read only when something references it.
    const users = schemas.items
        .flatMap((item) =>
            isNode(item.value) ? [{ item, references: localiseReferencesIn(item.value) }] : []
        )
        .filter(({ references }) => references.length > 0);
    if (users.length === 0) return;

    const copied = new Set<string>();
    for (const { item, references } of users)
        for (const { name, sibling } of references.filter(({ name: n }) => !copied.has(n))) {
            const file =
                sibling === undefined
                    ? openapiFile
                    : path.join(path.dirname(path.dirname(openapiFile)), sibling, 'openapi.yaml');
            if (schemas.has(name))
                throw new Error(
                    `[asyncapi] the fragment beside ${file} declares ${name} itself and also references it.`
                );
            const copy = fragment.createPair(
                name,
                fragment.createNode({
                    ...restSchemaOf(readOpenApiFragment(file), file, name),
                    [OPENAPI_SCHEMA_MARKER]: name
                })
            );
            schemas.items.splice(schemas.items.indexOf(item), 0, copy);
            copied.add(name);
        }
};

/** A `$ref` to a schema of the same document: the capture is its name. */
const LOCAL_SCHEMA_REF = /^#\/components\/schemas\/(\w+)$/;

/**
 * Every schema name one node references.
 *
 * @param node - a schema of the section
 */
const localReferencesIn = (node: unknown): string[] => {
    const found = new Set<string>();
    // `yaml`'s `visit`: walks every pair of the node. https://eemeli.org/yaml/#visitors
    if (isNode(node))
        visit(node, {
            Pair(_key, pair) {
                if (!isScalar(pair.key) || pair.key.value !== '$ref' || !isScalar(pair.value))
                    return;
                const match = LOCAL_SCHEMA_REF.exec(String(pair.value.value));
                if (match !== null) found.add(match[1]);
            }
        });
    return [...found];
};

/**
 * Appends each `x-extends` name to its schema's `oneOf` in the section document.
 *
 * @param document - the section's document, edited in place
 * @param fragment - the fragment's parsed document, read for `x-extends` and its own schemas
 * @param label - the fragment's name for the message
 * @throws Error when the map is malformed, a target is not a `oneOf` of the section, a name is not
 *   declared in the fragment, or the union already holds it
 */
const appendExtensions = (document: Document, fragment: Document, label: string): void => {
    // `toJS`: plain values for the shared reader; the section's own nodes stay untouched.
    const plain: unknown = fragment.toJS();
    const declaredMap =
        typeof plain === 'object' && plain !== null
            ? (plain as {
                  'x-extends'?: unknown;
                  components?: { schemas?: Record<string, unknown> };
              })
            : {};
    if (declaredMap['x-extends'] === undefined) return;
    const where = `[asyncapi] ${label}`;
    const extended = parseExtendsMap(declaredMap['x-extends'], where);
    for (const [target, names] of Object.entries(extended)) {
        const union = document.getIn(['components', 'schemas', target, 'oneOf'], true);
        if (!isSeq(union))
            throw new Error(`${where}: x-extends ${target} names no oneOf in the section.`);
        requireDeclared(names, declaredMap.components?.schemas ?? {}, where);
        for (const name of names) {
            const ref = `#/components/schemas/${name}`;
            if (localReferencesIn(union).includes(name))
                throw new Error(`${where}: ${target} already holds ${name}.`);
            union.add(document.createNode({ $ref: ref }));
        }
    }
};

/**
 * Puts every schema after the schemas it references. The Zod emitter declares in order, and an
 * extended union is written before the variants a fragment appends to it, so it must move behind
 * them. A schema already after its references keeps its place, so a section nobody extends is
 * left as written.
 *
 * @param document - the section's document, edited in place
 */
const orderByReference = (document: Document): void => {
    const schemas = document.getIn(['components', 'schemas'], true);
    if (!isMap(schemas)) return;

    const byName = new Map(
        schemas.items.map((pair) => [String(isScalar(pair.key) ? pair.key.value : pair.key), pair])
    );
    const ordered: typeof schemas.items = [];
    const placed = new Set<string>();
    const place = (name: string): void => {
        const pair = byName.get(name);
        if (placed.has(name) || pair === undefined) return;
        // Marked before its references are placed, so a cycle stops instead of looping.
        placed.add(name);
        for (const reference of localReferencesIn(pair.value)) place(reference);
        ordered.push(pair);
    };
    for (const name of byName.keys()) place(name);
    schemas.items = ordered;
};

/**
 * Folds every module's fragment for this section into the section's document.
 *
 * @param section - the section being read, as the bundler names it
 * @param document - that section's own parsed document
 * @param merge - the bundler's merge, which refuses a key two owners both declare
 * @param modulesRoot - a `src/modules` directory (the real one, or a test's scratch tree)
 * @returns the same document, now carrying every fragment's channels, messages and schemas, and
 *   the `x-extends` names appended to the unions they extend
 */
export const withSectionFragments = (
    section: string,
    document: Document,
    merge: (target: Document, label: string, source: Document) => void,
    modulesRoot: string = MODULES_ROOT
): Document => {
    for (const fragment of sectionFragments(section, modulesRoot)) {
        // `yaml`'s `parseDocument`, keeping source tokens so each node keeps its authored style.
        const parsed = parseDocument(readFileSync(fragment, 'utf8'), { keepSourceTokens: true });
        const label = path.basename(path.dirname(fragment));
        localiseOpenApiReferences(parsed, path.join(path.dirname(fragment), 'openapi.yaml'));
        merge(document, label, parsed);
        appendExtensions(document, parsed, `${label} fragment`);
        if (parsed.has('x-extends')) orderByReference(document);
    }
    return document;
};
