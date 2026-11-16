/**
 * Do the two spellings of one search accept the same thing?
 *
 * Why:      four resources offer their filters twice (`GET /products?text=x` and `POST
 *           /products/search {text}`): one controller, one query, one cache entry. `x-alias-of`
 *           says they are the same operation; the last describe checks they ANSWER alike, the first
 *           that they ASK alike. They had drifted: `GET /tasks` declared `status` as a bare string
 *           while `POST /tasks/search` declared a four-value enum.
 * Cause:    structural, not careless. A query parameter and a body property live in different
 *           places in the document, so a constraint is added to one of them. The cost of a second
 *           spelling is paying that attention forever; this test collects it.
 * Compared: the VALIDATION shape: type, enum, bounds, length, format. Not `description` (prose
 *           differs legitimately; holding two spellings to one sentence is a style test). Not
 *           `default`: a query string and a JSON body need not agree about absence, and
 *           `normalizePagination` owns the defaults.
 * Failure:  a filter in one spelling and missing from the other, like the original `GET /products`
 *           bug: a filter the client could send and the API ignored.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeployed } from '@tests/paths';
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

/** Every operation carrying `x-alias-of`, search pairs and hard-delete pairs alike. */
const aliases = (() => {
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    const operations = Object.values(paths).flatMap((item) =>
        Object.values(item).filter((operation) => typeof operation?.operationId === 'string')
    );
    const byId = new Map(
        operations.map((operation) => [operation.operationId as string, operation])
    );
    return operations
        .filter((operation) => operation['x-alias-of'] !== undefined)
        .map((alias) => ({
            id: alias.operationId as string,
            target: alias['x-alias-of'] as string,
            alias,
            canonical: byId.get(alias['x-alias-of'] as string)
        }));
})();

/**
 * The first 2xx status and its JSON schema, as one comparable string.
 *
 * A caller switching spellings branches on the status and parses the schema; prose
 * (`description`) is left out on purpose.
 */
const successShape = (operation: Record<string, unknown>): string => {
    const responses = (operation.responses ?? {}) as Record<string, unknown>;
    const status = Object.keys(responses).find((code) => code.startsWith('2'));
    if (status === undefined) return 'NO 2xx';
    const content = resolve(responses[status]).content as
        Record<string, { schema?: unknown }> | undefined;
    return `${status} ${JSON.stringify(content?.['application/json']?.schema ?? null)}`;
};

describe('a search accepts the same filters in both spellings', () => {
    /**
     * Discovered by walking `x-alias-of`, so a new pair is covered without editing this file —
     * and a regex that stopped matching would make every case below vacuous.
     */
    it('found every search pair', () => {
        /**
         * Owning module and route prefix, which share a name for every pair bar `example`: its
         * collection path is the plural `/examples`, like `/products`.
         */
        const owners: [module: string, prefix: string][] = [
            ['example', 'examples'],
            ['orders', 'orders'],
            ['payments', 'payments'],
            ['products', 'products'],
            ['tasks', 'tasks'],
            ['users', 'users']
        ];
        const expected = owners
            .filter(([module]) => isDeployed(module))
            .map(([, prefix]) => `/${prefix}/search`);

        expect(searchPairs.map(({ searchRoute }) => searchRoute).toSorted()).toEqual(expected);
    });

    it.each(searchPairs)(
        /**
         * `$searchRoute` reads off the object jest is given, so it names the pair in the title
         * without this signature having to destructure it.
         */
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

describe('an alias answers like its canonical', () => {
    // A bundle read wrong would make both checks below pass on an empty list.
    it('found the aliases', () => {
        expect(aliases.length).toBeGreaterThan(3);
    });

    it('every x-alias-of names an operation that exists', () => {
        expect(
            aliases
                .filter(({ canonical }) => canonical === undefined)
                .map(({ id, target }) => `${id} -> ${target}`)
        ).toEqual([]);
    });

    it('both spellings return the same success status and schema', () => {
        const divergent = aliases
            .filter(
                ({ alias, canonical }) =>
                    canonical !== undefined && successShape(alias) !== successShape(canonical)
            )
            .map(({ id, target }) => `${id} answers differently from ${target}`);

        expect(divergent).toEqual([]);
    });
});
