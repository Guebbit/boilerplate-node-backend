/**
 * Contract-derived request tests: for every write endpoint, does the API accept every payload
 * its own contract declares legal, and reject exactly what it declares illegal?
 *
 * Mirror image of the rest of `tests/contract/*`: those compare a known-good real RESPONSE
 * against `openapi.yaml`; this compares openapi.yaml-derived REQUESTS against the real API.
 * Two bug classes, one per assertion:
 *
 *   - `validPayload()` → expect 2xx. Catches a validator TIGHTER than its own contract — an
 *     endpoint rejecting a payload the spec declares legal.
 *   - `invalidPayloads()` → each entry expects 422 and a `ValidationErrorResponse`-shaped body.
 *     Catches a validator LAXER than its contract — the spec promises a constraint that isn't
 *     enforced.
 *
 * Four mechanisms produce that drift, all of them still live in this codebase. They are named
 * here because each will do it again, and because the right correction differs per case —
 * "tighten the validator" is not always the answer:
 *
 *   - **A spec format that does not describe the field.** `imageUrl` holds a *relative* upload
 *     path, so it is a shared `ImageUrl` schema with `format: uri-reference`; declaring it
 *     `format: uri` would force every validator to override the spec back to a plain
 *     `z.string()`, and tightening the validators to match instead would reject every upload the
 *     API itself produces. Correct the spec, not the validator.
 *   - **`.extend()` on a generated schema REPLACES a field**, dropping every constraint the
 *     override does not restate. So a hand schema over a generated body adds refinements
 *     (`zodProductCreateSchema`) and never replaces a field.
 *   - **Coercion running before validation** hides a wrong type from the check that would reject
 *     it. `!!request.body.active` and `coerceStringArray(...)` run only for `multipart/form-data`,
 *     the one transport that needs them — see `readInput` and `docs/theory/request-input.md`.
 *   - **Validating a subset of a schema** lets an unchecked field reach Mongoose and throw a
 *     CastError, answering 500 where the contract promises 422. A controller parses the whole
 *     generated body, not a `.pick()` of it.
 *
 * Generated data is additive, same convention as a module's `tests/factories.ts`: deterministic
 * scenario tests keep using the hand-written factories. This file exists specifically for what
 * they can't answer — "does the API honour its own contract for ANY legal input" — never "does
 * this specific scenario behave correctly".
 */
