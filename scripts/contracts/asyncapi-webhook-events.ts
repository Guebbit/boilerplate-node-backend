/**
 * The webhook events each module owns, assembled into the `webhooks` AsyncAPI section.
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
 * Its own file so the bundler meets it at one call (`withWebhookEvents`) and the discovery rule
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
    parse,
    parseDocument,
    visit,
    type Document,
    type Node
} from 'yaml';

import { orderSections } from './section-order';
import { MODULES_ROOT, modulesWith } from '../modules-on-disk';

/** The AsyncAPI section the fragments merge into: the `webhooks` module's own. */
const WEBHOOKS_SECTION = 'webhooks';

/** The file name a module owning webhook events ships. */
const FRAGMENT_FILE = 'asyncapi.webhooks.yaml';

/** Narrative order for the shop's modules; the rest follow alphabetically (a preference, not a registry). */
const FRAGMENT_ORDER: readonly string[] = ['orders', 'delivery', 'payments', 'returns'];

/**
 * Every module's webhook-event fragment, discovered from disk.
 *
 * @returns absolute paths, in {@link FRAGMENT_ORDER} then alphabetically
 */
export const webhookEventFragments = (): string[] => {
    const owners = modulesWith(MODULES_ROOT, FRAGMENT_FILE);
    return orderSections(FRAGMENT_ORDER, owners).map((name) =>
        path.join(MODULES_ROOT, name, FRAGMENT_FILE)
    );
};

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

/** A `$ref` into the owning module's REST contract; the capture is the schema's name. */
const OPENAPI_SCHEMA_REF = /^\.\/openapi\.yaml#\/components\/schemas\/(\w+)$/;

/**
 * Every REST-schema `$ref` inside one node, rewritten to point at the same name in the fragment
 * itself.
 *
 * @param node - a schema of the fragment
 * @returns the names it referenced, in order of appearance, each once
 */
const localiseReferencesIn = (node: Node): string[] => {
    const names = new Set<string>();
    // `yaml`'s `visit`: walks every pair of the node. https://eemeli.org/yaml/#visitors
    visit(node, {
        Pair(_key, pair) {
            const target = pair.value;
            if (!isScalar(pair.key) || pair.key.value !== '$ref' || !isScalar(target)) return;
            const name = OPENAPI_SCHEMA_REF.exec(String(target.value))?.[1];
            if (name === undefined) return;
            names.add(name);
            target.value = `#/components/schemas/${name}`;
        }
    });
    return [...names];
};

/** The REST contract's schemas, as a plain object, from a module's `openapi.yaml`. */
interface RestSchemas {
    components?: { schemas?: Record<string, unknown> };
}

/**
 * One REST schema, ready to sit among the fragment's own.
 *
 * @throws Error when the schema is missing or holds a `$ref` (the copy would point nowhere)
 */
const restSchemaOf = (rest: RestSchemas, openapiFile: string, name: string): object => {
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
 * order, and stamps it with {@link OPENAPI_SCHEMA_MARKER}.
 *
 * @param fragment - the fragment's parsed document, edited in place
 * @param openapiFile - the module's `openapi.yaml`
 * @throws Error when a referenced schema is missing or holds a `$ref`, or the fragment declares the same name itself
 */
export const localiseOpenApiReferences = (fragment: Document, openapiFile: string): void => {
    const schemas = fragment.getIn(['components', 'schemas'], true);
    if (!isMap(schemas)) return;

    // Rewrites every ref first, so the REST file is read only when something references it.
    const users = schemas.items
        .flatMap((item) =>
            isNode(item.value) ? [{ item, names: localiseReferencesIn(item.value) }] : []
        )
        .filter(({ names }) => names.length > 0);
    if (users.length === 0) return;

    // `yaml`'s `parse`: a plain object back, which `createNode` turns into AST nodes.
    const rest = parse(readFileSync(openapiFile, 'utf8')) as RestSchemas;
    const copied = new Set<string>();
    for (const { item, names } of users)
        for (const name of names.filter((candidate) => !copied.has(candidate))) {
            if (schemas.has(name))
                throw new Error(
                    `[asyncapi] the fragment beside ${openapiFile} declares ${name} itself and also references it.`
                );
            const copy = fragment.createPair(
                name,
                fragment.createNode({
                    ...restSchemaOf(rest, openapiFile, name),
                    [OPENAPI_SCHEMA_MARKER]: name
                })
            );
            schemas.items.splice(schemas.items.indexOf(item), 0, copy);
            copied.add(name);
        }
};

/**
 * Folds every module's fragment into the `webhooks` section's document; any other section passes
 * through untouched.
 *
 * @param section - the section being read, as the bundler names it
 * @param document - that section's own parsed document
 * @param merge - the bundler's merge, which refuses a key two owners both declare
 * @returns the same document, now carrying every owner's events when it is the `webhooks` section
 */
export const withWebhookEvents = (
    section: string,
    document: Document,
    merge: (target: Document, label: string, source: Document) => void
): Document => {
    if (section !== WEBHOOKS_SECTION) return document;
    for (const fragment of webhookEventFragments()) {
        // `yaml`'s `parseDocument`, keeping source tokens so each node keeps its authored style.
        const parsed = parseDocument(readFileSync(fragment, 'utf8'), { keepSourceTokens: true });
        localiseOpenApiReferences(parsed, path.join(path.dirname(fragment), 'openapi.yaml'));
        merge(document, path.basename(path.dirname(fragment)), parsed);
    }
    return document;
};
