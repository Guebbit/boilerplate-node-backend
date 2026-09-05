/**
 * Enumerate every operation in `openapi.yaml`.
 *
 * This is the half of spec-driven fuzzing that stops the suite from drifting: the endpoint list
 * is DERIVED, never written down. Add a route to the spec and the fuzzer covers it on the next
 * run without anyone remembering to add it — which is the whole property that made `schemathesis`
 * attractive, kept without adding a second language to the repo.
 *
 * Deliberately small. It resolves `$ref`, reads request bodies and path parameters, and reports
 * whether an operation needs a token. It is not a general OpenAPI library and should not grow
 * into one: the moment it needs to understand something genuinely hard (`discriminator`,
 * callbacks, links), the honest move is to reach for a real tool rather than to keep extending
 * this. `assertSpecVocabulary` below is the tripwire for that — it fails when the spec starts
 * using a keyword this walk silently ignores, so "the fuzzer quietly stopped covering that field"
 * cannot happen without a red test.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { sampleForPattern, usesLookaround } from './pattern-samples';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

/** A JSON Schema node, in the subset this repo's spec actually uses. */
export interface SchemaNode {
    type?: string;
    format?: string;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    pattern?: string;
    nullable?: boolean;
    required?: string[];
    properties?: Record<string, SchemaNode>;
    items?: SchemaNode;
    additionalProperties?: boolean | SchemaNode;
    oneOf?: SchemaNode[];
    anyOf?: SchemaNode[];
    allOf?: SchemaNode[];
    $ref?: string;
}

export interface Operation {
    /** Templated path exactly as the spec declares it, e.g. `/products/{id}`. */
    path: string;
    method: HttpMethod;
    operationId?: string;
    /** Path parameter names, in declaration order. */
    pathParameters: string[];
    /** Resolved `application/json` request body schema, when the operation takes one. */
    bodySchema?: SchemaNode;
    /** True when the operation declares a `multipart/form-data` body (skipped by the fuzzer). */
    isMultipart: boolean;
    /** True when the operation requires a bearer token. */
    requiresAuth: boolean;
    /** Documented response status codes, as strings (`'200'`, `'422'`, `'default'`). */
    documentedStatuses: string[];
}

interface SpecDocument {
    paths: Record<string, Record<string, unknown>>;
    components?: { schemas?: Record<string, SchemaNode> };
}

const SPEC_PATH = path.join(__dirname, '..', '..', 'openapi.yaml');

let cached: SpecDocument | undefined;

/** The parsed spec. Read once — it is a 120 KB document and every test file would re-parse it. */
export const readSpec = (): SpecDocument => {
    cached ??= YAML.parse(readFileSync(SPEC_PATH, 'utf8')) as SpecDocument;
    return cached;
};

/**
 * Resolve `$ref` and flatten `allOf`, leaving a node the arbitrary builder can read directly.
 *
 * Bounded by `seen`: a self-referential schema (a category with child categories) would otherwise
 * recurse forever, and the failure mode would be a stack overflow inside a test rather than a
 * message anyone can act on.
 */
export const resolveSchema = (
    schema: SchemaNode | undefined,
    spec: SpecDocument = readSpec(),
    seen: Set<string> = new Set()
): SchemaNode | undefined => {
    if (!schema) return undefined;

    if (schema.$ref) {
        const name = schema.$ref.replace('#/components/schemas/', '');
        if (seen.has(name)) return { type: 'object' };
        seen.add(name);
        return resolveSchema(spec.components?.schemas?.[name], spec, seen);
    }

    if (schema.allOf) {
        const merged: SchemaNode = { type: 'object', properties: {}, required: [] };
        for (const part of schema.allOf) {
            const resolved = resolveSchema(part, spec, new Set(seen));
            Object.assign(merged.properties!, resolved?.properties);
            merged.required!.push(...(resolved?.required ?? []));
        }
        return merged;
    }

    if (schema.properties) {
        const properties: Record<string, SchemaNode> = {};
        for (const [key, value] of Object.entries(schema.properties))
            properties[key] = resolveSchema(value, spec, new Set(seen)) ?? {};
        return { ...schema, properties };
    }

    if (schema.items) return { ...schema, items: resolveSchema(schema.items, spec, new Set(seen)) };

    return schema;
};

