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
                pathParameters: [...pathName.matchAll(/{(\w+)}/g)].map(([, name]) => name!),
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
 * Keywords present in the spec's schemas that this walk does not understand.
 *
 * Walks STRUCTURALLY rather than over every key: the keys of a `properties` object are field
 * NAMES (`email`, `active`, `total`), not schema keywords, and checking them against the keyword
 * list reports the entire domain model as unsupported. That was the first version's bug, and it
 * is worth naming because it is the failure mode of any "walk the JSON and look at keys" check.
 */
export const unsupportedKeywords = (spec: SpecDocument = readSpec()): string[] => {
    const found = new Set<string>();

    const visitSchema = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const item of node) visitSchema(item);
            return;
        }

        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            if (!SUPPORTED_KEYWORDS.has(key)) {
                found.add(key);
                continue;
            }
            // Recurse only where the VALUE is itself a schema (or a map/array of schemas).
            // `properties` and `additionalProperties` hold field names as keys, so their values
            // are visited but their keys never are.
            switch (key) {
                case 'properties': {
                    for (const child of Object.values(value as Record<string, unknown>))
                        visitSchema(child);
                    break;
                }
                case 'items':
                case 'additionalProperties': {
                    visitSchema(value);
                    break;
                }
                case 'oneOf':
                case 'anyOf':
                case 'allOf': {
                    for (const child of (value as unknown[]) ?? []) visitSchema(child);
                    break;
                }
                // Everything else is a scalar constraint with nothing beneath it.
                default: {
                    break;
                }
            }
        }
    };

    for (const schema of Object.values(spec.components?.schemas ?? {})) visitSchema(schema);
    return [...found].toSorted();
};
