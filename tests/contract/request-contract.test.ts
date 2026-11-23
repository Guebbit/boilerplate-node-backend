/**
 * Contract-derived request tests: for every write endpoint, does the API accept every payload its
 * own contract declares legal, and reject exactly what it declares illegal? The mirror of the rest
 * of `tests/contract/*`, which compare a real RESPONSE against `openapi.yaml`.
 *
 * `validPayload()`:    expects 2xx. Catches a validator TIGHTER than its contract.
 * `invalidPayloads()`: each expects 422 and a `Problem` body. Catches one LAXER than its contract.
 * Data:                additive to a module's `tests/factories.ts`, which keep the deterministic
 *                      scenarios. This asks "does the API honour its contract for ANY legal input".
 *
 * Four live mechanisms produce the drift; the right fix differs per case:
 *   - A spec format that does not describe the field. `imageUrl` holds a relative upload path, so
 *     the shared `ImageUrl` is `format: uri-reference`; `format: uri` would make every validator
 *     override the spec back to `z.string()`. Correct the spec, not the validator.
 *   - `.extend()` on a generated schema REPLACES a field and drops its constraints. A hand schema
 *     adds refinements (`zodProductCreateSchema`) and never replaces a field.
 *   - Coercion before validation hides a wrong type. `!!request.body.active` and
 *     `coerceStringArray(...)` run only for `multipart/form-data` (see `readInput`).
 *   - Validating a subset lets an unchecked field reach Mongoose as a CastError (500, not 422).
 *     A controller parses the whole generated body, never a `.pick()` of it.
 *
 * @see docs/understand/request-input.md#the-rules-behind-the-table
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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MODULES_ROOT, isDeployed } from '@tests/paths';

setupTestDb();

/**
 * The table rows a module owns, kept only where that module is deployed: a checkout without it
 * (`demo:remove`) names no operation it lacks, and the tables stay exact for what remains.
 * @param module - the folder name under `src/modules/`
 * @param rows - the entries (a record's) that belong to it
 */
const ownedBy = <T extends object>(module: string, rows: T): Partial<T> =>
    isDeployed(module) ? rows : {};

/**
 * {@link ownedBy} for a list of operation ids.
 * @param module - the folder name under `src/modules/`
 * @param operationIds - the ids that belong to it
 */
const idsOwnedBy = (module: string, operationIds: string[]): string[] =>
    isDeployed(module) ? operationIds : [];

// `@tests/http`'s import boots the real app, which registers every enabled module's `translatables`.

/**
 * ─── invalid QUERY parameters ──────────────────────────────────────────────────────────────────
 *
 * Everything above sends a bad BODY. This is the query-side counterpart: every `in: query`
 * parameter the spec constrains with an `enum`, a `pattern` or a numeric bound gets a case here, an
 * obviously-violating value against the real route, expecting 422.
 */

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

/** One way to reach an operation with a constrained (enum, pattern or numeric bound) query parameter, over real HTTP. */
interface QueryFixture {
    /** Sends the operation with `query` appended, as a real request. */
    request: (query: string) => Promise<Response>;
}

/** A valid query per list route, for routes whose filters need a real value. */
const QUERY_FIXTURES: Partial<Record<string, QueryFixture>> = {
    'GET /audit': { request: adminQuery('/audit') },
    'DELETE /notifications': {
        request: async (query) => {
            const { bearer } = await authenticateAs('admin');
            return api().delete(`/notifications?${query}`).set('Authorization', bearer);
        }
    },
    'GET /observability/audit': { request: adminQuery('/observability/audit') },
    'GET /tasks': { request: adminQuery('/tasks') },
    'GET /examples': { request: adminQuery('/examples') },
    'GET /orders': { request: adminQuery('/orders') },
    'GET /users': { request: adminQuery('/users') },
    'GET /orders/export': { request: adminQuery('/orders/export') },
    'GET /orders/{id}/timeline': {
        request: adminQuery('/orders/ffffffffffffffffffffffff/timeline')
    },
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
    'GET /products': { request: adminQuery('/products') },
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
    },
    'GET /locales/{locale}/apps/{app}/entries': {
        request: async (query) => {
            const [tag, { bearer }] = await Promise.all([
                withRealLocale(),
                authenticateAs('admin')
            ]);
            return api()
                .get(`/locales/${tag}/apps/demo-fe/entries?${query}`)
                .set('Authorization', bearer);
        }
    },
    'GET /api-keys': { request: adminQuery('/api-keys') },
    'GET /inventory/levels': { request: adminQuery('/inventory/levels') },
    'GET /inventory/preorders': { request: adminQuery('/inventory/preorders') },
    'GET /webhooks/subscriptions': { request: adminQuery('/webhooks/subscriptions') },
    'GET /stats/products': {
        request: adminQueryWith('/stats/products', 'from=2026-03-01&to=2026-03-31')
    }
};