/** Every operation the spec declares, in document order. */
export const listOperations = (spec: SpecDocument = readSpec()): Operation[] => {
    const operations: Operation[] = [];

    for (const [pathName, pathItem] of Object.entries(spec.paths)) {
        for (const method of METHODS) {
            const operation = pathItem[method] as Record<string, unknown> | undefined;
            if (!operation) continue;

            const content = (
                operation.requestBody as
                    | { content?: Record<string, { schema?: SchemaNode }> }
                    | undefined
            )?.content;

            operations.push({
                path: pathName,
                method,
                operationId: operation.operationId as string | undefined,
                pathParameters: [...pathName.matchAll(/{(\w+)}/g)].map(([, name]) => name),
                bodySchema: resolveSchema(content?.['application/json']?.schema, spec),
                isMultipart: Boolean(content?.['multipart/form-data']),
                requiresAuth: Array.isArray(operation.security) && operation.security.length > 0,
                documentedStatuses: Object.keys(
                    (operation.responses as Record<string, unknown> | undefined) ?? {}
                )
            });
        }
    }

    return operations;
};

/**
 * Every JSON Schema keyword this walk knows how to honour.
 *
 * See the header: the danger with a hand-rolled walk is not that it breaks, it is that the spec
 * grows a keyword the walk ignores and the fuzzer silently stops constraining that field —
 * generating garbage the endpoint rightly rejects, so the run stays green while testing nothing.
 */
export const SUPPORTED_KEYWORDS = new Set([
    'type',
    'format',
    'enum',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'pattern',
    'nullable',
    'required',
    'properties',
    'items',
    'additionalProperties',
    'oneOf',
    'anyOf',
    'allOf',
    '$ref',
    // Documentation-only; they do not change what a valid value is.
    'description',
    'example',
    'examples',
    'title',
    'default',
    'readOnly',
    'writeOnly',
    'deprecated'
]);

/**
 * The child schemas directly beneath a node — the keywords whose VALUE is itself a schema.
 *
 * Structural on purpose: the keys of a `properties` object are field NAMES (`email`, `active`,
 * `total`), not schema keywords, so a walk that recursed over every key would report the entire
 * domain model. That was the first version's bug, and it is the failure mode of any "walk the
 * JSON and look at keys" check.
 */
const childSchemasOf = (node: Record<string, unknown>): unknown[] => [
    ...Object.values((node.properties ?? {}) as Record<string, unknown>),
    node.items,
    node.additionalProperties,
    ...((node.oneOf ?? []) as unknown[]),
    ...((node.anyOf ?? []) as unknown[]),
    ...((node.allOf ?? []) as unknown[])
];

/** Calls `visit` once per schema node under `components.schemas`, depth first. */
const visitSchemaNodes = (
    spec: SpecDocument,
    visit: (node: Record<string, unknown>) => void
): void => {
    const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }

        const record = node as Record<string, unknown>;
        visit(record);
        for (const child of childSchemasOf(record)) walk(child);
    };

    for (const schema of Object.values(spec.components?.schemas ?? {})) walk(schema);
};

/**
 * Keywords present in the spec's schemas that this walk does not understand.
 * @returns the offending keywords, sorted; empty when the spec stays inside this walk's vocabulary
 */
export const unsupportedKeywords = (spec: SpecDocument = readSpec()): string[] => {
    const found = new Set<string>();

    visitSchemaNodes(spec, (node) => {
        for (const key of Object.keys(node)) if (!SUPPORTED_KEYWORDS.has(key)) found.add(key);
    });

    return [...found].toSorted();
};

/**
 * Patterns no generator can build a string for: lookaround, which `fast-check` cannot compile,
 * and no sample registered in `tests/support/pattern-samples.ts` either.
 *
 * The sibling of {@link unsupportedKeywords}, for the same danger one level down — the keyword is
 * understood, the VALUE is not, so the fuzzer omits the field and its endpoint 422s every run
 * while the suite stays green.
 * @returns the offending pattern sources, sorted; empty when every pattern can be generated
 */
export const ungeneratablePatterns = (spec: SpecDocument = readSpec()): string[] => {
    const found = new Set<string>();

    visitSchemaNodes(spec, ({ pattern }) => {
        if (typeof pattern !== 'string') return;
        if (usesLookaround(pattern) && sampleForPattern(pattern) === undefined) found.add(pattern);
    });

    return [...found].toSorted();
};
