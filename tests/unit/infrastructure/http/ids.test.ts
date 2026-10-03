/**
 * A malformed id: one answer per position.
 *
 * The rule under test: an id in the URL path that is not this backend's own is the same 404 an
 * unknown id gets; an id in a body or a query is a 422 `VALIDATION_ERROR` naming the field. The
 * schema walk that finds a request schema's id fields is pinned on its own, because every body and
 * query in the API depends on it finding them all.
 */
import { z } from 'zod';
import { asStub } from '@tests/stub';
import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import {
    CONTRACT_ID_PATTERN,
    isValidObjectId,
    malformedIdIssues,
    requireId
} from '@infrastructure/http/ids';
import { parseBody } from '@infrastructure/http/controller';

/** A valid 24-hex ObjectId, used wherever the format has to pass. */
const OBJECT_ID = '65dc8a99604c307b702b5ccc';

/** A string the contract's `Id` accepts and this backend never issued. */
const CONTRACT_VALID_NOT_AN_OBJECT_ID = 'abc';

/** The `Id` schema as the generated Zod carries it: min, max and the shared pattern. */
const idSchema = () => z.string().min(1).max(64).regex(new RegExp(CONTRACT_ID_PATTERN));

/** A request stand-in with the three sources `readInput` reads. */
const makeRequest = (
    overrides: { params?: Record<string, unknown>; body?: unknown; query?: unknown } = {}
) =>
    asStub<Request>({
        params: overrides.params ?? {},
        body: overrides.body,
        query: overrides.query ?? {},
        is: () => null
    });

/** A response stand-in capturing the status and payload `rejectResponse` writes. */
const makeResponse = () => {
    const sent: { status?: number; payload?: unknown } = {};
    const response = asStub<Response>({
        status(code: number) {
            sent.status = code;
            return this;
        },
        json(payload: unknown) {
            sent.payload = payload;
            return this;
        }
    });
    return { response, sent };
};

/** The `errors` array of whatever was sent. */
const errorsOf = (sent: { payload?: unknown }) =>
    (sent.payload as { errors: { code: string; message: string; details?: unknown }[] }).errors;

describe('isValidObjectId', () => {
    it('accepts 24 hex characters, in either case', () => {
        expect(isValidObjectId(OBJECT_ID)).toBe(true);
        expect(isValidObjectId(OBJECT_ID.toUpperCase())).toBe(true);
    });

    it.each([
        undefined,
        null,
        '',
        'not-an-id',
        'abcdefghijkl',
        `${OBJECT_ID}0`,
        OBJECT_ID.slice(1)
    ])('rejects %p', (value) => {
        expect(isValidObjectId(value)).toBe(false);
    });

    it('rejects a non-string that merely prints as an id', () => {
        // `RegExp#test` stringifies its argument: an object with a hostile `toString` would pass.
        expect(isValidObjectId({ toString: () => OBJECT_ID })).toBe(false);
        expect(isValidObjectId([OBJECT_ID])).toBe(false);
    });
});

