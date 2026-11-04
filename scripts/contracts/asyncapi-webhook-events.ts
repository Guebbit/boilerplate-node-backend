/**
 * The AsyncAPI fragments modules ship for a section they do not own: the webhook events each module
 * owns (`webhooks`), and the notice payloads a module adds to `notifications`.
 *
 * `src/modules/<m>/asyncapi.<section>.yaml` merges into that section's document, and only into it.
 * A fragment may carry `x-extends: { <Schema>: [<SchemaName>, ...] }`: each name is appended as a
 * `$ref` to that schema's `oneOf` (the owner's union opens to extension; it never names the extender).
 *
 * Webhook events, in detail:
 *
 * A module that fires a public webhook ships `src/modules/<m>/asyncapi.webhooks.yaml`: its
 * channels, operations, messages and payload schemas. The bundler merges those fragments into the
 * `webhooks` section, and only into it, so a deployment without `webhooks` carries none of them,
 * and a deployment without `orders` carries no `order.*` channel. Same principle as the OpenAPI
 * side: a module's contract leaves with the module.
 *
 * A payload field with a closed set of values `$ref`s the owning module's `./openapi.yaml` schema
 * instead of copying its enum. The bundle has to stand alone, so the merge copies each referenced
 * schema into the fragment's own `components.schemas`, just before the first schema that uses it
 * (the Zod emitter declares in order), and points the ref at the copy.
 *
 * Its own file so the bundler meets it at one call (`withSectionFragments`) and the discovery rule
 * stays testable on its own.
 *
 * See: docs/api/contract-fragmentation.md#module-owned-webhook-events
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    isMap,
    isNode,
    isScalar,
    isSeq,
    parse,
    parseDocument,
    visit,
    type Document,
    type Node
} from 'yaml';

import { readOpenApiFragment, type OpenApiFragment } from './fragments';
import { orderSections } from './section-order';
import { MODULES_ROOT, modulesWith } from '../modules-on-disk';

/** The AsyncAPI section the webhook-event fragments merge into: the `webhooks` module's own. */
const WEBHOOKS_SECTION = 'webhooks';

/** Narrative order for the shop's webhook fragments; the rest follow alphabetically (a preference, not a registry). */
const FRAGMENT_ORDER: readonly string[] = ['orders', 'delivery', 'payments', 'returns'];

/**
 * Every module's fragment for one section, discovered from disk.
 *
 * @param section - the section the fragments merge into (`webhooks`, `notifications`)
 * @param modulesRoot - a `src/modules` directory (the real one, or a test's scratch tree)
 * @returns absolute paths; webhook fragments in {@link FRAGMENT_ORDER}, then alphabetically
 */
export const sectionFragments = (section: string, modulesRoot: string = MODULES_ROOT): string[] => {
    const file = `asyncapi.${section}.yaml`;
    const owners = modulesWith(modulesRoot, file);
    const preferred = section === WEBHOOKS_SECTION ? FRAGMENT_ORDER : [];
    return orderSections(preferred, owners).map((name) => path.join(modulesRoot, name, file));
};

/**
 * Every module's webhook-event fragment, discovered from disk.
 *
 * @returns absolute paths, in {@link FRAGMENT_ORDER} then alphabetically
 */
export const webhookEventFragments = (): string[] => sectionFragments(WEBHOOKS_SECTION);

/**
 * The name of every webhook event any module ships: the channel keys of its fragment.
 *
 * What a subscription's `eventTypes` may name, so the REST contract fills its enum from here
 * instead of copying the list. Fragment order, then channel order within each.
 *
 * @returns each event name once
 */
export const webhookEventNames = (): string[] =>
    webhookEventFragments().flatMap((file) =>
        // `yaml`'s `parse`: a plain object back, no custom tags in a fragment.
        // https://eemeli.org/yaml/#parse-yaml-to-json-value
        Object.keys((parse(readFileSync(file, 'utf8')) as { channels?: object }).channels ?? {})
    );

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
    name: string;
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
 * @throws Error when the schema is missing or holds a `$ref` (the copy would point nowhere)
 */
const restSchemaOf = (rest: OpenApiFragment, openapiFile: string, name: string): object => {
    const source = rest.components?.schemas?.[name];
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
 * @throws Error when a referenced schema is missing or holds a `$ref`, or the fragment declares the same name itself
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

/**
 * Appends each `x-extends` name to its schema's `oneOf` in the section document.
 *
 * @throws Error when the target is not a `oneOf` of the section
 */
const appendExtensions = (document: Document, extended: unknown, label: string): void => {
    if (!isMap(extended)) return;
    for (const { key, value } of extended.items) {
        const union = document.getIn(['components', 'schemas', String(key), 'oneOf'], true);
        if (!isSeq(union))
            throw new Error(
                `[asyncapi] ${label}: x-extends ${String(key)} names no oneOf in the section.`
            );
        const names = isSeq(value)
            ? value.items.map((item) => String(isScalar(item) ? item.value : item))
            : [];
        for (const name of names)
            union.add(document.createNode({ $ref: `#/components/schemas/${name}` }));
    }
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
        appendExtensions(document, parsed.get('x-extends', true), `${label} fragment`);
    }
    return document;
};
