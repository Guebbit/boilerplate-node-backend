/**
 * The three API client collections, GENERATED from the contract instead of maintained by hand.
 *
 * WHY. They were hand-written restatements of `openapi.yaml`, and they rotted exactly as a copy
 * does. Measured before this existed: Bruno and Mockoon each covered 37 of the contract's 56
 * operations and named no `feedback`, `locales` or `observability` endpoint at all; Insomnia had 30
 * requests pointing at URLs (`POST /products/add`, `GET /products/details/{id}`, `GET /heavy`) that
 * the application stopped serving. Mockoon was worse than incomplete — its bodies predated the
 * response envelope, so `GET /account` mocked a bare user where the API returns `UserEnvelope`, and
 * every error body was the old `{ success, error, traceId }` shape. A mock server serving shapes the
 * frontend cannot parse is worse than no mock server.
 *
 * WHAT IT GENERATES. One fragment per module per tool — the same fragments the bundler already
 * assembles — so the collections keep their per-module ownership and their place in the cross-repo
 * guard. Nothing about `scripts/contracts/fragments.ts` changes; this only writes its inputs.
 *
 * WHERE THE VALUES COME FROM. Shapes come from the contract; VALUES come from `seed-identities.ts`,
 * the dataset the backend actually seeds. So a generated request is not a schema-shaped placeholder
 * with empty strings — `GET /products/{id}` asks for a product that exists, and `POST
 * /account/login` sends credentials that work. That is the difference between a collection you can
 * click and one you have to fix first.
 *
 * OWNERSHIP IS NOT CONFIGURED HERE. Which module owns which path is already recorded, once, by the
 * OpenAPI fragments: a path in `src/modules/orders/openapi/paths.yaml` is the orders module's. This
 * reads those fragments rather than restating the mapping, so a path that moves between modules
 * moves in all three collections with it.
 *
 * WHAT A CONTRACT CANNOT DESCRIBE. A collection is also where you keep the requests that PROVE the
 * API rejects things: an invalid body, a bogus token, a second identity, a soft-deleted record
 * someone should not see. A spec describes valid calls and their declared answers, so no generator
 * can derive those. A module declares them in `dev/probes.yml` — method, path, headers, body, and a
 * `why` that becomes the description — and they land in Bruno and Insomnia after its generated
 * requests. Not in Mockoon: a mock server answers requests, it does not send them.
 *
 * Probes refer to seed records as `{{seedSoftDeletedProductId}}` rather than pasting an id, so they
 * cannot drift from the dataset they are probing.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { REPO_ROOT } from './fragments';
import { SECTION_ORDER, sectionFragment, type SectionName } from './openapi';
import { collectionFragment, COLLECTION_TOOLS, type CollectionTool } from './clientCollections';
import {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_PASSWORD,
    seedOrders,
    seedProducts,
    seedUsers
} from '../../db/seeds/seed-identities';

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * The contract, read as data
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface Schema {
    $ref?: string;
    type?: string;
    format?: string;
    enum?: Json[];
    example?: Json;
    default?: Json;
    properties?: Record<string, Schema>;
    required?: string[];
    items?: Schema;
    allOf?: Schema[];
    oneOf?: Schema[];
    anyOf?: Schema[];
    minimum?: number;
    minItems?: number;
}

interface Parameter {
    $ref?: string;
    name?: string;
    in?: 'path' | 'query' | 'header' | 'cookie';
    required?: boolean;
    description?: string;
    schema?: Schema;
}

interface MediaType {
    schema?: Schema;
    example?: Json;
}

interface Response {
    $ref?: string;
    description?: string;
    content?: Record<string, MediaType>;
}

interface OperationSpec {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    security?: unknown[];
    requestBody?: { content?: Record<string, MediaType> };
    responses?: Record<string, Response>;
}

interface Contract {
    info: { title: string; version: string };
    servers?: { url: string; description?: string }[];
    paths: Record<string, Record<string, OperationSpec | Parameter[]>>;
    components?: {
        schemas?: Record<string, Schema>;
        parameters?: Record<string, Parameter>;
        responses?: Record<string, Response>;
    };
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const isMethod = (key: string): key is HttpMethod =>
    (HTTP_METHODS as readonly string[]).includes(key);

const readContract = (): Contract =>
    parseYaml(readFileSync(path.join(REPO_ROOT, 'openapi.yaml'), 'utf8')) as Contract;

/** Follow a local `#/components/...` pointer. Remote refs do not occur in a bundled document. */
const dereference = <T>(contract: Contract, node: T & { $ref?: string }): T => {
    if (!node?.$ref) return node;
    const segments = node.$ref.replace(/^#\//, '').split('/');
    let current: unknown = contract;
    for (const segment of segments) current = (current as Record<string, unknown>)[segment];
    return dereference(contract, current as T & { $ref?: string });
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Which module owns which path — read from the OpenAPI fragments, never restated
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** A path key as it appears in a `paths.yaml` fragment: four spaces, then the path. */
const PATH_LINE = /^ {4}(\/\S*):\s*$/;

/** Every path filed under a section, in the order its fragment declares them. */
const sectionPaths = (section: SectionName): string[] =>
    readFileSync(sectionFragment(section, 'paths'), 'utf8')
        .split('\n')
        .map((line) => PATH_LINE.exec(line)?.[1])
        .filter((match): match is string => match !== undefined);

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Values — the shapes are the contract's, the data is the seed's
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const [seedAdmin, seedUser] = seedUsers;
const [seedProduct] = seedProducts;
const [seedOrder] = seedOrders;

/**
 * What a property called `x` should hold.
 *
 * Keyed by property name because that is what makes a generated body USABLE: a request that posts
 * `{"productId": ""}` is a request whoever opens the collection has to fix before it does anything.
 * Anything not named here falls through to a type- and format-shaped default.
 */
const SEEDED_VALUES: Record<string, Json> = {
    id: seedProduct.id,
    email: SEED_USER_EMAIL,
    password: SEED_USER_PASSWORD,
    newPassword: SEED_USER_PASSWORD,
    username: seedUser.username,
    productId: seedProduct.id,
    userId: seedUser.id,
    orderId: seedOrder.id,
    title: seedProduct.title,
    description: seedProduct.description,
    price: seedProduct.price,
    imageUrl: seedProduct.imageUrl,
    quantity: 2,
    admin: false,
    active: true,
    locale: 'en',
    text: seedProduct.title,
    page: 1,
    pageSize: 20
};

/**
 * Bodies a schema cannot produce correctly on its own.
 *
 * Only two, and both for the same reason: the credentials have to be the ADMIN's. A login that
 * returns a non-admin token makes every admin-only request in the collection fail with a 403, and
 * the first thing anyone would do with the collection is log in.
 */
const BODY_OVERRIDES: Record<string, Json> = {
    'POST /account/login': { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
    'POST /account/signup': {
        username: seedUser.username,
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD
    }
};

/**
 * Whole records for the entities the contract names, rather than field-by-field guesses.
 *
 * A `$ref` to `Product` should produce the product the database actually holds, so a `GET
 * /products/{id}` example and the row that answers it are the same record. Only the properties the
 * schema declares survive, so a field the contract drops stops appearing here on the next run.
 */
const ENTITY_SEEDS: Record<string, Record<string, Json>> = {
    User: {
        id: seedUser.id,
        username: seedUser.username,
        email: seedUser.email,
        admin: seedUser.admin,
        active: true,
        imageUrl: seedUser.imageUrl
    },
    Product: {
        id: seedProduct.id,
        title: seedProduct.title,
        description: seedProduct.description,
        price: seedProduct.price,
        active: seedProduct.active,
        imageUrl: seedProduct.imageUrl
    },
    Order: {
        id: seedOrder.id,
        userId: seedOrder.userId,
        email: seedOrder.email,
        total: seedProduct.price * seedOrder.items[0].quantity
    },
    OrderItem: {
        productId: seedOrder.items[0].productId,
        quantity: seedOrder.items[0].quantity,
        price: seedProduct.price
    },
    CartItem: {
        productId: seedAdmin.cart[0].productId,
        quantity: seedAdmin.cart[0].quantity
    }
};

/** A path parameter's value: the seeded record of whichever domain the path belongs to. */
const pathParameterValue = (name: string, pathTemplate: string): string => {
    if (name === 'productId') return seedProduct.id;
    if (name === 'locale') return 'en';
    if (name !== 'id') return String(SEEDED_VALUES[name] ?? 'example');

    if (pathTemplate.startsWith('/products')) return seedProduct.id;
    if (pathTemplate.startsWith('/orders')) return seedOrder.id;
    if (pathTemplate.startsWith('/users')) return seedUser.id;
    if (pathTemplate.startsWith('/feedback')) return seedOrder.id;
    return seedAdmin.id;
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Probes — the requests a contract cannot describe
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The seed facts a probe may refer to, as `{{token}}`.
 *
 * A probe that pasted `65dc8ad8604c307b702b5cd4` into its URL would be a copy of the seed dataset,
 * and copies drift — the whole reason `seed-identities.ts` exists. Every one of these is DERIVED
 * from the records rather than restated, so a fixture that stops being soft-deleted takes its probe
 * with it instead of leaving one that quietly tests nothing.
 */
const SEED_TOKENS: Record<string, string> = {
    seedAdminEmail: SEED_ADMIN_EMAIL,
    seedAdminPassword: SEED_ADMIN_PASSWORD,
    seedAdminId: seedAdmin.id,
    seedUserEmail: SEED_USER_EMAIL,
    seedUserPassword: SEED_USER_PASSWORD,
    seedUserId: seedUser.id,
    seedProductId: seedProduct.id,
    seedOrderId: seedOrder.id,
    /* The dataset carries exactly one of each on purpose — see the comments in
     * `seed-identities.ts`: without them the soft-delete and role-scoping branches have no fixture
     * behind them, and a branch with no fixture is a branch nothing exercises. */
    seedSoftDeletedProductId: (seedProducts.find((product) => product.deletedAt) ?? seedProduct).id,
    seedInactiveProductId: (seedProducts.find((product) => !product.active) ?? seedProduct).id,
    seedDeletedOrderId: (seedOrders.find((order) => order.deletedAt) ?? seedOrder).id
};

/** Replace every `{{token}}` in a string, throwing on one this file does not define. */
const applyTokens = (text: string): string =>
    text.replaceAll(/{{(\w+)}}/g, (_match, token: string) => {
        if (!(token in SEED_TOKENS))
            throw new Error(
                `[collections] probe refers to {{${token}}}, which is not a seed token.\n` +
                    `  Known: ${Object.keys(SEED_TOKENS).join(', ')}`
            );
        return SEED_TOKENS[token];
    });

/** The same, through a whole JSON body. */
const applyTokensDeep = (value: Json): Json => {
    if (typeof value === 'string') return applyTokens(value);
    if (Array.isArray(value)) return value.map((item) => applyTokensDeep(item));
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, applyTokensDeep(item)])
        );
    return value;
};

/** One hand-declared request, as a module's `dev/probes.yml` writes it. */
interface Probe {
    name: string;
    /** Why it exists — becomes the request's description in both tools. */
    why: string;
    method: string;
    /** Path and query, `{{seedToken}}` allowed. */
    path: string;
    /** `bearer` sends the collection's token; omit for an anonymous call. */
    auth?: 'bearer';
    headers?: Record<string, string>;
    body?: Json;
}

/** Where a module declares its probes. Absence is the normal case. */
const probesFile = (section: SectionName): string =>
    section === 'system'
        ? path.join(REPO_ROOT, 'shared', 'contracts', 'probes.yml')
        : path.join(REPO_ROOT, 'src', 'modules', section, 'dev', 'probes.yml');

/**
 * A module's probes, as requests the emitters can treat like any other.
 *
 * They carry no `responses`: a probe exists to show what the API does with an input the contract
 * does not describe, and inventing the answer here would defeat the point of sending it.
 */
const moduleProbes = (section: SectionName): CollectionRequest[] => {
    const file = probesFile(section);
    if (!existsSync(file)) return [];

    const probes = (parseYaml(readFileSync(file, 'utf8')) ?? []) as Probe[];

    return probes.map((probe) => {
        const [pathOnly, query = ''] = applyTokens(probe.path).split('?');

        return {
            section,
            method: probe.method.toUpperCase(),
            template: probe.path,
            resolvedPath: pathOnly,
            query: query && `?${query}`,
            name: probe.name,
            description: probe.why,
            tags: ['Probe'],
            secured: probe.auth === 'bearer',
            headers: probe.headers,
            body: probe.body === undefined ? undefined : applyTokensDeep(probe.body),
            responses: []
        };
    });
};

/** Every module's probes, flattened — what a coverage check has to account for. */
export const allProbes = (): CollectionRequest[] =>
    SECTION_ORDER.flatMap((section) => moduleProbes(section));

/** A scalar for a schema that named no example and no property this file knows. */
const scalarFor = (schema: Schema): Json => {
    if (schema.enum?.length) return schema.enum[0];
    switch (schema.type) {
        case 'integer':
        case 'number': {
            return schema.minimum ?? 1;
        }
        case 'boolean': {
            return true;
        }
        default: {
            switch (schema.format) {
                case 'date-time': {
                    return '2026-01-01T00:00:00.000Z';
                }
                case 'email': {
                    return SEED_USER_EMAIL;
                }
                case 'uri': {
                    return 'https://example.com';
                }
                case 'password': {
                    return SEED_USER_PASSWORD;
                }
                default: {
                    return 'string';
                }
            }
        }
    }
};

/**
 * A concrete example for a schema.
 *
 * `seen` breaks recursive `$ref` cycles — an entity that embeds itself would otherwise recurse
 * until the stack gives out, and a collection is not the place to discover that.
 */
const exampleFor = (
    contract: Contract,
    rawSchema: Schema | undefined,
    propertyName = '',
    seen: ReadonlySet<string> = new Set()
): Json => {
    if (!rawSchema) return null;

    const reference = rawSchema.$ref;
    if (reference && seen.has(reference)) return null;
    const nextSeen = reference ? new Set([...seen, reference]) : seen;

    const schema = dereference(contract, rawSchema);
    const entity = reference ? ENTITY_SEEDS[reference.split('/').pop() ?? ''] : undefined;

    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (propertyName in SEEDED_VALUES && !schema.properties && !schema.items)
        return SEEDED_VALUES[propertyName];

    if (entity && schema.properties)
        return Object.fromEntries(
            Object.entries(schema.properties).map(([name, property]) => [
                name,
                name in entity ? entity[name] : exampleFor(contract, property, name, nextSeen)
            ])
        );

    if (schema.allOf)
        return schema.allOf.reduce<Record<string, Json>>(
            (merged, part) => ({
                ...merged,
                ...(exampleFor(contract, part, propertyName, nextSeen) as Record<string, Json>)
            }),
            {}
        );

    const variant = schema.oneOf?.[0] ?? schema.anyOf?.[0];
    if (variant) return exampleFor(contract, variant, propertyName, nextSeen);

    if (schema.properties)
        return Object.fromEntries(
            Object.entries(schema.properties).map(([name, property]) => [
                name,
                exampleFor(contract, property, name, nextSeen)
            ])
        );

    if (schema.items) return [exampleFor(contract, schema.items, propertyName, nextSeen)];

    return scalarFor(schema);
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * The request model every emitter reads
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export interface CollectionResponse {
    status: number;
    label: string;
    body: Json;
}

export interface CollectionRequest {
    section: SectionName;
    method: string;
    /** The contract's path template, `/products/{id}`. */
    template: string;
    /** The template with its parameters filled from the seed dataset. */
    resolvedPath: string;
    /** `?` and the required query parameters, or an empty string. */
    query: string;
    name: string;
    description: string;
    tags: string[];
    secured: boolean;
    /** Extra headers a probe asks for; contract-derived requests declare none. */
    headers?: Record<string, string>;
    body?: Json;
    /** One example per declared response. Probes have none — see `moduleProbes`. */
    responses: CollectionResponse[];
}

/** Reason-phrase for the status codes this contract declares. */
const STATUS_TEXT: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
    503: 'Service Unavailable'
};

const requestName = (operation: OperationSpec, method: string, template: string): string =>
    operation.summary ?? operation.operationId ?? `${method} ${template}`;

/**
 * Fill in the two envelope fields the schema alone cannot get right.
 *
 * Every response in this contract is wrapped in `{ success, status, message, … }`, and `status`
 * repeats the HTTP code while `message` summarises the outcome. A schema-shaped example puts the
 * type's placeholder in both — a 404 body claiming `"status": 1` — which is exactly the kind of
 * plausible-looking wrong value someone copies into a test.
 */
const envelope = (body: Json, status: number, label: string): Json => {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return body;

    return {
        ...body,
        ...('status' in body && typeof body.status === 'number' ? { status } : {}),
        ...('message' in body && typeof body.message === 'string' ? { message: label } : {})
    };
};

/** Every operation the contract declares, grouped by the module that owns its path. */
export const collectionRequests = (contract: Contract = readContract()): CollectionRequest[] =>
    SECTION_ORDER.flatMap((section) =>
        sectionPaths(section).flatMap((template) => {
            const pathItem = contract.paths[template];
            if (!pathItem)
                throw new Error(
                    `[collections] ${template} is in the ${section} fragment but not in openapi.yaml.\n` +
                        `  Re-bundle the contract first: npm run contracts:bundle`
                );

            const shared = (pathItem.parameters ?? []) as Parameter[];

            return Object.entries(pathItem)
                .filter(([key]) => isMethod(key))
                .map(([method, raw]) => {
                    const operation = raw as OperationSpec;
                    const parameters = [...shared, ...(operation.parameters ?? [])].map(
                        (parameter) => dereference(contract, parameter)
                    );

                    const resolvedPath = template.replaceAll(/\{(\w+)}/g, (_match, name: string) =>
                        pathParameterValue(name, template)
                    );

                    const required = parameters.filter(
                        (parameter) => parameter.in === 'query' && parameter.required
                    );
                    const query =
                        required.length === 0
                            ? ''
                            : '?' +
                              required
                                  .map(
                                      (parameter) =>
                                          `${parameter.name}=${String(
                                              exampleFor(
                                                  contract,
                                                  parameter.schema,
                                                  parameter.name ?? ''
                                              )
                                          )}`
                                  )
                                  .join('&');

                    const jsonBody = operation.requestBody?.content?.['application/json'];
                    const override = BODY_OVERRIDES[`${method.toUpperCase()} ${template}`];
                    const body = jsonBody
                        ? (override ?? jsonBody.example ?? exampleFor(contract, jsonBody.schema))
                        : undefined;

                    const responses = Object.entries(operation.responses ?? {})
                        .map(([code, rawResponse]) => {
                            const response = dereference(contract, rawResponse);
                            const content = response.content?.['application/json'];
                            const status = Number(code);
                            const label =
                                response.description ?? STATUS_TEXT[status] ?? String(status);
                            const body = content
                                ? (content.example ?? exampleFor(contract, content.schema))
                                : null;

                            return { status, label, body: envelope(body, status, label) };
                        })
                        .sort((left, right) => left.status - right.status);

                    return {
                        section,
                        method: method.toUpperCase(),
                        template,
                        resolvedPath,
                        query,
                        name: requestName(operation, method.toUpperCase(), template),
                        description: operation.summary ?? operation.description ?? '',
                        tags: operation.tags ?? [],
                        secured: Array.isArray(operation.security)
                            ? operation.security.length > 0
                            : false,
                        body,
                        responses
                    };
                });
        })
    );

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Stable identity
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Identifiers derived from what they identify, rather than generated fresh.
 *
 * Mockoon and Insomnia both key everything by id. Random ones would mean every regeneration
 * rewrote every line of all three collections and re-forked them against the frontend's copy, so a
 * diff would never again show what actually changed. Hashing the method and path instead makes the
 * generator a pure function of the contract.
 */
const stableId = (seed: string): string =>
    createHash('sha1').update(seed).digest('hex').slice(0, 32);

/** A v4-shaped uuid whose bits come from the seed. Mockoon validates the shape, not the entropy. */
const stableUuid = (seed: string): string => {
    const hex = stableId(seed);
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `4${hex.slice(13, 16)}`,
        `8${hex.slice(17, 20)}`,
        hex.slice(20, 32)
    ].join('-');
};

