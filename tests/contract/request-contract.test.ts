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
 *     override does not restate. `zodProductSchema` overrides `price` for its i18n message and
 *     therefore has to restate `.min(0)` to keep the contract's `minimum: 0`.
 *   - **Coercion running before validation** hides a wrong type from the check that would reject
 *     it. `!!request.body.active` and `coerceStringArray(...)` run only for `multipart/form-data`,
 *     the one transport that needs them — see `readInput` and `docs/theory/request-input.md`.
 *   - **Validating a subset of a schema** lets an unchecked field reach Mongoose and throw a
 *     CastError, answering 500 where the contract promises 422. `userService.validateData`
 *     validates the whole schema, not a `.pick()` of it.
 *
 * Generated data is additive, same convention as a module's `tests/factory.ts`: deterministic
 * scenario tests keep using the hand-written factories. This file exists specifically for what
 * they can't answer — "does the API honour its own contract for ANY legal input" — never "does
 * this specific scenario behave correctly".
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factory';
import { validPayload, invalidPayloads } from '@tests/contract-data';
import {
    CreateUserBody,
    CreateProductBody,
    CreateOrderBody,
    UpsertCartItemBody,
    CreateFeedbackRequestBody,
    SignupBody,
    LoginBody
} from '@api/schemas.zod';

setupTestDb();

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
    const [product, { user }] = await Promise.all([createProduct(), authenticateAs('user')]);
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

describe('POST /users (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const { bearer } = await authenticateAs('admin');
        const payload = validPayload(CreateUserBody);

        const response = await api().post('/users').set('Authorization', bearer).send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        expect(response).toSatisfyApiSpec();
    });

    it.each(invalidPayloads(CreateUserBody))(
        'rejects a payload where $field is $violation',
        async ({ payload }) => {
            const { bearer } = await authenticateAs('admin');
            const response = await api().post('/users').set('Authorization', bearer).send(payload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response).toSatisfyApiSpec();
        }
    );
});

describe('POST /products (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const { bearer } = await authenticateAs('admin');
        const payload = validPayload(CreateProductBody);

        const response = await api().post('/products').set('Authorization', bearer).send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        expect(response).toSatisfyApiSpec();
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
            expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
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
            expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
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
            expect(response).toSatisfyApiSpec();
        }
    );
});

describe('POST /feedback/contact (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const payload = validPayload(CreateFeedbackRequestBody);

        const response = await api().post('/feedback/contact').send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        expect(response).toSatisfyApiSpec();
    });

    it.each(invalidPayloads(CreateFeedbackRequestBody))(
        'rejects a payload where $field is $violation',
        async ({ payload }) => {
            const response = await api().post('/feedback/contact').send(payload);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response).toSatisfyApiSpec();
        }
    );
});

describe('POST /account/signup (contract-derived)', () => {
    it('accepts a payload the contract declares legal', async () => {
        const payload = withMatchingPasswordConfirm(validPayload(SignupBody));

        const response = await api().post('/account/signup').send(payload);

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        expect(response).toSatisfyApiSpec();
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
            expect(response).toSatisfyApiSpec();
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
            expect(response).toSatisfyApiSpec();
        }
    );
});