describe('requireId', () => {
    it('returns a well-formed path id and sends nothing', () => {
        const { response, sent } = makeResponse();

        const id = requireId(makeRequest({ params: { id: OBJECT_ID } }), response, {
            notFound: 'orders.not-found'
        });

        expect(id).toBe(OBJECT_ID);
        expect(sent.status).toBeUndefined();
    });

    it('answers a malformed PATH id with the 404 and copy an unknown id gets', () => {
        const { response, sent } = makeResponse();

        const id = requireId(makeRequest({ params: { id: 'abc' } }), response, {
            notFound: 'orders.not-found'
        });

        expect(id).toBeUndefined();
        expect(sent.status).toBe(404);
        expect(errorsOf(sent)).toEqual([{ code: 'NOT_FOUND', message: t('orders.not-found') }]);
    });

    it('answers the bare 404 envelope when the module has no copy of its own', () => {
        const { response, sent } = makeResponse();

        requireId(makeRequest({ params: { id: 'abc' } }), response, { notFound: null });

        expect(sent.status).toBe(404);
        expect(errorsOf(sent)).toEqual([{ code: 'NOT_FOUND', message: 'Not Found' }]);
    });

    it('builds the copy through a function where it names the id', () => {
        const { response, sent } = makeResponse();

        requireId(makeRequest({ params: { id: 'abc' } }), response, {
            notFound: () => `No product with id abc`
        });

        expect(errorsOf(sent)).toEqual([{ code: 'NOT_FOUND', message: 'No product with id abc' }]);
    });

    it('reads the param it is told to, not `id`', () => {
        const { response } = makeResponse();

        const id = requireId(makeRequest({ params: { orderId: OBJECT_ID } }), response, {
            notFound: 'orders.not-found',
            name: 'orderId'
        });

        expect(id).toBe(OBJECT_ID);
    });

    it('answers a malformed BODY id with a 422 naming the field, never a 404', () => {
        const { response, sent } = makeResponse();

        const id = requireId(makeRequest({ body: { productId: 'abc' } }), response, {
            notFound: 'products.not-found',
            name: 'productId',
            surface: 'write'
        });

        expect(id).toBeUndefined();
        expect(sent.status).toBe(422);
        expect(errorsOf(sent)).toEqual([
            {
                code: 'VALIDATION_ERROR',
                message: t('validation.invalid-format'),
                details: { field: 'productId' }
            }
        ]);
    });

    it('answers a malformed QUERY id with the same 422', () => {
        const { response, sent } = makeResponse();

        requireId(makeRequest({ query: { id: 'abc' } }), response, {
            notFound: 'users.not-found',
            surface: 'delete'
        });

        expect(sent.status).toBe(422);
        expect(errorsOf(sent)[0].details).toEqual({ field: 'id' });
    });

    it('answers a missing body id as a required field, not as malformed', () => {
        const { response, sent } = makeResponse();

        requireId(makeRequest({ body: {} }), response, {
            notFound: 'users.not-found',
            surface: 'delete'
        });

        expect(sent.status).toBe(422);
        expect(errorsOf(sent)).toEqual([
            {
                code: 'VALIDATION_ERROR',
                message: t('validation.required'),
                details: { field: 'id' }
            }
        ]);
    });

    it('lets the path win over a body that carries a different id', () => {
        const { response, sent } = makeResponse();

        const id = requireId(
            makeRequest({ params: { id: OBJECT_ID }, body: { id: 'abc' } }),
            response,
            { notFound: 'orders.not-found', surface: 'write' }
        );

        expect(id).toBe(OBJECT_ID);
        expect(sent.status).toBeUndefined();
    });
});