/** One fixed timestamp, so `created`/`modified` do not churn the diff on every run. */
const GENERATED_AT = Date.UTC(2026, 0, 1);

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Emitters — one per tool, all writing the fragments the bundler already assembles
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const COLLECTION_NAME = 'Ecommerce Demo API';

/** The tools read YAML/JSON; these fragments are slices, so each is indented to its place. */
const indent = (text: string, spaces: number): string =>
    text
        .split('\n')
        .map((line) => (line.length > 0 ? ' '.repeat(spaces) + line : line))
        .join('\n');

const yamlBlock = (value: unknown, spaces: number): string =>
    indent(stringifyYaml(value, { lineWidth: 0 }).trimEnd(), spaces) + '\n';

const jsonBlock = (value: unknown, spaces: number): string =>
    indent(JSON.stringify(value, undefined, 2).trimEnd(), spaces) + '\n';

/** The label a folder carries: the module's own name, title-cased the way the tools display it. */
const folderName = (section: SectionName): string =>
    section === 'system'
        ? 'System'
        : section.replaceAll(/(^|-)([a-z])/g, (_match, _lead: string, letter: string) =>
              letter.toUpperCase()
          );

const bodyText = (body: Json | undefined): string | undefined =>
    body === undefined ? undefined : JSON.stringify(body, undefined, 2);

