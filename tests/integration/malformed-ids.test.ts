/**
 * A malformed id has one answer per position, on every route the spec declares.
 *
 * The rule (`docs/theory/request-flow.md#a-malformed-id-has-one-answer-per-position`):
 *
 *   - an id in the URL path that is not this backend's own is the SAME 404 an unknown id gets;
 *   - an id in a body or a query that is not this backend's own is a 422 `VALIDATION_ERROR` whose
 *     `details.field` names it.
 *
 * Nothing here is a list of routes. The sites come from `openapi.yaml` through the shared `Id`
 * schema (`tests/support/spec-ids.ts`), so a route added tomorrow is held to the rule on its first
 * run — and a route whose controller forgot the check answers 422 or 500 here instead of 404.
 *
 * Callers are admin, so a refusal is the controller's own and never a permission gate; the shopping
 * routes are the one exception, since an administrator holds no basket key and a customer does.
 */
import fc from 'fast-check';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { listOperations, readSpec, type Operation, type SchemaNode } from '@tests/spec-walk';
import { bodyArbitraryFor } from '@tests/spec-arbitraries';
import { seedWorld, buildUrl, requiredHeadersOf, OBJECT_ID, type World } from '@tests/spec-world';
import { roleReaching } from '@tests/shopper-routes';
import {
    fieldName,
    idBodyFields,
    idPathParameters,
    idQueryFields,
    setPath,
    type Segment
} from '@tests/spec-ids';

// No real Chromium here: the invoice route with a real order would render, and a missing browser
// is not what this suite asks about.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: () => Promise.resolve(Buffer.from('pdf'))
}));

setupTestDb();

/** Values the contract's `Id` accepts and this backend never issued. */
const MALFORMED = ['abc', 'not-an-id', 'z'.repeat(24), 'a'.repeat(25), '0'.repeat(63)];

/** The first malformed value, for the body and query sites that need only one. */
const [BAD_ID] = MALFORMED;

const OPERATIONS = listOperations();

/** Operations with at least one id in the path. */
const PATH_OPERATIONS = OPERATIONS.filter((operation) => idPathParameters(operation).length > 0);

/** One (operation, id path parameter) pair per row. */
const PATH_SITES = PATH_OPERATIONS.flatMap((operation) =>
    idPathParameters(operation).map(
        (parameter) =>
            [
                `${operation.method.toUpperCase()} ${operation.path} {${parameter}}`,
                operation,
                parameter
            ] as const
    )
);

/** One (operation, body field) pair per row. */
const BODY_SITES = OPERATIONS.filter((operation) => !operation.isMultipart).flatMap((operation) =>
    idBodyFields(operation).map(
        (segments) =>
            [
                `${operation.method.toUpperCase()} ${operation.path} body ${fieldName(segments)}`,
                operation,
                segments
            ] as const
    )
);

/** One (operation, query field) pair per row. */
const QUERY_SITES = OPERATIONS.flatMap((operation) =>
    idQueryFields(operation).map(
        (segments) =>
            [
                `${operation.method.toUpperCase()} ${operation.path} query ${fieldName(segments)}`,
                operation,
                segments
            ] as const
    )
);

/** One spec-valid JSON body for an operation, or `undefined` when it takes none. */
const validBodyFor = (schema: SchemaNode | undefined): unknown => {
    const arbitrary = bodyArbitraryFor(schema);
    return arbitrary ? fc.sample(arbitrary, { numRuns: 1, seed: 7 })[0] : undefined;
};

/** What a request answered, reduced to what the rule is about. */
interface Answer {
    status: number;
    body: unknown;
}

/**
 * Send one request as the admin and reduce the response to {@link Answer}.
 *
 * @param operation - what to call
 * @param url - the full path, query string included
 * @param bearer - the admin's `Authorization` header value
 * @param body - the JSON body, when the operation takes one
 */
const send = (
    operation: Operation,
    url: string,
    bearer: string,
    body: unknown
): Promise<Answer> => {
    const request = api()
        [operation.method](url)
        .set('Authorization', bearer)
        .set('Accept-Language', 'en')
        .set(requiredHeadersOf(operation));
    return (body === undefined ? request : request.send(body as object)).then((response) => ({
        status: response.status,
        body: response.body as unknown
    }));
};

/** Stands in for the parameter under test while `buildUrl` fills the rest. */
const SENTINEL = '__target__';