import '@tests/contract';
import type { Response } from 'supertest';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { roleReaching } from '@tests/shopper-routes';
import { PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { ZodType } from 'zod';
import { validPayload, invalidPayloads } from '@tests/contract-data';
import { isNullable, listOperations, type Operation, type SchemaNode } from '@tests/spec-walk';
import { seedWorld, buildUrl, requiredHeadersOf, OBJECT_ID, type World } from '@tests/spec-world';
import * as zodSchemas from '@api/schemas.zod';
import { givenLocale } from '@modules/locales/tests/factories';

setupTestDb();

// `@tests/http`'s import boots the real app, which registers every enabled module's `translatables`.

// ─── invalid QUERY parameters ──────────────────────────────────────────────────────────────────
//
// Everything above sends a bad BODY. This is the query-side counterpart: every `in: query`
// parameter the spec constrains with an `enum` or a `pattern` gets one case here, an
// obviously-violating value against the real route, expecting 422.

/** An admin-authenticated GET against `path`, with `query` appended as-is. */
const adminQuery =
    (path: string) =>
    async (query: string): Promise<Response> => {
        const { bearer } = await authenticateAs('admin');
        return api().get(`${path}?${query}`).set('Authorization', bearer);
    };

/**
 * {@link adminQuery} for an operation that refuses a request without its required parameters:
 * `base` rides along, and the case's own invalid parameter is appended to it.
 */
const adminQueryWith =
    (path: string, base: string) =>
    async (query: string): Promise<Response> => {
        const { bearer } = await authenticateAs('admin');
        return api().get(`${path}?${base}&${query}`).set('Authorization', bearer);
    };

/** A locale row real enough for `/locales/{locale}/...` to reach its own query validation, rather than 404ing on an unknown tag first. */
const withRealLocale = async (): Promise<string> => {
    await givenLocale('qp');
    return 'qp';
};

/** One way to reach an operation with an enum/pattern query parameter, over real HTTP. */
interface QueryFixture {
    request: (query: string) => Promise<Response>;
}

const QUERY_FIXTURES: Partial<Record<string, QueryFixture>> = {
    'GET /audit': { request: adminQuery('/audit') },
    'GET /observability/audit': { request: adminQuery('/observability/audit') },
    'GET /feedback': { request: adminQuery('/feedback') },
    'GET /examples': { request: adminQuery('/examples') },
    'GET /orders': { request: adminQuery('/orders') },
    'GET /orders/export': { request: adminQuery('/orders/export') },
    'GET /returns': { request: adminQuery('/returns') },
    'GET /returns/options': { request: adminQuery('/returns/options') },
    'GET /inventory/movements': { request: adminQuery('/inventory/movements') },
    'GET /delivery/fulfillment-orders': { request: adminQuery('/delivery/fulfillment-orders') },
    'GET /delivery/fulfillment-orders/summary': {
        request: adminQuery('/delivery/fulfillment-orders/summary')
    },
    'GET /delivery/fulfillment-orders/release-date-impact': {
        request: adminQuery('/delivery/fulfillment-orders/release-date-impact')
    },
    'GET /delivery/fulfillment-orders/restock-date-impact': {
        request: adminQuery('/delivery/fulfillment-orders/restock-date-impact')
    },
    'GET /webhooks/deliveries': { request: adminQuery('/webhooks/deliveries') },
    'GET /payments': { request: adminQuery('/payments') },
    'GET /payments/refunds': { request: adminQuery('/payments/refunds') },
    'GET /stats/sales': {
        request: adminQueryWith('/stats/sales', 'from=2026-03-01&to=2026-03-31')
    },
    'GET /stats/products/{productId}': {
        request: adminQueryWith(
            '/stats/products/ffffffffffffffffffffffff',
            'from=2026-03-01&to=2026-03-31'
        )
    },
    'GET /locales/{locale}/messages': {
        // Public: no `security` on this operation at all.
        request: async (query) => {
            const tag = await withRealLocale();
            return api().get(`/locales/${tag}/messages?${query}`);
        }
    },
    'GET /locales/{locale}/entries': {
        request: async (query) => {
            const [tag, { bearer }] = await Promise.all([
                withRealLocale(),
                authenticateAs('admin')
            ]);
            return api().get(`/locales/${tag}/entries?${query}`).set('Authorization', bearer);
        }
    }
};

/**
 * (operation, parameter) pairs where a declared enum/pattern violation does NOT answer 422 today
 * — verified live, not assumed:
 *
 * - `GET /locales/{locale}/messages` `app`: NOT a bug — `services/messages.ts#readMessages`
 *   answers 404 for anything that isn't a configured frontend app, malformed or merely unknown
 *   alike, so a 403 or an empty 200 for "wrong kind of app" can't leak that a draft translation
 *   exists under a different (backend) app. A malformed id is just one more way to not be a
 *   frontend app.
 */
const KNOWN_GAPS = new Set(['GET /locales/{locale}/messages::app']);

/** A value that violates `schema`'s `enum` or `pattern` — whichever the field declares. */
const invalidQueryValue = (schema: SchemaNode): string => {
    if (schema.enum) return 'not-a-declared-enum-value';
    if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        // Deliberately not fenced by a range check for exactly-one-char patterns etc.: the goal
        // is ONE string this pattern refuses, not a generic negation of an arbitrary regex.
        const candidate = ['INVALID VALUE !!!', '???', '__nope__', ''].find(
            (value) => !regex.test(value)
        );
        if (candidate === undefined)
            throw new Error(
                `invalidQueryValue: every candidate satisfies ${schema.pattern} — add a garbage string that doesn't.`
            );
        return candidate;
    }
    throw new Error('invalidQueryValue: schema has neither enum nor pattern to violate');
};

/** Every (operation, parameter) pair this sweep can generate a violation for. */
const QUERY_CASES = listOperations().flatMap((operation) =>
    operation.queryParameters
        .filter((param) => param.schema?.enum !== undefined || param.schema?.pattern !== undefined)
        .map((param) => ({
            key: `${operation.method.toUpperCase()} ${operation.path}`,
            paramName: param.name,
            schema: param.schema!
        }))
);

describe('invalid query parameters (contract-derived)', () => {
    it('has a fixture for every operation with an enum/pattern query parameter', () => {
        const missing = [...new Set(QUERY_CASES.map(({ key }) => key))].filter(
            (key) => !(key in QUERY_FIXTURES)
        );
        expect(missing).toEqual([]);
    });

    it.each(QUERY_CASES.filter(({ key, paramName }) => !KNOWN_GAPS.has(`${key}::${paramName}`)))(
        '$key rejects an invalid $paramName with 422',
        async ({ key, paramName, schema }) => {
            const response = await QUERY_FIXTURES[key]!.request(
                `${paramName}=${encodeURIComponent(invalidQueryValue(schema))}`
            );

            expect(response.status).toBe(422);
        }
    );
});