/**
 * (operation, parameter) pairs where a declared enum/pattern/bound violation does NOT answer 422 today
 * — verified live, not assumed:
 *
 * - `GET /locales/{locale}/messages` `app`: NOT a bug — `services/messages.ts#readMessages`
 *   answers 404 for anything that isn't a configured frontend app, malformed or merely unknown
 *   alike, so a 403 or an empty 200 for "wrong kind of app" can't leak that a draft translation
 *   exists under a different (backend) app. A malformed id is just one more way to not be a
 *   frontend app.
 */
const KNOWN_GAPS = new Set(['GET /locales/{locale}/messages::app']);

/**
 * Every value that violates `schema`: one for an `enum` or a `pattern`, and one past each numeric
 * bound the field declares (`maximum + 1`, `minimum - 1`). The bound is our own code, a `.max()` in
 * each list controller's schema, so only a walk over the real routes sees one that was never wired.
 * @throws {Error} when no value can be found that violates the schema
 */
const invalidQueryValues = (schema: SchemaNode): string[] => {
    if (schema.enum) return ['not-a-declared-enum-value'];
    if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        /**
         * Deliberately not fenced by a range check for exactly-one-char patterns etc.: the goal
         * is ONE string this pattern refuses, not a generic negation of an arbitrary regex.
         */
        const candidate = ['INVALID VALUE !!!', '???', '__nope__', ''].find(
            (value) => !regex.test(value)
        );
        if (candidate === undefined)
            throw new Error(
                `invalidQueryValues: every candidate satisfies ${schema.pattern} — add a garbage string that doesn't.`
            );
        return [candidate];
    }
    const bounds = [
        schema.maximum === undefined ? undefined : String(schema.maximum + 1),
        schema.minimum === undefined ? undefined : String(schema.minimum - 1)
    ].filter((value) => value !== undefined);
    if (bounds.length === 0)
        throw new Error('invalidQueryValues: schema has no enum, pattern or bound to violate');
    return bounds;
};

/** Whether the schema declares something a query value can violate. */
const isConstrainedQuery = (schema: SchemaNode | undefined): schema is SchemaNode =>
    schema !== undefined &&
    (schema.enum !== undefined ||
        schema.pattern !== undefined ||
        schema.maximum !== undefined ||
        schema.minimum !== undefined);

/** Every (operation, parameter, violating value) this sweep can generate. */
const QUERY_CASES = listOperations().flatMap((operation) =>
    operation.queryParameters
        .filter((param) => isConstrainedQuery(param.schema))
        .flatMap((param) =>
            invalidQueryValues(param.schema!).map((value) => ({
                key: `${operation.method.toUpperCase()} ${operation.path}`,
                paramName: param.name,
                value
            }))
        )
);

describe('invalid query parameters (contract-derived)', () => {
    it('has a fixture for every operation with a constrained query parameter', () => {
        const missing = [...new Set(QUERY_CASES.map(({ key }) => key))].filter(
            (key) => !(key in QUERY_FIXTURES)
        );
        expect(missing).toEqual([]);
    });

    it.each(QUERY_CASES.filter(({ key, paramName }) => !KNOWN_GAPS.has(`${key}::${paramName}`)))(
        '$key rejects $paramName=$value with 422',
        async ({ key, paramName, value }) => {
            const response = await QUERY_FIXTURES[key]!.request(
                `${paramName}=${encodeURIComponent(value)}`
            );

            expect(response.status).toBe(422);
        }
    );
});

/**
 * ─── every write operation ─────────────────────────────────────────────────────────────────────
 *
 * Everything the spec declares under POST, PUT or PATCH is walked here from `listOperations()`, so
 * a write added tomorrow is covered without anyone remembering to add it. The property that holds
 * without a scenario behind each one: a body the contract declares legal is never refused as a
 * validation failure, and one it declares illegal always is. `STRICT_2XX` names the operations
 * whose legal body, once `FIELD_OVERRIDES` has relinked it, is also answered with a success.
 */

