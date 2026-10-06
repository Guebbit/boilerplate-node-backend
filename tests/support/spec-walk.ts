/**
 * Enumerate every operation in `openapi.yaml`.
 *
 * This is the half of spec-driven fuzzing that stops the suite from drifting: the endpoint list
 * is DERIVED, never written down. Add a route to the spec and the fuzzer covers it on the next
 * run without anyone remembering to add it — which is the whole property that made `schemathesis`
 * attractive, kept without adding a second language to the repo.
 *
 * Deliberately small. It resolves `$ref`, reads request bodies, path and query parameters, and
 * reports whether an operation needs a token. It is not a general OpenAPI library and should not grow
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

/** The HTTP methods this walk enumerates — every verb the spec can declare an operation under. */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** The verbs {@link readSpec}'s path items are scanned for. */
const METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

/** A JSON Schema node, in the subset this repo's spec actually uses. */
export interface SchemaNode {
    type?: string;
    format?: string;
    enum?: unknown[];
    minimum?: number;
    /** OpenAPI 3.0 boolean form: `minimum` itself is not a valid value. */
    exclusiveMinimum?: boolean;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
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

/** One endpoint the spec declares, resolved down to what the fuzzer needs to call it. */
export interface Operation {
    /** Templated path exactly as the spec declares it, e.g. `/products/{id}`. */
    path: string;
    method: HttpMethod;
    operationId?: string;
    /** Path parameter names, in declaration order. */
    pathParameters: string[];
    /** Each path parameter's value schema, `$ref` resolved; absent where the spec declares none. */
    pathParameterSchemas: Record<string, SchemaNode | undefined>;
    /** Query parameters, `$ref`s resolved — the path item's own first, then the operation's. */
    queryParameters: QueryParameter[];
    /** Resolved `application/json` request body schema, when the operation takes one. */
    bodySchema?: SchemaNode;
    /** Resolved `application/merge-patch+json` body schema, when the operation declares that variant. */
    mergePatchSchema?: SchemaNode;
    /** True when the operation declares a `multipart/form-data` body (skipped by the fuzzer). */
    isMultipart: boolean;
    /** True when the operation requires a bearer token. */
    requiresAuth: boolean;
}

/** One `in: query` parameter, as the fuzzer needs it to build a query string. */
export interface QueryParameter {
    /** The key in the query string. */
    name: string;
    /** Whether a request without it is malformed. */
    required: boolean;
    /** The value's schema, `$ref` resolved. */
    schema?: SchemaNode;
}

/** A parameter object as the spec writes it, before `$ref` resolution. */
interface ParameterObject {
    $ref?: string;
    name?: string;
    in?: string;
    required?: boolean;
    schema?: SchemaNode;
}

/** The slice of the OpenAPI document the walk reads. */
interface SpecDocument {
    paths: Record<string, Record<string, unknown>>;
    components?: {
        schemas?: Record<string, SchemaNode>;
        parameters?: Record<string, ParameterObject>;
        headers?: Record<string, { required?: boolean }>;
    };
}

/** The root bundle on disk, built by `npm run contracts:bundle`. */
const SPEC_PATH = path.join(__dirname, '..', '..', 'openapi.yaml');

/** The parsed spec once {@link readSpec} has read it. */
let cached: SpecDocument | undefined;

/** The parsed spec. Read once — it is a 120 KB document and every test file would re-parse it. */
export const readSpec = (): SpecDocument => {
    cached ??= YAML.parse(readFileSync(SPEC_PATH, 'utf8')) as SpecDocument;
    return cached;
};

/**
 * Fold an `allOf` into one node: every part's keywords, then the node's own siblings on top.
 *
 * Own siblings win because the spec writes `type: string` or `nullable: true` beside the
 * `allOf: [$ref]` wrapper on purpose (orval needs the wrapper, the sibling says what the field is).
 * Among parts the last one wins for a scalar keyword — no part in the spec constrains the same
 * bound twice, so "tightest wins" would be code for a case that does not exist.
 * `properties` are merged and `required` unioned, which is what `allOf` means for objects.
 *
 * @param own - the node carrying the `allOf`, siblings included
 * @param parts - the resolved members of that `allOf`
 */
const mergeAllOf = (own: SchemaNode, parts: (SchemaNode | undefined)[]): SchemaNode => {
    const merged: SchemaNode = {};
    const { allOf: _members, ...siblings } = own;

    for (const part of [...parts, siblings]) {
        if (!part) continue;
        const { properties, required, ...scalars } = part;
        Object.assign(merged, scalars);
        if (properties) merged.properties = { ...merged.properties, ...properties };
        if (required) merged.required = [...new Set([...(merged.required ?? []), ...required])];
    }

    return merged;
};

/**
 * Resolve `$ref` and fold `allOf`, leaving a node the arbitrary builder can read directly.
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

    if (schema.allOf)
        return mergeAllOf(
            schema,
            schema.allOf.map((part) => resolveSchema(part, spec, new Set(seen)))
        );

    const resolved: SchemaNode = { ...schema };

    if (schema.properties) {
        resolved.properties = {};
        for (const [key, value] of Object.entries(schema.properties))
            resolved.properties[key] = resolveSchema(value, spec, new Set(seen)) ?? {};
    }

    if (schema.items) resolved.items = resolveSchema(schema.items, spec, new Set(seen));

    if (typeof schema.additionalProperties === 'object')
        resolved.additionalProperties = resolveSchema(
            schema.additionalProperties,
            spec,
            new Set(seen)
        );

    return resolved;
};

/**
 * The parameters of one operation that sit in `location`, `$ref`s into `components.parameters`
 * resolved.
 *
 * @param declared - the path item's `parameters` followed by the operation's own
 * @param spec - the document the references point into
 * @param location - `query` or `path`
 */
const parametersIn = (
    declared: ParameterObject[],
    spec: SpecDocument,
    location: 'query' | 'path'
): ParameterObject[] =>
    declared
        .map((parameter) =>
            parameter.$ref
                ? spec.components?.parameters?.[
                      parameter.$ref.replace('#/components/parameters/', '')
                  ]
                : parameter
        )
        .filter((parameter): parameter is ParameterObject => parameter?.in === location);

/**
 * The query parameters of one operation, `$ref`s into `components.parameters` resolved.
 *
 * @param declared - the path item's `parameters` followed by the operation's own
 * @param spec - the document the references point into
 */
const queryParametersOf = (declared: ParameterObject[], spec: SpecDocument): QueryParameter[] =>
    parametersIn(declared, spec, 'query').map((parameter) => ({
        name: String(parameter.name),
        required: parameter.required === true,
        schema: resolveSchema(parameter.schema, spec)
    }));

/** One response header as an operation writes it: inline, or a `$ref` into `components.headers`. */
interface HeaderReference {
    $ref?: string;
    required?: boolean;
}

/**
 * The response headers an operation's documented status MUST send — `required: true`, `$ref`
 * resolved — as lower-case names, which is how Node reports them.
 *
 * @param operation - the operation object as the spec writes it
 * @param status - the response status to look up
 * @param spec - the document the references point into
 */
const requiredHeadersOf = (
    operation: Record<string, unknown>,
    status: string,
    spec: SpecDocument
): string[] => {
    const declared = (
        operation.responses as
            | Record<string, { headers?: Record<string, HeaderReference> } | undefined>
            | undefined
    )?.[status]?.headers;

    return Object.entries(declared ?? {})
        .filter(([, header]) => {
            const resolved = header.$ref
                ? spec.components?.headers?.[header.$ref.replace('#/components/headers/', '')]
                : header;
            return resolved?.required === true;
        })
        .map(([name]) => name.toLowerCase());
};

/**
 * Every response header the spec requires, per operation and status: `{ createProduct: { '201':
 * ['location'] } }`. What lets the shared `afterEach` fail a 201 that forgot its `Location`.
 */
export const requiredResponseHeaders = (
    spec: SpecDocument = readSpec()
): Record<string, Record<string, string[]>> => {
    const byOperation: Record<string, Record<string, string[]>> = {};

    for (const pathItem of Object.values(spec.paths))
        for (const method of METHODS) {
            const operation = pathItem[method] as Record<string, unknown> | undefined;
            if (typeof operation?.operationId !== 'string') continue;

            const statuses = Object.keys((operation.responses as object | undefined) ?? {});
            byOperation[operation.operationId] = Object.fromEntries(
                statuses.map((status) => [status, requiredHeadersOf(operation, status, spec)])
            );
        }

    return byOperation;
};

/**
 * Whether one alternative of a `security` list is the empty object `{}`: the "no credential"
 * alternative.
 *
 * @param alternative - one entry of the list
 */
const isEmptyRequirement = (alternative: unknown): boolean =>
    typeof alternative === 'object' &&
    alternative !== null &&
    Object.keys(alternative).length === 0;

/**
 * Whether an operation's `security` demands a credential.
 *
 * Absent or `[]` is public. An alternative that is the empty object `{}` makes the whole list
 * optional (OpenAPI 3.0.3, "Security Requirement Object"): a request with no credential is one of
 * the accepted shapes, so a session may be present but is not required.
 *
 * @param security - the operation's `security` value, as parsed
 */
export const securityRequiresAuth = (security: unknown): boolean =>
    Array.isArray(security) &&
    security.length > 0 &&
    security.every((alternative) => !isEmptyRequirement(alternative));

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