/* ── Bruno ──────────────────────────────────────────────────────────────────────────────────── */

const brunoRequest = (request: CollectionRequest, sequence: number): unknown => {
    const url = `{{baseUrl}}${request.resolvedPath}${request.query}`;
    const body = bodyText(request.body);

    return {
        info: {
            name: request.name,
            type: 'http',
            seq: sequence,
            ...(request.tags.length > 0 ? { tags: request.tags } : {})
        },
        http: {
            method: request.method,
            url,
            ...(body ? { body: { type: 'json', data: body } } : {}),
            ...(request.headers
                ? {
                      headers: Object.entries(request.headers).map(([name, value]) => ({
                          name,
                          value
                      }))
                  }
                : {}),
            ...(request.secured ? { auth: { type: 'bearer', token: '{{token}}' } } : {})
        },
        settings: {
            encodeUrl: true,
            timeout: 0,
            followRedirects: true,
            maxRedirects: 5
        },
        // A probe declares no responses: it exists to show what the API does with an input the
        // contract does not describe, and inventing the answer would defeat sending it.
        ...(request.responses.length === 0
            ? {}
            : {
                  examples: request.responses.map((response) => ({
                      name: `${response.status} Response`,
                      description: response.label,
                      request: {
                          url,
                          method: request.method,
                          ...(body ? { body: { type: 'json', data: body } } : {})
                      },
                      response: {
                          status: response.status,
                          statusText: STATUS_TEXT[response.status] ?? '',
                          headers: [{ name: 'Content-Type', value: 'application/json' }],
                          ...(response.body === null
                              ? {}
                              : {
                                    body: {
                                        type: 'json',
                                        data: JSON.stringify(response.body, undefined, 2)
                                    }
                                })
                      }
                  }))
              })
    };
};

