/**
 * A malformed id has one answer per position, on every route the spec declares.
 *
 * The rule:
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
 * routes are the one exception: they are sent as a customer, whose basket the suite builds.
 *
 * @see docs/understand/request-flow.md#a-malformed-id-has-one-answer-per-position
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
import { withoutInstance } from '@tests/problem';

/**
 * No real Chromium here: the invoice route with a real order would render, and a missing browser
 * is not what this suite asks about.
 */
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: () => Promise.resolve(Buffer.from('pdf'))
}));

setupTestDb();

/** Values the contract's `Id` accepts and this backend never issued. */
const MALFORMED = ['abc', 'not-an-id', 'z'.repeat(24), 'a'.repeat(25), '0'.repeat(63)];

/** The first malformed value, for the body and query sites that need only one. */
const [BAD_ID] = MALFORMED;

/** Every operation in the contract that takes an id. */
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
    /** The HTTP status it answered. */
    status: number;
    /** The parsed answer body. */
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

/**
 * Bodies for the writes whose random spec-valid body is refused (422) before the entity is looked
 * up, so their unknown-id probe would never answer the 404 a malformed id is compared with. A PUT
 * of nothing replaces nothing, and a PATCH with nothing to merge changes nothing: both reach the
 * owner lookup.
 */
const BODY_THAT_REACHES_THE_404: Record<string, unknown> = {
    'put /locales/translations/{entityType}/{id}': {},
    'patch /locales/translations/{entityType}/{id}': {}
};

/** Path rows whose malformed answer was actually compared with the unknown one, by label. */
const COMPARED = new Set<string>();

/** The rows that must be compared: the ones a 404 body carries its own error code on. */
const MUST_COMPARE: string[] = PATH_SITES.map(([label]) => label).filter((label) =>
    label.includes('/locales/translations/{entityType}/{id} {id}')
);

describe('the id sites the spec declares', () => {
    it('are found, so the sweeps below cannot pass by sweeping nothing', () => {
        /**
         * Counts, not a floor of one: a walk that quietly stopped recognising `Id` would still
         * find a few, and every sweep below would shrink to a rounding error.
         */
        expect(PATH_SITES.length).toBeGreaterThanOrEqual(71);
        expect(BODY_SITES.length).toBeGreaterThanOrEqual(19);
        expect(QUERY_SITES.length).toBeGreaterThanOrEqual(8);
    });
});

/**
 * The statuses an operation documents.
 *
 */
const documentedStatuses = (operation: Operation): string[] =>
    Object.keys(
        (readSpec().paths[operation.path][operation.method] as { responses: object }).responses
    );

/**
 * An unknown-id body with the id it was asked about swapped for another. Some copy names the id
 * it was sent ("No product exists with id …"); that echo is the one difference the rule allows.
 *
 * @param body - the unknown-id answer's body
 * @param value - the id the malformed request carried
 */
const echoing = (body: unknown, value: string): object =>
    JSON.parse(JSON.stringify(body).split(OBJECT_ID).join(value)) as object;

describe('an id in the URL path', () => {
    describe.each(PATH_SITES)('%s', (label, operation, parameter) => {
        it('documents the 404 it answers', () => {
            expect(documentedStatuses(operation)).toContain('404');
        });

        it('answers 404 for a malformed value, as it does for an unknown one', async () => {
            const { user, bearer } = await authenticateAs(roleReaching(operation));
            const world = await seedWorld(user);
            const body =
                BODY_THAT_REACHES_THE_404[`${operation.method} ${operation.path}`] ??
                validBodyFor(operation.bodySchema);

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
                /**
                 * Same code, same copy: nothing tells it from an unknown id. A body that would
                 * have been refused first (422, 409) makes the unknown answer differ in status,
                 * which is exactly why a malformed id must be answered before the body is read.
                 * A row whose unknown probe was refused has no 404 body to compare: the status
                 * assertion above still ran, and the canary below names the rows that must not skip.
                 */
                if (unknown.status !== 404) continue;

                expect(withoutInstance(malformed.body as object)).toEqual(
                    withoutInstance(echoing(unknown.body, value))
                );
                COMPARED.add(label);
            }
        }, 60_000);
    });

    it('compares the translations rows, so none of them passes by being skipped', () => {
        /**
         * The canary: a row whose unknown probe stopped answering 404 is skipped above, and a
         * skipped row proves nothing. These are the rows that carry their own error code.
         */
        expect(MUST_COMPARE).toHaveLength(3);
        expect([...COMPARED].filter((label) => MUST_COMPARE.includes(label))).toHaveLength(
            MUST_COMPARE.length
        );
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