/** The operations whose relinked legal body must be answered with a 2xx, not just not refused. */
const STRICT_2XX = new Set([
    ...idsOwnedBy('users', ['createUser']),
    ...idsOwnedBy('products', ['createProduct']),
    ...idsOwnedBy('orders', ['createOrder']),
    ...idsOwnedBy('cart', ['addCartItem']),
    ...idsOwnedBy('tasks', ['createContactTask']),
    ...idsOwnedBy('account', ['signup'])
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
const RECORD_BODIES = new Set(['replaceEntityTranslations', 'updateEntityTranslations']);

/**
 * Operations whose legal body is still refused by something the body cannot carry, and why. They
 * skip the "not refused" cases and keep the "violations are refused" ones where those hold.
 */
const NEEDS_STATE_OR_SIGNATURE: Record<string, string> = {
    confirmEmailVerification: 'the token is issued by the verification mail',
    confirmPasswordReset: 'the token is issued by the reset mail',
    confirmEmailChange: 'the token is issued by the change-confirmation mail',
    restoreAccount: 'the token is issued by the deletion-scheduled mail',
    undoEmailChange: 'the token is issued by the change notice mailed to the old address',
    confirmTwoFactorMethod: 'a setup for that method must be under way',
    regenerateBackupCodes: 'two-factor must already be enabled on the account',
    disableTwoFactor: 'two-factor must already be enabled on the account',
    removeTwoFactorMethod: 'that method must already be armed on the account',
    ...ownedBy('payments', {
        receivePaymentWebhook:
            'a provider-signed request: the signature is checked before the body, and a bad one is 400'
    })
};

/**
 * `operationId::field` pairs where a wrong-typed value is accepted on purpose: `readInput`
 * coerces `category` and `tag` to a one-element array because the same schema serves the GET
 * query string, where everything is text.
 *
 * @see docs/understand/request-input.md#the-rules-behind-the-table
 */
const ACCEPTS_ANY_TYPE = new Set(
    idsOwnedBy('products', ['searchProducts::category', 'searchProducts::tag'])
);

/** Operations whose violations are not answered 422, because the refusal comes earlier. */
const REFUSED_BEFORE_VALIDATION = new Set(idsOwnedBy('payments', ['receivePaymentWebhook']));

/** Computes the real value for one field from the seeded rows and the payload around it. */
type FieldOverride = (world: World, payload: Record<string, unknown>) => unknown;

/**
 * Fields the contract cannot describe well enough to generate: an `Id` is an opaque string to the
 * schema but an ObjectId to the database, a confirmation must equal the password beside it, a
 * permission must be one the caller holds. The relinking is done
 * once per operation, and never applied to the field a case is testing.
 */
const FIELD_OVERRIDES: Record<string, Record<string, FieldOverride>> = {
    ...ownedBy('users', {
        // `role` is a plain string to the schema, because roles are data a deployment may add to.
        createUser: { role: () => 'editor' },
        assignUserRole: { role: () => 'editor' },
        searchUsers: { id: () => [OBJECT_ID] },
        // A generated date-time can be in the past; a purchase hold must end in the future.
        placeUserPurchaseHold: { until: () => new Date(Date.now() + 7 * 86_400_000).toISOString() }
    }),
    ...ownedBy('products', {
        /**
         * `translations` is a `Record<locale, ...>` to the schema: it cannot say a key must be a
         * language other than the default one, whose row must exist. No other language is legal here.
         */
        createProduct: { translations: () => ({}) },
        searchProducts: { id: () => [OBJECT_ID] },
        replaceProductById: { translations: () => ({}) },
        updateProductById: { translations: () => ({}) }
    }),
    ...ownedBy('orders', {
        createOrder: {
            userId: (world) => world.userId,
            /**
             * A shelf no generated quantity can exhaust, and the admin line limit is a deployment knob
             * under the contract's wider ceiling: one unit of the seeded product.
             */
            items: (world, payload) =>
                Array.isArray(payload.items)
                    ? (payload.items as Record<string, unknown>[]).map((item) => ({
                          ...item,
                          quantity: 1,
                          productId: world.productId
                      }))
                    : payload.items
        },
        searchOrders: {
            id: () => [OBJECT_ID],
            userId: (world) => world.userId,
            productId: (world) => world.productId
        }
    }),
    ...ownedBy('cart', {
        // The generated quantity is the contract's hard ceiling (999); the shop's per-line cap refuses it.
        addCartItem: { productId: (world) => world.productId, quantity: () => 1 },
        updateCartItemByProductId: { quantity: () => 1 }
    }),
    ...ownedBy('wishlist', { createWishlistItem: { productId: (world) => world.productId } }),
    ...ownedBy('stock-alerts', { createStockAlert: { productId: (world) => world.productId } }),
    ...ownedBy('payments', { createPayment: { orderId: (world) => world.orderId } }),
    ...ownedBy('returns', {
        createReturn: {
            orderId: (world) => world.orderId,
            lines: (world) => [{ productId: world.productId, quantity: 1 }],
            /**
             * A cancellation names a fulfillment order and sends no lines; the schema cannot say so, so
             * the legal body is the goods return the generated `lines` belong to.
             */
            kind: () => 'return',
            fulfillmentOrderId: () => undefined,
            /**
             * A buyer's own return takes neither field: the server sets the date, and a channel belongs
             * to a withdrawal that staff record. The schema declares both for the staff path.
             */
            requestedAt: () => undefined,
            statedVia: () => undefined,
            /**
             * A preferred remedy is legal only beside a `defective` or `wrong_item` reason, which the
             * schema cannot say; a generated pair that disagrees is a 422, not a schema refusal.
             */
            preferredRemedy: () => undefined
        }
    }),
    ...ownedBy('account', {
        signup: { passwordConfirm: (_world, payload) => payload.password },
        changePassword: {
            currentPassword: () => PLAIN_PASSWORD,
            passwordConfirm: (_world, payload) => payload.password
        },
        confirmPasswordReset: { passwordConfirm: (_world, payload) => payload.password },
        /**
         * `otp` is optional and only legal for an account with a second factor armed; the generated
         * account has none, so the legal body leaves it out (it is a 422, not a schema refusal).
         */
        reauth: { password: () => PLAIN_PASSWORD, otp: () => undefined }
    }),
    ...ownedBy('api-keys', { createApiKey: { permissions: () => ['read:User'] } }),
    // An event name is legal only if the catalogue lists it, which the schema cannot say: `*` always is.
    ...ownedBy('webhooks', {
        createWebhookSubscription: { eventTypes: () => ['*'] },
        replaceWebhookSubscription: { eventTypes: () => ['*'] },
        updateWebhookSubscription: { eventTypes: () => ['*'] }
    })
};

/** A legal translations body: one language besides the default, with one field. */
const LEGAL_TRANSLATIONS = {
    it: { fields: { title: 'Generated Product Title' }, origin: 'human' }
};

/**
 * A legal body for the operation: Zod-generated for an object, hand-written for a map.
 *
 * @throws {Error} when the operation has no generated Zod body — the census test names it first
 */
const legalBody = (operation: Operation): Record<string, unknown> => {
    if (RECORD_BODIES.has(operation.operationId ?? '')) return LEGAL_TRANSLATIONS;
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
    // The language a translation write names must exist as a row.
    beforeEach(async () => {
        await givenLocale('it');
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

/**
 * ─── a required header ─────────────────────────────────────────────────────────────────────────
 *
 * The walks above SEND every required header. This is the other half: leave it off and the
 * operation must refuse with 400 `IDEMPOTENCY_KEY_REQUIRED`. It is what keeps a new do-not-retry
 * route (one the contract marks with a required `Idempotency-Key`) from being mounted with the
 * optional middleware: the contract says required, the walk finds the route, the route must answer 400.
 */

/** Every operation the contract marks with a required `Idempotency-Key`. */
const KEY_REQUIRED_OPERATIONS = listOperations().filter((operation) =>
    operation.requiredHeaders.some((name) => name.toLowerCase() === 'idempotency-key')
);

describe('every operation that requires an Idempotency-Key (contract-derived)', () => {
    it('walks the do-not-retry operations the spec declares', () => {
        // A vacuous pass would read as green: this walk would check nothing if the filter found none.
        // So the walk finds some exactly when a deployed module's contract uses the header, read off disk.
        const declaring = readdirSync(MODULES_ROOT).filter((name) => {
            const contract = path.join(MODULES_ROOT, name, 'openapi.yaml');
            return (
                existsSync(contract) &&
                readFileSync(contract, 'utf8').includes('RequiredIdempotencyKeyHeader')
            );
        });
        expect(KEY_REQUIRED_OPERATIONS.length > 0).toBe(declaring.length > 0);
        expect(
            KEY_REQUIRED_OPERATIONS.map((operation) => operation.operationId).toSorted()
        ).toEqual(
            expect.arrayContaining([
                ...idsOwnedBy('inventory', ['adjustStock', 'receiveStock']),
                ...idsOwnedBy('payments', ['createRefund']),
                ...idsOwnedBy('delivery', ['shipFulfillmentOrder'])
            ])
        );
    });

    // `it.each` rejects an empty table: a checkout whose modules take no key has no operation to walk.
    if (KEY_REQUIRED_OPERATIONS.length > 0) {
        it.each(
            KEY_REQUIRED_OPERATIONS.map((operation) => ({ label: labelOf(operation), operation }))
        )(
            '$label refuses a request without the key as 400 IDEMPOTENCY_KEY_REQUIRED',
            async ({ operation }) => {
                const { user, bearer } = await authenticateAs(roleReaching(operation));
                const world = await seedWorld(user);

                const response = await api()
                    [operation.method](buildUrl(operation, world))
                    .set('Authorization', bearer)
                    .set('Accept-Language', 'en');

                expect([response.status, response.body.errors?.[0]?.code]).toEqual([
                    400,
                    'IDEMPOTENCY_KEY_REQUIRED'
                ]);
            }
        );
    }
});