const brunoSection = (
    section: SectionName,
    requests: CollectionRequest[],
    sequence: number
): string =>
    yamlBlock(
        [
            {
                info: { name: folderName(section), type: 'folder', seq: sequence },
                request: { auth: 'inherit' },
                items: [...requests, ...moduleProbes(section)].map((request, index) =>
                    brunoRequest(request, index + 1)
                )
            }
        ],
        2
    );

const brunoHeader = (contract: Contract): string =>
    stringifyYaml(
        {
            opencollection: '1.0.0',
            info: { name: COLLECTION_NAME },
            config: {
                environments: (contract.servers ?? []).map((server) => ({
                    name: server.description ?? 'Local',
                    variables: [{ name: 'baseUrl', value: server.url }]
                }))
            },
            items: null
        },
        { lineWidth: 0 }
    ).replace(/items: null\n$/, 'items:\n');

const brunoFooter = (): string =>
    stringifyYaml({ bundled: true }, { lineWidth: 0 }) as unknown as string;

/* ── Insomnia ───────────────────────────────────────────────────────────────────────────────── */

const insomniaRequest = (request: CollectionRequest, sortKey: number): unknown => {
    const body = bodyText(request.body);
    const identity = `${request.method} ${request.template}`;

    return {
        url: `{{ _.baseURL }}${request.resolvedPath}${request.query}`,
        name: request.name,
        meta: {
            id: `req_${stableId(identity)}`,
            created: GENERATED_AT,
            modified: GENERATED_AT,
            isPrivate: false,
            description: request.description,
            sortKey
        },
        method: request.method,
        ...(body ? { body: { mimeType: 'application/json', text: body } } : {}),
        headers: [
            ...(body ? [{ name: 'Content-Type', value: 'application/json' }] : []),
            { name: 'Accept', value: 'application/json' },
            ...Object.entries(request.headers ?? {}).map(([name, value]) => ({ name, value }))
        ],
        // An open endpoint still declares the scheme, disabled: Insomnia shows the auth tab either
        // way, and a reader can enable it to check what the endpoint does with a token it did not
        // ask for. It is also the shape the tool's own export writes.
        authentication: request.secured
            ? { type: 'bearer', token: '{{ _.token }}' }
            : { type: 'bearer', disabled: true, token: '' },
        settings: {
            renderRequestBody: true,
            encodeUrl: true,
            followRedirects: 'global',
            cookies: { send: true, store: true },
            rebuildPath: true
        }
    };
};