// ─── every write operation ─────────────────────────────────────────────────────────────────────
//
// Everything the spec declares under POST, PUT or PATCH is walked here from `listOperations()`, so
// a write added tomorrow is covered without anyone remembering to add it. The property that holds
// without a scenario behind each one: a body the contract declares legal is never refused as a
// validation failure, and one it declares illegal always is. `STRICT_2XX` names the operations
// whose legal body, once `FIELD_OVERRIDES` has relinked it, is also answered with a success.

/** The operations whose relinked legal body must be answered with a 2xx, not just not refused. */
const STRICT_2XX = new Set([
    'createUser',
    'createProduct',
    'createOrder',
    'addCartItem',
    'createFeedbackRequest',
    'signup'
]);

/** Every POST/PUT/PATCH with a JSON body. */
const WRITE_OPERATIONS = listOperations().filter(
    (operation) => ['post', 'put', 'patch'].includes(operation.method) && operation.bodySchema
);

/** `createUser` -> `CreateUserBody`: the name orval gives the Zod schema of an operation's body. */
const zodBodyName = (operationId: string): string =>
    `${operationId.charAt(0).toUpperCase()}${operationId.slice(1)}Body`;

/** The operation's generated Zod body schema, when it has one. */
const zodBodyOf = (operation: Operation): ZodType | undefined => {
    const exported: unknown = Object.entries(zodSchemas).find(
        ([name]) => name === zodBodyName(operation.operationId ?? '')
    )?.[1];
    return exported instanceof ZodType ? exported : undefined;
};

/** A label that names the operation the way the fuzz suite does. */
const labelOf = (operation: Operation): string =>
    `${operation.method.toUpperCase()} ${operation.path}`;

/**
 * Bodies whose Zod schema is a `record`, which `contract-data.ts` does not generate: a hand-written
 * legal body stands in, and there is no per-field violation to derive.
 */
const RECORD_BODIES = new Set(['replaceEntityTranslations', 'upsertEntityTranslations']);

/**
 * Operations whose legal body is still refused by something the body cannot carry, and why. They
 * skip the "not refused" cases and keep the "violations are refused" ones where those hold.
 */
const NEEDS_STATE_OR_SIGNATURE: Record<string, string> = {
    confirmEmailVerification: 'the token is issued by the verification mail',
    confirmPasswordReset: 'the token is issued by the reset mail',
    confirmEmailChange: 'the token is issued by the change-confirmation mail',
    undoEmailChange: 'the token is issued by the change notice mailed to the old address',
    confirmTwoFactorMethod: 'a setup for that method must be under way',
    regenerateBackupCodes: 'two-factor must already be enabled on the account',
    receivePaymentWebhook:
        'a provider-signed request: the signature is checked before the body, and a bad one is 400'
};

/**
 * `operationId::field` pairs where a wrong-typed value is accepted on purpose: `readInput`
 * coerces `category` and `tag` to a one-element array because the same schema serves the GET
 * query string, where everything is text (`docs/theory/request-input.md`).
 */
const ACCEPTS_ANY_TYPE = new Set(['searchProducts::category', 'searchProducts::tag']);

/** Operations whose violations are not answered 422, because the refusal comes earlier. */
const REFUSED_BEFORE_VALIDATION = new Set(['receivePaymentWebhook']);

/** Computes the real value for one field from the seeded rows and the payload around it. */
type FieldOverride = (world: World, payload: Record<string, unknown>) => unknown;

/**
 * Fields the contract cannot describe well enough to generate: an `Id` is an opaque string to the
 * schema but an ObjectId to the database, a confirmation must equal the password beside it, a
 * permission must be one the caller holds. The relinking is done
 * once per operation, and never applied to the field a case is testing.
 */
