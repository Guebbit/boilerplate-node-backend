/**
 * Negative fuzzing: hostile, spec-INVALID values in path and query parameters.
 *
 * `endpoints.fuzz.test.ts` sends only spec-valid values. The 422 sweeps cover write bodies and a
 * few query params. This file fills the rest: for every operation that takes a path or query
 * parameter, one parameter at a time is replaced by a value the spec does not allow.
 *
 * Two answers are asserted:
 *   1. never 5xx, for any value in any parameter;
 *   2. 4xx where the parameter's own schema is closed (enum, number, boolean, contract id), so the
 *      value cannot be a legal one. A free string may legitimately answer 200.
 *
 * The list of operations comes from the spec walk, like the valid-value fuzzer's.
 * @see docs/build/fuzz-testing.md#negative-mode
 */
import fc from 'fast-check';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { assertResponseMatchesContract } from '@tests/response-contract';
import { isContractId } from '@tests/spec-ids';
import { listOperations, type Operation, type SchemaNode } from '@tests/spec-walk';
import { bodyArbitraryFor } from '@tests/spec-arbitraries';
import { FUZZ_RUNS_PER_OPERATION } from '@tests/knobs';
import { buildUrl, requiredHeadersOf, seedWorld } from '@tests/spec-world';
import { markServerListening } from '@infrastructure/runtime/readiness';
import { settleInlineExports } from '@modules/account/services/export';
import { emptyFileSandbox } from '@tests/file-sandbox';

// Same stand-in the valid-value fuzzer uses: no Chromium here, and a missing browser is not the hunt.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: () => Promise.resolve(Buffer.from('pdf'))
}));

setupTestDb();

// A request that starts an export writes its file after the 202; teardown fails on a leftover file.
afterEach(() => settleInlineExports().then(emptyFileSandbox));

// `GET /readyz` answers 503 until boot marks the process listening, which never runs under test.
markServerListening();

/**
 * Same seed contract as the valid-value fuzzer: rolled per run, printed, pinned by
 * `RANDOM_DATA_SEED`.
 */
const SEED = (() => {
    const parsed = Number(process.env.RANDOM_DATA_SEED);
    const seed = Number.isFinite(parsed) && parsed > 0 ? parsed : Math.floor(Math.random() * 1e9);
    // eslint-disable-next-line no-console -- the reproduction seed must reach the terminal even where the logger is mocked
    console.log(`[fuzz:negative] seed=${seed} (rerun with RANDOM_DATA_SEED=${seed} to reproduce)`);
    return seed;
})();

/**
 * Values no closed schema (enum, number, boolean, id) accepts: control bytes, injection shapes,
 * path-ish text, a JSON object, an emoji. Raw text: each is encoded before it reaches a URL.
 */
const NEVER_LEGAL = [
    '\0',
    'not-a-value',
    "'; DROP TABLE users;--",
    '{"$ne":null}',
    '$where',
    '../../etc/passwd',
    '<script>alert(1)</script>',
    '\u{1F642}',
    '‮reversed',
    'a'.repeat(5000)
];

/**
 * Values a loose schema (integer without a bound, free string) may legally take or refuse: the
 * only demand is that the app does not crash on them.
 */
const EDGE_VALUES = [
    '',
    ' ',
    '-1',
    '0',
    '1e999',
    '999999999999999999999999',
    'NaN',
    'null',
    'true'
];

/** A path or query parameter to attack, with the schema that tells whether 4xx is owed. */
interface Target {
    /** `path` parameters are substituted into the URL; `query` ones are appended to it. */
    kind: 'path' | 'query';
    /** The parameter's name as the spec writes it. */
    name: string;
    /** True when no value in {@link NEVER_LEGAL} can be a legal one. */
    closed: boolean;
}

/**
 * Whether a parameter's schema is closed: an enum, a number, a boolean or a contract id.
 *
 * @param node - the parameter's resolved schema
 */
const isClosed = (node: SchemaNode | undefined): boolean =>
    node !== undefined &&
    (isContractId(node) ||
        node.enum !== undefined ||
        [node.type].flat().some((type) => ['integer', 'number', 'boolean'].includes(String(type))));

/**
 * Every parameter of an operation that can be attacked.
 *
 * @param operation - one spec operation
 */