const insomniaSection = (
    section: SectionName,
    requests: CollectionRequest[],
    sortKey: number
): string =>
    yamlBlock(
        [
            {
                name: folderName(section),
                meta: {
                    id: `fld_${stableId(section)}`,
                    created: GENERATED_AT,
                    modified: GENERATED_AT,
                    sortKey,
                    description: ''
                },
                children: [...requests, ...moduleProbes(section)].map((request, index) =>
                    insomniaRequest(request, sortKey + index + 1)
                )
            }
        ],
        2
    );

const insomniaHeader = (): string =>
    stringifyYaml(
        {
            type: 'collection.insomnia.rest/5.0',
            schema_version: '5.1',
            name: COLLECTION_NAME,
            meta: {
                id: `wrk_${stableId(COLLECTION_NAME)}`,
                created: GENERATED_AT,
                modified: GENERATED_AT,
                description: ''
            },
            collection: null
        },
        { lineWidth: 0 }
    ).replace(/collection: null\n$/, 'collection:\n');

const insomniaFooter = (contract: Contract): string =>
    stringifyYaml(
        {
            environments: {
                name: 'Base Environment',
                meta: {
                    id: `env_${stableId('base')}`,
                    created: GENERATED_AT,
                    modified: GENERATED_AT,
                    isPrivate: false
                },
                data: {
                    baseURL: contract.servers?.[0]?.url ?? 'http://localhost:3000',
                    token: ''
                }
            }
        },
        { lineWidth: 0 }
    );

