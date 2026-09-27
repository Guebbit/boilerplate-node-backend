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
 *     override does not restate. `zodProductCreateSchema` overrides `price` for its i18n message and
 *     therefore has to restate `.min(0)` to keep the contract's `minimum: 0`.
 *   - **Coercion running before validation** hides a wrong type from the check that would reject
 *     it. `!!request.body.active` and `coerceStringArray(...)` run only for `multipart/form-data`,
 *     the one transport that needs them — see `readInput` and `docs/theory/request-input.md`.
 *   - **Validating a subset of a schema** lets an unchecked field reach Mongoose and throw a
 *     CastError, answering 500 where the contract promises 422. `userService.validateData`
 *     validates the whole schema, not a `.pick()` of it.
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
import { createProduct } from '@modules/products/tests/factories';
import { validPayload, invalidPayloads } from '@tests/contract-data';
import { listOperations, type SchemaNode } from '@tests/spec-walk';
import {
    CreateUserBody,
    CreateProductBody,
    CreateOrderBody,
    UpsertCartItemBody,
    CreateFeedbackRequestBody,
    SignupBody,
    LoginBody
} from '@api/schemas.zod';
import { localeRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/factories';
import { localeService } from '@modules/locales/services';
import { productRepository } from '@modules/products/repository';

setupTestDb();

beforeAll(() => {
    localeService.setTranslatables({
        product: {
            collection: 'products',
            fields: ['title', 'description'],
            cacheTag: 'products',
            exists: productRepository.existsById,
            writeDerived: productRepository.writeTranslatedFields
        }
    });
});

afterAll(() => {
    localeService.setTranslatables({});
});

// CreateOrderBody's userId/items[].productId are opaque strings to the schema — the contract
// has no way to say "must reference a real document" — so the generated payload is patched with
// ids that actually exist before being sent, the same relinking problem (and fix) the
// frontend's random mock profile solves for the same reason.
//
// `skipField` names whichever field an invalid-payload case is testing: patching it here would
// silently undo the violation under test (most importantly `userId` itself — always patching it
// meant every "userId is missing/wrong-type" case sent a valid userId anyway, defeating the
// case entirely).
const withRealOrderReferences = async (
    payload: Record<string, unknown>,
    skipField?: string
): Promise<Record<string, unknown>> => {
    // A shelf no generated quantity can exhaust, for the same reason the ids are patched in:
    // `quantity ≤ available` is a business rule the schema cannot express, and this file only
    // asks whether the API honours its own CONTRACT — the refusal has its own scenario tests.
    const [product, { user }] = await Promise.all([
        createProduct({ onHand: 1_000_000_000 }),
        authenticateAs('user')
    ]);
    const result: Record<string, unknown> = { ...payload };
    if (skipField !== 'userId') result.userId = String(user._id);
    if (Array.isArray(payload.items))
        result.items = (payload.items as { quantity: number }[]).map((item) => ({
            ...item,
            productId: String(product._id)
        }));
    return result;
};

// passwordConfirm must equal password — a cross-field business rule the schema itself doesn't
// encode (each field only has its own independent length constraint), so it's patched in here
// rather than in the generic contract-data walker.
const withMatchingPasswordConfirm = (payload: Record<string, unknown>) => ({
    ...payload,
    passwordConfirm: payload.password
});

// `role` is `type: string` in the contract — no enum, because roles are DATA a deployment may
// add to (`shared/authorization-roles.yaml`'s own header) — so a randomly generated string is
// contract-legal but names no declared role, same class of gap as `userId`/`productId` above:
// the schema cannot say "must reference something real". Patched to a role that actually exists
// for the same reason those are patched with real ids.
const withRealRole = (payload: Record<string, unknown>) => ({
    ...payload,
    role: 'customer'
});

describe('POST /users (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const { bearer } = await authenticateAs('admin');
        const payload = withRealRole(validPayload(CreateUserBody));

        const response = await api().post('/users').set('Authorization', bearer).send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
    });

    it.each(invalidPayloads(CreateUserBody))(
        'rejects a payload where $field is $violation',
        async ({ payload }) => {
            const { bearer } = await authenticateAs('admin');
            const response = await api().post('/users').set('Authorization', bearer).send(payload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        }
    );
});

// `translations` is a `Record<locale, {...} | null>` to the schema — it cannot say "the key must
// be this deployment's actual fallback locale, and a real row must exist for it". Same relinking
// problem `withRealOrderReferences` solves for `userId`/`productId`, patched the same way.
const withRealTranslations = (payload: Record<string, unknown>) => ({
    ...payload,
    translations: { en: { title: 'Generated Product Title' } }
});

