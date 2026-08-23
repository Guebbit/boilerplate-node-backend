/**
 * Do the two spellings of one search accept the same thing?
 *
 * Four resources offer their filters twice — `GET /products?text=x` and
 * `POST /products/search {text}` reach one controller, run one query and now share one cache
 * entry. `x-alias-of` says they are the same operation and
 * `tests/cross-cutting/contract-aliases.test.ts` checks they ANSWER alike. Nothing checked they
 * ASK alike, and they had already drifted: `GET /feedback` declared `status` as a bare
 * `type: string` while `POST /feedback/search` declared it as a four-value enum, so the same
 * filter was documented as open on one route and closed on the other.
 *
 * That drift is structural rather than careless. A query parameter and a body property are
 * different places in the document — one under `parameters`, one under a request schema — so a
 * constraint added to either is added to one of them. The cost of the second spelling is paying
 * that attention forever; this test is what collects the payment.
 *
 * ── What is compared, and what is not ─────────────────────────────────────────────────────────
 * The VALIDATION shape: type, enum, bounds, length, format. Not `description` — prose written for
 * a human differs legitimately between "the page to return" and "the page to return", and holding
 * two spellings to one sentence would be a style test. Not `default` either: a query string and a
 * JSON body do not have to agree about absence, and `normalizePagination` owns the defaults for
 * both regardless.
 *
 * A filter present in one spelling and missing from the other IS a failure. That is the shape of
 * the original `GET /products` bug in `docs/theory/request-input.md` — a filter the client could
 * send and the API ignored.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** The bundle, because a `$ref` in a fragment points across files and this needs it resolved. */
const spec = parse(readFileSync(path.resolve(__dirname, '../../openapi.yaml'), 'utf8')) as Record<
    string,
    unknown
>;

/** Follow a local `#/...` pointer. The bundle inlines every component, so this needs no I/O. */
const resolve = (node: unknown): Record<string, unknown> => {
    const object = (node ?? {}) as Record<string, unknown>;
    const reference = object.$ref;
    if (typeof reference !== 'string') return object;

    let current: unknown = spec;
    for (const segment of reference.replace('#/', '').split('/'))
        current = (current as Record<string, unknown>)[segment];
    return resolve(current);
};

/**
 * The constraints a generated validator would enforce, and nothing else.
 *
 * Compared as a string so a failure prints both sides rather than a boolean.
 */
const constraints = (schema: Record<string, unknown> | undefined): string =>
    schema === undefined
        ? 'ABSENT'
        : JSON.stringify({
              type: schema.type,
              format: schema.format,
              enum: schema.enum,
              minimum: schema.minimum,
              maximum: schema.maximum,
              minLength: schema.minLength,
              maxLength: schema.maxLength,
              pattern: schema.pattern
          });

/** Every `x-alias-of` pair where the alias is a `POST …/search`, discovered rather than listed. */
const searchPairs = (() => {
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    const routeOf = new Map<string, string>();
    for (const [route, item] of Object.entries(paths))
        for (const operation of Object.values(item))
            if (typeof operation?.operationId === 'string')
                routeOf.set(operation.operationId, route);

    return Object.entries(paths)
        .filter(([route, item]) => route.endsWith('/search') && item.post !== undefined)
        .map(([route, item]) => ({
            searchRoute: route,
            listRoute: routeOf.get(item.post['x-alias-of'] as string),
            post: item.post
        }))
        .filter(
            (pair): pair is typeof pair & { listRoute: string } => pair.listRoute !== undefined
        );
})();

describe('a search accepts the same filters in both spellings', () => {
    // Discovered by walking `x-alias-of`, so a new pair is covered without editing this file —
    // and a regex that stopped matching would make every case below vacuous.
    it('found every search pair', () => {
        expect(searchPairs.map(({ searchRoute }) => searchRoute).toSorted()).toEqual([
            '/feedback/search',
            '/orders/search',
            '/products/search',
            '/users/search'
        ]);
    });

    it.each(searchPairs)(
        // `$searchRoute` reads off the object jest is given, so it names the pair in the title
        // without this signature having to destructure it.
        '$listRoute and $searchRoute declare the same filters',
        ({ listRoute, post }) => {
            const listOperation = ((
                spec.paths as Record<string, Record<string, Record<string, unknown>>>
            )[listRoute].get.parameters ?? []) as unknown[];

            const query = new Map<string, Record<string, unknown>>();
            for (const parameter of listOperation.map((entry) => resolve(entry)))
                if (parameter.in === 'query')
                    query.set(parameter.name as string, resolve(parameter.schema));

            const bodySchema = resolve(
                (resolve(post.requestBody).content as Record<string, { schema?: unknown }>)[
                    'application/json'
                ].schema
            );
            const body = new Map(
                Object.entries((bodySchema.properties ?? {}) as Record<string, unknown>).map(
                    ([name, schema]) => [name, resolve(schema)]
                )
            );

            const divergent = [...new Set([...query.keys(), ...body.keys()])]
                .toSorted()
                .filter((name) => constraints(query.get(name)) !== constraints(body.get(name)))
                .map(
                    (name) =>
                        `${name}: query ${constraints(query.get(name))} vs body ${constraints(body.get(name))}`
                );

            expect(divergent).toEqual([]);
        }
    );
});