/* ── Mockoon ────────────────────────────────────────────────────────────────────────────────── */

/** `/products/{id}` as Mockoon writes it: no leading slash, `:param` placeholders. */
const mockoonEndpoint = (template: string): string =>
    template.replace(/^\//, '').replaceAll(/\{(\w+)}/g, ':$1');

const mockoonRoute = (request: CollectionRequest): unknown => {
    const identity = `${request.method} ${request.template}`;

    return {
        uuid: stableUuid(identity),
        type: 'http',
        documentation: request.name,
        method: request.method.toLowerCase(),
        endpoint: mockoonEndpoint(request.template),
        responses: request.responses.map((response, index) => ({
            uuid: stableUuid(`${identity} ${response.status}`),
            body: response.body === null ? '' : JSON.stringify(response.body, undefined, 2),
            latency: 0,
            statusCode: response.status,
            label: response.label,
            headers: [{ key: 'Content-Type', value: 'application/json' }],
            bodyType: 'INLINE',
            filePath: '',
            databucketID: '',
            sendFileAsBody: false,
            rules: [],
            rulesOperator: 'OR',
            disableTemplating: false,
            fallbackTo404: false,
            default: index === 0,
            crudKey: 'id',
            callbacks: []
        })),
        responseMode: null,
        streamingMode: null,
        streamingInterval: 0
    };
};

const mockoonSection = (requests: CollectionRequest[]): string =>
    jsonBlock(
        requests.map((request) => mockoonRoute(request)),
        4
    )
        .replace(/^ {4}\[\n/, '')
        .replace(/\n {4}]\n$/, '\n');

const mockoonTree = (requests: CollectionRequest[]): string =>
    jsonBlock(
        requests.map((request) => ({
            type: 'route',
            uuid: stableUuid(`${request.method} ${request.template}`)
        })),
        4
    )
        .replace(/^ {4}\[\n/, '')
        .replace(/\n {4}]\n$/, '\n');

const mockoonHeader = (): string =>
    JSON.stringify(
        {
            uuid: stableUuid(COLLECTION_NAME),
            lastMigration: 33,
            name: COLLECTION_NAME,
            endpointPrefix: '',
            latency: 0,
            port: 3001,
            hostname: ''
        },
        undefined,
        2
    ).replace(/\n}$/, ',\n  "folders": [],\n  "routes": [\n');