/**
 * `buildUrl`, with one parameter replaced.
 *
 * @param operation - the operation
 * @param world - the seeded rows the other parameters name
 * @param parameter - the parameter to override
 * @param value - what it carries
 */
const fillParameter = (
    operation: Operation,
    world: World,
    parameter: string,
    value: string
): string => {
    // The parameter is taken out of the template, so `buildUrl` fills only the others.
    const template = buildUrl(
        {
            ...operation,
            path: operation.path.replace(`{${parameter}}`, () => SENTINEL),
            pathParameters: operation.pathParameters.filter((name) => name !== parameter)
        },
        world
    );
    return template.replace(SENTINEL, () => encodeURIComponent(value));
};

describe('the id sites the spec declares', () => {
    it('are found, so the sweeps below cannot pass by sweeping nothing', () => {
        // Counts, not a floor of one: a walk that quietly stopped recognising `Id` would still
        // find a few, and every sweep below would shrink to a rounding error.
        expect(PATH_SITES.length).toBeGreaterThanOrEqual(71);
        expect(BODY_SITES.length).toBeGreaterThanOrEqual(19);
        expect(QUERY_SITES.length).toBeGreaterThanOrEqual(8);
    });
});

/**
 * The statuses an operation documents.
 *
 * @param operation - the operation
 */
const documentedStatuses = (operation: Operation): string[] =>
    Object.keys(
        (readSpec().paths[operation.path][operation.method] as { responses: object }).responses
    );

describe('an id in the URL path', () => {
    describe.each(PATH_SITES)('%s', (_label, operation, parameter) => {
        it('documents the 404 it answers', () => {
            expect(documentedStatuses(operation)).toContain('404');
        });

        it('answers 404 for a malformed value, as it does for an unknown one', async () => {
            const { user, bearer } = await authenticateAs(roleReaching(operation));
            const world = await seedWorld(user);
            const body = validBodyFor(operation.bodySchema);

            const unknown = await send(
                operation,
                fillParameter(operation, world, parameter, OBJECT_ID),
                bearer,
                body
            );

            for (const value of MALFORMED) {
                const malformed = await send(
                    operation,
                    fillParameter(operation, world, parameter, value),
                    bearer,
                    body
                );

                expect(malformed.status).toBe(404);
                // Same code, same copy: nothing tells it from an unknown id. A body that would
                // have been refused first (422, 409) makes the unknown answer differ in status,
                // which is exactly why a malformed id must be answered before the body is read.
                if (unknown.status === 404) expect(malformed.body).toEqual(unknown.body);
            }
        }, 60_000);
    });
});

describe('an id in a request body', () => {
    describe.each(BODY_SITES)('%s', (_label, operation, segments: Segment[]) => {
        it('documents the 422 it answers', () => {
            expect(documentedStatuses(operation)).toContain('422');
        });

        it('answers 422 VALIDATION_ERROR naming the field', async () => {
            const { user, bearer } = await authenticateAs(roleReaching(operation));
            const world = await seedWorld(user);
            const body = validBodyFor(operation.bodySchema) ?? {};
            setPath(body, segments, BAD_ID);

            const answer = await send(operation, buildUrl(operation, world), bearer, body);

            expect(answer.status).toBe(422);
            expect(
                (answer.body as { errors: { code: string; details?: { field?: string } }[] }).errors
            ).toContainEqual(
                expect.objectContaining({
                    code: 'VALIDATION_ERROR',
                    details: { field: fieldName(segments) }
                })
            );
        }, 60_000);
    });
});

describe('an id in a query string', () => {
    describe.each(QUERY_SITES)('%s', (_label, operation, segments: Segment[]) => {
        it('documents the 422 it answers', () => {
            expect(documentedStatuses(operation)).toContain('422');
        });

        it('answers 422 VALIDATION_ERROR naming the field', async () => {
            const { user, bearer } = await authenticateAs(roleReaching(operation));
            const world = await seedWorld(user);
            const [name] = segments;

            const answer = await send(
                operation,
                `${buildUrl(operation, world)}?${String(name)}=${BAD_ID}`,
                bearer,
                undefined
            );

            expect(answer.status).toBe(422);
            expect(
                (answer.body as { errors: { code: string; details?: { field?: string } }[] }).errors
            ).toContainEqual(
                expect.objectContaining({
                    code: 'VALIDATION_ERROR',
                    details: { field: fieldName(segments) }
                })
            );
        }, 60_000);
    });
});