describe('POST /products (contract-derived)', () => {
    beforeEach(async () => {
        await localeRepository.create(makeLocale({ tag: 'en', name: 'en', nativeName: 'en' }));
    });

    it('accepts a payload the contract declares legal', async () => {
        const { bearer } = await authenticateAs('admin');
        const payload = withRealTranslations(validPayload(CreateProductBody));

        const response = await api().post('/products').set('Authorization', bearer).send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
    });

    it.each(invalidPayloads(CreateProductBody))(
        'rejects a payload where $field is $violation',
        async ({ payload }) => {
            const { bearer } = await authenticateAs('admin');
            const response = await api()
                .post('/products')
                .set('Authorization', bearer)
                .send(payload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        }
    );
});

describe('POST /orders (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const { bearer } = await authenticateAs('admin');
        const payload = await withRealOrderReferences(validPayload(CreateOrderBody));

        const response = await api().post('/orders').set('Authorization', bearer).send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
    });

    it.each(invalidPayloads(CreateOrderBody))(
        'rejects a payload where $field is $violation',
        async ({ field, payload }) => {
            const { bearer } = await authenticateAs('admin');
            // Only patch in real references for fields other than the one under test — doing so
            // would overwrite the violation under test.
            const finalPayload =
                field === 'items' ? payload : await withRealOrderReferences(payload, field);
            const response = await api()
                .post('/orders')
                .set('Authorization', bearer)
                .send(finalPayload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        }
    );
});

describe('POST /cart (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const [{ bearer }, product] = await Promise.all([authenticateAs('user'), createProduct()]);
        const payload = { ...validPayload(UpsertCartItemBody), productId: String(product._id) };

        const response = await api().post('/cart').set('Authorization', bearer).send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
    });

    it.each(invalidPayloads(UpsertCartItemBody))(
        'rejects a payload where $field is $violation',
        async ({ field, payload }) => {
            const [{ bearer }, product] = await Promise.all([
                authenticateAs('user'),
                createProduct()
            ]);
            // productId is opaque to the schema (any string satisfies it) — only the quantity
            // violation is a genuine schema-level rejection; keep productId pointing at a real
            // product for every other case so the 422 can only be about the field under test.
            const finalPayload =
                field === 'productId' ? payload : { ...payload, productId: String(product._id) };
            const response = await api()
                .post('/cart')
                .set('Authorization', bearer)
                .send(finalPayload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        }
    );
});

describe('POST /feedback/contact (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const payload = validPayload(CreateFeedbackRequestBody);

        const response = await api().post('/feedback/contact').send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
    });

    it.each(invalidPayloads(CreateFeedbackRequestBody))(
        'rejects a payload where $field is $violation',
        async ({ payload }) => {
            const response = await api().post('/feedback/contact').send(payload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        }
    );
});

describe('POST /account/signup (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const payload = withMatchingPasswordConfirm(validPayload(SignupBody));

        const response = await api().post('/account/signup').send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
    });

    it.each(invalidPayloads(SignupBody))(
        'rejects a payload where $field is $violation',
        async ({ field, payload }) => {
            // Don't fix up passwordConfirm when IT is the field under test — that would
            // overwrite the violation.
            const finalPayload =
                field === 'passwordConfirm' ? payload : withMatchingPasswordConfirm(payload);
            const response = await api().post('/account/signup').send(finalPayload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        }
    );
});

describe('POST /account/login (contract-derived, invalid payloads only)', () => {
    // No "accepts a valid payload" case here: LoginBody only requires an email shape and a
    // minimum password length, neither of which can correspond to a real account by
    // construction, so a contract-valid login payload legitimately gets 401, not 2xx. That
    // path already has real-credential coverage elsewhere (tests/contract/... auth flows); this
    // block covers what's unique to contract-derived data — malformed payloads must still be
    // rejected as 422 before credentials are even checked.
    it.each(invalidPayloads(LoginBody))(
        'rejects a payload where $field is $violation',
        async ({ payload }) => {
            const response = await api().post('/account/login').send(payload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        }
    );
});

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

/** A locale row real enough for `/locales/{locale}/...` to reach its own query validation, rather than 404ing on an unknown tag first. */
const withRealLocale = async (): Promise<string> => {
    const tag = 'qp';
    await localeRepository.create(makeLocale({ tag, name: tag, nativeName: tag }));
    return tag;
};

/** One way to reach an operation with an enum/pattern query parameter, over real HTTP. */
interface QueryFixture {
    request: (query: string) => Promise<Response>;
}

const QUERY_FIXTURES: Partial<Record<string, QueryFixture>> = {
    'GET /audit': { request: adminQuery('/audit') },
    'GET /observability/audit': { request: adminQuery('/observability/audit') },
    'GET /feedback': { request: adminQuery('/feedback') },
    'GET /orders': { request: adminQuery('/orders') },
    'GET /inventory/movements': { request: adminQuery('/inventory/movements') },
    'GET /webhooks/deliveries': { request: adminQuery('/webhooks/deliveries') },
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
 * - `GET /locales/{locale}/messages` `tenant`: NOT a bug — `services/messages.ts#readMessages`
 *   answers 404 for anything that isn't a configured frontend tenant, malformed or merely unknown
 *   alike, so a 403 or an empty 200 for "wrong kind of tenant" can't leak that a draft translation
 *   exists under a different (backend) tenant. A malformed id is just one more way to not be a
 *   frontend tenant.
 */
const KNOWN_GAPS = new Set(['GET /locales/{locale}/messages::tenant']);

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