const targetsOf = (operation: Operation): Target[] => [
    ...operation.pathParameters.map((name): Target => ({
        kind: 'path',
        name,
        closed: isClosed(operation.pathParameterSchemas[name])
    })),
    ...operation.queryParameters.map((parameter): Target => ({
        kind: 'query',
        name: parameter.name,
        closed: isClosed(parameter.schema)
    }))
];

/** The operations with something to attack; multipart ones are skipped as in the valid-value fuzzer. */
const ATTACKABLE = listOperations()
    .filter((operation) => !operation.isMultipart)
    .map((operation) => ({ operation, targets: targetsOf(operation) }))
    .filter(({ targets }) => targets.length > 0);

/**
 * The path with one parameter replaced by a hostile value.
 *
 * @param operation - the operation being called
 * @param url - the path built from valid values
 * @param target - the parameter to replace
 * @param value - the raw hostile value
 */
const attackedUrl = (operation: Operation, url: string, target: Target, value: string): string => {
    if (target.kind === 'query')
        return `${url}?${encodeURIComponent(target.name)}=${encodeURIComponent(value)}`;
    // Params never contain `/`, so the template and the valid URL split into the same segments.
    const template = operation.path.split('/');
    const segments = url.split('/');
    const index = template.findIndex((segment) => segment.includes(`{${target.name}}`));
    segments[index] = template[index].replace(`{${target.name}}`, () => encodeURIComponent(value));
    return segments.join('/');
};

describe('negative fuzzing', () => {
    it('finds operations with parameters to attack', () => {
        // A walk that found none would make the whole file pass by testing nothing.
        expect(ATTACKABLE.length).toBeGreaterThan(20);
        expect(ATTACKABLE.some(({ targets }) => targets.some((target) => target.closed))).toBe(
            true
        );
    });
});

describe.each(
    ATTACKABLE.map(
        ({ operation, targets }) =>
            [`${operation.method.toUpperCase()} ${operation.path}`, operation, targets] as const
    )
)('%s', (_label, operation, targets) => {
    it('never answers 5xx for a hostile parameter, and 4xx where the schema is closed', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const world = await seedWorld(user);
        const url = buildUrl(operation, world);
        const body = bodyArbitraryFor(operation.bodySchema, Object.values(world));

        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...targets),
                fc.constantFrom(...NEVER_LEGAL, ...EDGE_VALUES),
                async (target, value) => {
                    const request = api()
                        [operation.method](attackedUrl(operation, url, target, value))
                        .set('Authorization', bearer)
                        .set('Accept-Language', 'en')
                        .set(requiredHeadersOf(operation));
                    // A JSON body schema yields an object or array; `unknown` is only the arbitrary's static type.
                    const sent = body
                        ? request.send(fc.sample(body, 1)[0] as object | undefined)
                        : request;

                    const response = await sent;

                    expect(response.status).toBeLessThan(500);
                    assertResponseMatchesContract(response);
                    // 4xx owed only for a closed schema given a value it cannot hold.
                    const owed = target.closed && NEVER_LEGAL.includes(value);
                    expect(owed && response.status < 400).toBe(false);
                }
            ),
            { seed: SEED, numRuns: FUZZ_RUNS_PER_OPERATION, endOnFailure: true }
        );
    }, 120_000);
});

/** Shapes a query string can take that a single `name=value` never does. */
describe('query-string shapes no schema describes', () => {
    const SHAPES = ['a[$ne]=1', 'a[]=1&a[]=2', 'a=1&a=2', 'a[b][c]=1', '=1', '%', 'a=%E0%A4%A'];
    const LISTS = ATTACKABLE.filter(
        ({ operation }) => operation.method === 'get' && operation.queryParameters.length > 0
    );

    it('finds some list reads to ask', () => {
        expect(LISTS.length).toBeGreaterThan(5);
    });

    it.each(SHAPES)(
        'never crashes a read asked with ?%s',
        async (shape) => {
            const { user, bearer } = await authenticateAs('admin');
            const world = await seedWorld(user);

            for (const { operation } of LISTS) {
                const response = await api()
                    .get(`${buildUrl(operation, world)}?${shape}`)
                    .set('Authorization', bearer)
                    .set('Accept-Language', 'en');

                expect([operation.path, response.status < 500]).toEqual([operation.path, true]);
            }
        },
        120_000
    );
});