            const declared = [
                ...((pathItem.parameters as ParameterObject[] | undefined) ?? []),
                ...((operation.parameters as ParameterObject[] | undefined) ?? [])
            ];

            operations.push({
                path: pathName,
                method,
                operationId: operation.operationId as string | undefined,
                pathParameters: [...pathName.matchAll(/{(\w+)}/g)].map(([, name]) => name),
                pathParameterSchemas: Object.fromEntries(
                    parametersIn(declared, spec, 'path').map((parameter) => [
                        String(parameter.name),
                        resolveSchema(parameter.schema, spec)
                    ])
                ),
                queryParameters: queryParametersOf(declared, spec),
                bodySchema: resolveSchema(content?.['application/json']?.schema, spec),
                mergePatchSchema: resolveSchema(
                    content?.['application/merge-patch+json']?.schema,
                    spec
                ),
                isMultipart: Boolean(content?.['multipart/form-data']),
                requiresAuth: securityRequiresAuth(operation.security)
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
    'exclusiveMinimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'uniqueItems',
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
    // A lookup hint over `oneOf`, not a constraint: each branch already pins its tag with a
    // one-value `enum`, so a value built from any branch satisfies the mapping.
    // https://spec.openapis.org/oas/v3.0.3#discriminator-object
    'discriminator',
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