const FIELD_OVERRIDES: Record<string, Record<string, FieldOverride>> = {
    // `role` is a plain string to the schema, because roles are data a deployment may add to.
    createUser: { role: () => 'editor' },
    // `translations` is a `Record<locale, ...>` to the schema: it cannot say the key must be the
    // deployment's fallback locale, whose row must exist.
    createProduct: { translations: () => ({ en: { title: 'Generated Product Title' } }) },
    createOrder: {
        userId: (world) => world.userId,
        // A shelf no generated quantity can exhaust, and the admin line limit is a deployment knob
        // under the contract's wider ceiling: one unit of the seeded product.
        items: (world, payload) =>
            Array.isArray(payload.items)
                ? (payload.items as Record<string, unknown>[]).map((item) => ({
                      ...item,
                      quantity: 1,
                      productId: world.productId
                  }))
                : payload.items
    },
    // The generated quantity is the contract's hard ceiling (999); the shop's per-line cap refuses it.
    addCartItem: { productId: (world) => world.productId, quantity: () => 1 },
    signup: { passwordConfirm: (_world, payload) => payload.password },
    searchUsers: { id: () => [OBJECT_ID] },
    searchProducts: { id: () => [OBJECT_ID] },
    searchOrders: {
        id: () => [OBJECT_ID],
        userId: (world) => world.userId,
        productId: (world) => world.productId
    },
    // The generated quantity is the contract's hard ceiling (999); the shop's per-line cap refuses it.
    updateCartItemById: { quantity: () => 1 },
    createPaymentIntent: { orderId: (world) => world.orderId },
    createReturn: {
        orderId: (world) => world.orderId,
        lines: (world) => [{ productId: world.productId, quantity: 1 }],
        // A cancellation names a fulfillment order and sends no lines; the schema cannot say so, so
        // the legal body is the goods return the generated `lines` belong to.
        kind: () => 'return',
        fulfillmentOrderId: () => undefined
    },
    receiveStock: { productId: (world) => world.productId },
    adjustStock: { productId: (world) => world.productId },
    changePassword: {
        currentPassword: () => PLAIN_PASSWORD,
        passwordConfirm: (_world, payload) => payload.password
    },
    confirmPasswordReset: { passwordConfirm: (_world, payload) => payload.password },
    // `otp` is optional and only legal for an account with a second factor armed; the generated
    // account has none, so the legal body leaves it out (it is a 422, not a schema refusal).
    reauth: { password: () => PLAIN_PASSWORD, otp: () => undefined },
    mintApiKey: { permissions: () => ['read:User'] },
    // An event name is legal only if the catalogue lists it, which the schema cannot say: `*` always is.
    createWebhookSubscription: { eventTypes: () => ['*'] },
    replaceWebhookSubscription: { eventTypes: () => ['*'] },
    updateWebhookSubscription: { eventTypes: () => ['*'] },
    replaceProductById: { translations: () => ({ en: { title: 'Generated Product Title' } }) },
    updateProductById: { translations: () => ({ en: { title: 'Generated Product Title' } }) }
};

/** A legal translations body: the fallback locale, with one field, which is what a write must carry. */
const FALLBACK_TRANSLATIONS = { en: { fields: { title: 'Generated Product Title' } } };

/**
 * A legal body for the operation: Zod-generated for an object, hand-written for a map.
 *
 * @throws {Error} when the operation has no generated Zod body — the census test names it first
 */
const legalBody = (operation: Operation): Record<string, unknown> => {
    if (RECORD_BODIES.has(operation.operationId ?? '')) return FALLBACK_TRANSLATIONS;
    const zod = zodBodyOf(operation);
    if (!zod) throw new Error(`no generated Zod body for ${labelOf(operation)}`);
    return validPayload(zod);
};

/** The names of the operation's body fields whose `type` admits `'null'` (3.1). */
const nullableFieldsOf = (schema: SchemaNode | undefined): string[] =>
    Object.entries(schema?.properties ?? {})
        .filter(([, property]) => isNullable(property))
        .map(([name]) => name);

/** The two request bodies a PATCH may carry: plain JSON, and merge-patch when declared. */
const contentTypesOf = (operation: Operation): string[] => [
    'application/json',
    ...(operation.mergePatchSchema ? ['application/merge-patch+json'] : [])
];

/**
 * Sends `body` to `operation` as an admin (a customer on the shopping routes, which an
 * administrator holds no key for), against a world where its path names real rows.
 *
 * @param operation - what to call
 * @param body - the payload under test
 * @param contentType - which declared request body this is
 * @param skipField - the field the case is about; the overrides leave it alone
 */
const sendWrite = async (
    operation: Operation,
    body: Record<string, unknown>,
    contentType = 'application/json',
    skipField?: string
): Promise<Response> => {
    const { user, bearer } = await authenticateAs(roleReaching(operation));
    const world = await seedWorld(user);
    const payload = { ...body };
    for (const [field, override] of Object.entries(
        FIELD_OVERRIDES[operation.operationId ?? ''] ?? {}
    ))
        if (field !== skipField) payload[field] = override(world, payload);

    return api()
        [operation.method](buildUrl(operation, world))
        .set('Authorization', bearer)
        .set('Accept-Language', 'en')
        .set(requiredHeadersOf(operation))
        .type(contentType)
        .send(payload);
};