const mockoonTreeHeader = (): string => '  ],\n  "rootChildren": [\n';

const mockoonFooter = (): string =>
    '  ],\n' +
    JSON.stringify(
        {
            proxyMode: false,
            proxyHost: '',
            proxyRemovePrefix: false,
            tlsOptions: {
                enabled: false,
                type: 'CERT',
                pfxPath: '',
                certPath: '',
                keyPath: '',
                caPath: '',
                passphrase: ''
            },
            cors: true,
            headers: [
                { key: 'Content-Type', value: 'application/json' },
                { key: 'Access-Control-Allow-Origin', value: '*' },
                {
                    key: 'Access-Control-Allow-Methods',
                    value: 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS'
                },
                {
                    key: 'Access-Control-Allow-Headers',
                    value: 'Content-Type, Origin, Accept, Authorization, Content-Length, X-Requested-With, Accept-Language'
                }
            ],
            proxyReqHeaders: [{ key: '', value: '' }],
            proxyResHeaders: [{ key: '', value: '' }],
            data: [],
            callbacks: []
        },
        undefined,
        2
    )
        .replace(/^{\n/, '')
        .replace(/\n}$/, '\n}\n');

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * The generated fragment set
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Where a tool's shared scaffolding lives. Mirrors `collectionFragment` for the module slices. */
export const collectionSharedFragment = (tool: CollectionTool, part: string): string =>
    path.join(
        REPO_ROOT,
        'shared',
        'contracts',
        `${tool}.${part}.${tool === 'mockoon' ? 'json' : 'yml'}`
    );

