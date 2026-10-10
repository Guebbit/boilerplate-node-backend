/**
 * The browser events each module owns, assembled into `analytics`' request schema.
 *
 * A module whose pages report an event ships `src/modules/<m>/openapi.browser-events.yaml`:
 * components only, one schema per event, each naming its event once as a one-value `event` enum.
 * After the bundle is built, this step adds those schemas and replaces `AnalyticsEventRequest`
 * with a `oneOf` discriminated on `event`. With `analytics` absent nothing is added, and with no
 * fragment the placeholder in `analytics/openapi.yaml` stays. Same principle as the webhook
 * events (`asyncapi-webhook-events.ts`): a module's contract leaves with the module.
 *
 * Its own file so the OpenAPI bundler meets it at one call (`withBrowserEvents`).
 *
 * See: docs/api/contract-fragmentation.md#module-owned-browser-events
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { REPO_ROOT } from './bundle-kinds';
import { orderSections } from './section-order';

/** The file name a module reporting browser events ships. */
const FRAGMENT_FILE = 'openapi.browser-events.yaml';

/** The schema the events assemble into; declared by `analytics`. */
const REQUEST_SCHEMA = 'AnalyticsEventRequest';

/** How a fragment spells a ref to the root file, and how the bundle spells the same target. */
const ROOT_REF_PREFIX = '../../../shared/contracts/openapi.root.yaml#';

/** A parsed schema object, as far as this step reads it. */
type Schema = Record<string, unknown>;

/** The parts of an OpenAPI document this step reads and writes. */
interface OpenApiDocument {
    components?: { schemas?: Record<string, Schema> };
}

/** Narrative order for the shop's modules; the rest follow alphabetically. */
const FRAGMENT_ORDER: readonly string[] = ['products'];

/**
 * Every module's browser-event fragment, discovered from disk.
 *
 * @returns absolute paths, in {@link FRAGMENT_ORDER} then alphabetically
 */
export const browserEventFragments = (): string[] => {
    const modulesDirectory = path.join(REPO_ROOT, 'src', 'modules');
    const owners = readdirSync(modulesDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(modulesDirectory, name, FRAGMENT_FILE)));
    return orderSections(FRAGMENT_ORDER, owners).map((name) =>
        path.join(modulesDirectory, name, FRAGMENT_FILE)
    );
};

/**
 * Rewrites a fragment's refs to the root file into the bundle's own `#/...` form.
 *
 * @param node - any parsed YAML value
 * @returns the same value with every root ref local
 */
const localiseReferences = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map((item) => localiseReferences(item));
    if (typeof node !== 'object' || node === null) return node;
    return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [
            key,
            key === '$ref' && typeof value === 'string' && value.startsWith(ROOT_REF_PREFIX)
                ? value.slice(ROOT_REF_PREFIX.length - 1)
                : localiseReferences(value)
        ])
    );
};

/**
 * The event name a schema declares: its `event` property's single enum value.
 *
 * @param name - the schema's name, for the error
 * @param schema - the event schema
 * @throws {Error} when `event` is not a one-value enum
 */
const eventNameOf = (name: string, schema: Schema): string => {
    const values = ((schema.properties as Record<string, Schema> | undefined)?.event.enum ??
        []) as unknown[];
    if (values.length !== 1 || typeof values[0] !== 'string')
        throw new Error(
            `[openapi] ${name} (browser events) must declare \`event\` as a one-value string enum.`
        );
    return values[0];
};

/**
 * Adds every module's browser-event schemas and turns `AnalyticsEventRequest` into their `oneOf`.
 *
 * @param bundled - the bundled OpenAPI document, as YAML text
 * @param fragments - the fragment files to fold in; defaults to those on disk
 * @returns the document with the events assembled, or unchanged when `analytics` or every fragment is absent
 * @throws {Error} when two fragments declare one schema or one event name
 */
export const withBrowserEvents = (
    bundled: string,
    fragments: readonly string[] = browserEventFragments()
): string => {
    // `yaml`'s YAML 1.2 loader; narrowed by the shape checks below.
    const document_ = parseYaml(bundled) as OpenApiDocument;
    const schemas = document_.components?.schemas;
    if (!schemas || !(REQUEST_SCHEMA in schemas) || fragments.length === 0) return bundled;

    const added: Record<string, Schema> = {};
    const mapping: Record<string, string> = {};
    for (const file of fragments) {
        const parsed = parseYaml(readFileSync(file, 'utf8')) as OpenApiDocument;
        for (const [name, schema] of Object.entries(parsed.components?.schemas ?? {})) {
            const event = eventNameOf(name, schema);
            if (name in schemas || name in added || event in mapping)
                throw new Error(
                    `[openapi] browser event ${name} (${event}) is declared twice — the second is ${file}.`
                );
            added[name] = localiseReferences(schema) as Schema;
            mapping[event] = `#/components/schemas/${name}`;
        }
    }

    // `!` is safe: `schemas` above was read off `components`, so it exists.
    // Rebuilt rather than assigned so the events sit right after the request schema they belong to.
    document_.components!.schemas = Object.fromEntries(
        Object.entries(schemas).flatMap(([name, schema]) =>
            name === REQUEST_SCHEMA
                ? [
                      [
                          name,
                          {
                              oneOf: Object.values(mapping).map((ref) => ({ $ref: ref })),
                              discriminator: { propertyName: 'event', mapping }
                          }
                      ],
                      ...Object.entries(added)
                  ]
                : [[name, schema]]
        )
    );

    // `lineWidth: 0` turns off line folding, so diffs stay small.
    // https://eemeli.org/yaml/#tostring-options
    return stringifyYaml(document_, { lineWidth: 0 });
};