describe('malformedIdIssues', () => {
    const schema = z.strictObject({
        userId: idSchema().optional(),
        quantity: z.number(),
        id: z.array(idSchema()).optional(),
        items: z.array(z.strictObject({ productId: idSchema(), quantity: z.number() })).optional(),
        address: z.strictObject({ id: idSchema().nullable() }).optional(),
        // A pipe, as `z.preprocess` builds one for a blank-tolerant field.
        filter: z.preprocess((value) => value, idSchema()).optional(),
        label: z.string().min(1).max(64)
    });

    /** The fields flagged for an input, sorted so the order is not the assertion. */
    const flaggedFields = (input: unknown, flagged?: ReadonlySet<string>) =>
        malformedIdIssues(schema, input, flagged)
            .map((issue) => (issue.details as { field: string }).field)
            .toSorted();

    it('flags nothing when every id is an ObjectId', () => {
        expect(
            flaggedFields({
                userId: OBJECT_ID,
                id: [OBJECT_ID, OBJECT_ID],
                items: [{ productId: OBJECT_ID, quantity: 1 }],
                address: { id: OBJECT_ID },
                filter: OBJECT_ID
            })
        ).toEqual([]);
    });

    it('flags a scalar, an array element, a nested object and a piped field by their dotted path', () => {
        expect(
            flaggedFields({
                userId: CONTRACT_VALID_NOT_AN_OBJECT_ID,
                id: [OBJECT_ID, 'abc', 'def'],
                items: [
                    { productId: OBJECT_ID, quantity: 1 },
                    { productId: 'abc', quantity: 1 }
                ],
                address: { id: 'abc' },
                filter: 'abc'
            })
        ).toEqual(['address.id', 'filter', 'id.1', 'id.2', 'items.1.productId', 'userId']);
    });

    it('never reads a field that is not an id', () => {
        expect(flaggedFields({ label: 'abc', quantity: 3 })).toEqual([]);
    });

    it('leaves a missing, null or mistyped id to the schema', () => {
        expect(flaggedFields({ address: { id: null }, userId: 7, items: 'nope' })).toEqual([]);
    });

    it('does not report a field the schema already refused', () => {
        expect(flaggedFields({ userId: 'abc', filter: 'abc' }, new Set(['userId']))).toEqual([
            'filter'
        ]);
    });

    it('answers VALIDATION_ERROR with the field and the format copy', () => {
        expect(malformedIdIssues(schema, { userId: 'abc' })).toEqual([
            {
                code: 'VALIDATION_ERROR',
                message: t('validation.invalid-format'),
                details: { field: 'userId' }
            }
        ]);
    });

    it('finds an id inside a union and an intersection', () => {
        const wrapped = z.strictObject({
            either: z.union([idSchema(), z.number()]),
            both: z.intersection(
                z.strictObject({ a: idSchema() }),
                z.strictObject({ b: z.number() })
            )
        });

        expect(
            malformedIdIssues(wrapped, { either: 'abc', both: { a: 'abc', b: 1 } })
                .map((issue) => (issue.details as { field: string }).field)
                .toSorted()
        ).toEqual(['both.a', 'either']);
    });

    it('reads something that is not a Zod 4 schema as having no ids', () => {
        expect(malformedIdIssues(asStub<z.ZodType>({}), { id: 'abc' })).toEqual([]);
    });

    it('reads a schema built without the contract pattern as having no ids', () => {
        const plain = z.strictObject({ productId: z.string() });

        expect(malformedIdIssues(plain, { productId: 'abc' })).toEqual([]);
    });
});

describe('parseBody with id fields', () => {
    const schema = z.strictObject({ productId: idSchema(), quantity: z.number().int().min(1) });

    it('returns the parsed body when every id is an ObjectId', () => {
        const { response, sent } = makeResponse();

        const parsed = parseBody(schema, { productId: OBJECT_ID, quantity: 2 }, response);

        expect(parsed).toEqual({ productId: OBJECT_ID, quantity: 2 });
        expect(sent.status).toBeUndefined();
    });

    it('answers 422 for an id the contract accepts and the backend never issued', () => {
        const { response, sent } = makeResponse();

        const parsed = parseBody(schema, { productId: 'abc', quantity: 2 }, response);

        expect(parsed).toBeUndefined();
        expect(sent.status).toBe(422);
        expect(errorsOf(sent).map((error) => error.details)).toEqual([{ field: 'productId' }]);
    });

    it('reports a bad id and a bad quantity together, each once', () => {
        const { response, sent } = makeResponse();

        parseBody(schema, { productId: 'abc', quantity: 0 }, response);

        expect(errorsOf(sent).map((error) => error.details)).toEqual([
            { field: 'quantity' },
            { field: 'productId' }
        ]);
    });

    it('reports an id the schema itself refused only once', () => {
        const { response, sent } = makeResponse();

        // `!` is outside the contract's pattern: Zod flags it, and the walk must not repeat it.
        parseBody(schema, { productId: '!', quantity: 1 }, response);

        expect(errorsOf(sent).map((error) => error.details)).toEqual([{ field: 'productId' }]);
    });
});