/**
 * Every fragment this generator owns, as absolute path → content.
 *
 * Returned rather than written so the CLI can diff instead of writing, and so
 * `tests/cross-cutting/contract-bundles.test.ts` can assert the committed fragments are what a
 * fresh run produces. A generated file checked on nobody's machine is a fork waiting to happen.
 */
export const generateCollectionFragments = (): Map<string, string> => {
    const contract = readContract();
    const requests = collectionRequests(contract);
    const bySection = new Map<SectionName, CollectionRequest[]>(
        SECTION_ORDER.map((section) => [
            section,
            requests.filter((request) => request.section === section)
        ])
    );

    const fragments = new Map<string, string>([
        [collectionSharedFragment('bruno', 'header'), brunoHeader(contract)],
        [collectionSharedFragment('bruno', 'footer'), brunoFooter()],
        [collectionSharedFragment('insomnia', 'header'), insomniaHeader()],
        [collectionSharedFragment('insomnia', 'footer'), insomniaFooter(contract)],
        [collectionSharedFragment('mockoon', 'header'), mockoonHeader()],
        [collectionSharedFragment('mockoon', 'tree.header'), mockoonTreeHeader()],
        [collectionSharedFragment('mockoon', 'footer'), mockoonFooter()]
    ]);

    for (const [index, section] of SECTION_ORDER.entries()) {
        const sectionRequests = bySection.get(section) ?? [];

        fragments.set(
            collectionFragment('bruno', section),
            brunoSection(section, sectionRequests, index + 1)
        );
        fragments.set(
            collectionFragment('insomnia', section),
            insomniaSection(section, sectionRequests, index * 1000)
        );
        fragments.set(collectionFragment('mockoon', section), mockoonSection(sectionRequests));
        fragments.set(collectionFragment('mockoon', section, 'tree'), mockoonTree(sectionRequests));
    }

    return fragments;
};

/** The fragments whose committed content differs from a fresh generation. */
export const staleCollectionFragments = (
    fragments: Map<string, string> = generateCollectionFragments()
): string[] =>
    [...fragments]
        .filter(([file, content]) => !existsSync(file) || readFileSync(file, 'utf8') !== content)
        .map(([file]) => file);

export { COLLECTION_TOOLS };