/** A refusal of the body itself: validation, or a content type the operation does not take. */
const refusesTheBody = (response: Response): boolean =>
    response.status === 422 || response.status === 415;

/** The operations a legal body alone is enough to get past. */
const STATEFUL_FREE_OPERATIONS = WRITE_OPERATIONS.filter(
    (operation) =>
        !(operation.operationId ?? '') ||
        !((operation.operationId ?? '') in NEEDS_STATE_OR_SIGNATURE)
);

/** One legal-payload case per operation and content type it accepts. */
const LEGAL_CASES = STATEFUL_FREE_OPERATIONS.flatMap((operation) =>
    contentTypesOf(operation).map((contentType) => ({
        label: labelOf(operation),
        operation,
        contentType
    }))
);

/** One null case per nullable body field, per content type. */
const NULL_CASES = WRITE_OPERATIONS.filter(
    (operation) => !((operation.operationId ?? '') in NEEDS_STATE_OR_SIGNATURE)
).flatMap((operation) =>
    nullableFieldsOf(operation.bodySchema).flatMap((field) =>
        contentTypesOf(operation).map((contentType) => ({
            label: labelOf(operation),
            operation,
            field,
            contentType
        }))
    )
);

/** One violation case per constraint a body schema declares, where Zod can enumerate them. */
const VIOLATION_CASES = WRITE_OPERATIONS.flatMap((operation) => {
    const zod = zodBodyOf(operation);
    if (!zod || RECORD_BODIES.has(operation.operationId ?? '')) return [];
    if (REFUSED_BEFORE_VALIDATION.has(operation.operationId ?? '')) return [];
    return invalidPayloads(zod)
        .filter(({ field }) => !ACCEPTS_ANY_TYPE.has(`${operation.operationId ?? ''}::${field}`))
        .map(({ field, violation, payload }) => ({
            label: labelOf(operation),
            operation,
            field,
            violation,
            payload
        }));
});

/**
 * Fails with the response body in the message when the operation refused the body itself, so a
 * failing case names the field the validator objected to rather than just "true".
 */
const expectBodyAccepted = (response: Response): void => {
    expect(refusesTheBody(response) ? response.body : 'accepted').toBe('accepted');
    expect(response.status).toBeLessThan(500);
};

describe('every write operation (contract-derived)', () => {
    // The fallback locale must exist as a row for a product or translation write to name it.
    beforeEach(async () => {
        await givenLocale('en');
    });

    it('walks every write operation the spec declares', () => {
        expect(WRITE_OPERATIONS.length).toBeGreaterThan(40);
    });

    it('names only operations that exist in every table above', () => {
        const known = new Set(WRITE_OPERATIONS.map((operation) => operation.operationId));
        const named = [
            ...Object.keys(NEEDS_STATE_OR_SIGNATURE),
            ...Object.keys(FIELD_OVERRIDES),
            ...REFUSED_BEFORE_VALIDATION,
            ...STRICT_2XX
        ];
        expect(named.filter((id) => !known.has(id))).toEqual([]);
    });

    it('has a generated Zod body schema for every operation it walks', () => {
        const missing = WRITE_OPERATIONS.filter((operation) => !zodBodyOf(operation)).map(
            (operation) => labelOf(operation)
        );
        expect(missing).toEqual([]);
    });

    it.each(LEGAL_CASES)(
        '$label does not refuse a payload the contract declares legal, as $contentType',
        async ({ operation, contentType }) => {
            const response = await sendWrite(operation, legalBody(operation), contentType);

            expectBodyAccepted(response);
            if (!STRICT_2XX.has(operation.operationId ?? '')) return;

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
        }
    );

    it.each(NULL_CASES)(
        '$label accepts null for the nullable $field, as $contentType',
        async ({ operation, field, contentType }) => {
            const response = await sendWrite(
                operation,
                { ...legalBody(operation), [field]: null },
                contentType,
                field
            );

            expectBodyAccepted(response);
        }
    );

    it.each(VIOLATION_CASES)(
        '$label rejects a payload where $field is $violation',
        async ({ operation, field, payload }) => {
            const response = await sendWrite(operation, payload, 'application/json', field);

            expect(response.status).toBe(422);
        }
    );
});
