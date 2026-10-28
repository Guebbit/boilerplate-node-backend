/**
 * @module
 * Ownership sweep, foundation half: another customer's id, in the URL or in the body, answers
 * exactly like an id that does not exist (`docs/theory/defences/authorization.md`, the IDOR row).
 *
 * Holds two things:
 *   completeness   every customer-reachable path, body and query id is in exactly one list of
 *                  `owned-ids.ts`, and every list entry is still derived. Whole app, derived
 *                  from the mounted routes and `openapi.yaml`, never written down.
 *   the sweep      the foundation families: saved addresses and login sessions.
 *
 * Differs from `authorization-contract.test.ts`, which sweeps PERMISSIONS (does this role reach
 * this route). This file sweeps OWNERSHIP: a role that does reach it, aimed at someone else's row.
 * The shop families are `ownership-shop.contract.test.ts`, a separate file so `demo:remove` takes
 * exactly that half with the shop.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { everyMountedRoute } from '@tests/contract-routes';
import { identityGuardIndex } from '@tests/routes';
import { holds } from '@kernel/ability';
import { callerAs } from '@tests/callers';
import { isDeployed } from '@tests/paths';
import { readSpec } from '@tests/spec-walk';
import type { SchemaNode } from '@tests/spec-walk';
import { MISSING_ID } from '@tests/ids';
import { FAMILIES, NOT_AN_ID_BY_NAME, OWNED_PATH } from '@tests/owned-ids';
import type { OwnedId } from '@tests/owned-ids';
import { judge } from '@tests/ownership-sweep';
import type { OwnedCase, Verb } from '@tests/ownership-sweep';

setupTestDb();

/** The one reusable type in the contract that means "a row someone owns". */
const ID_REF = '#/components/schemas/Id';

/** One request property found in the contract. */
interface Found {
    field: string;
    typedId: boolean;
}

/** Follows a `$ref` into `components.schemas`; a node without one is returned as is. */
const follow = (node: SchemaNode): SchemaNode =>
    node.$ref === undefined
        ? node
        : (readSpec().components?.schemas?.[node.$ref.split('/').pop() ?? ''] ?? {});

/**
 * Every property under a schema, with whether it is typed `Id`. Walks the raw bundle because the
 * resolved walk in `spec-walk.ts` loses the `$ref` name this match is made on. `trail` stops a
 * schema that contains itself.
 */
const propertiesOf = (node: SchemaNode, prefix: string, trail: readonly string[] = []): Found[] => {
    if (node.$ref === ID_REF) return [{ field: prefix, typedId: true }];
    if (node.$ref !== undefined && trail.includes(node.$ref)) return [];
    const next = node.$ref === undefined ? trail : [...trail, node.$ref];
    const own = follow(node);
    const members = [...(own.allOf ?? []), ...(own.oneOf ?? []), ...(own.anyOf ?? [])];
    return [
        ...members.flatMap((member) => propertiesOf(member, prefix, next)),
        ...(own.items ? propertiesOf(own.items, `${prefix}[]`, next) : []),
        ...Object.entries(own.properties ?? {}).flatMap(([name, child]) =>
            propertiesOf(child, prefix === '' ? name : `${prefix}.${name}`, next)
        ),
        // A scalar property that is not an `Id`: kept so the tripwire can read its name.
        ...(prefix !== '' &&
        own.properties === undefined &&
        own.items === undefined &&
        members.length === 0
            ? [{ field: prefix, typedId: false }]
            : [])
    ];
};

/** What the contract declares for one operation's request: body properties and query parameters. */
const requestProperties = (path: string, method: string): Found[] => {
    const operation = readSpec().paths[path]?.[method.toLowerCase()] as
        | {
              requestBody?: { content?: Record<string, { schema?: SchemaNode }> };
              parameters?: { $ref?: string; name?: string; in?: string; schema?: SchemaNode }[];
          }
        | undefined;
    const body = Object.values(operation?.requestBody?.content ?? {}).flatMap((media) =>
        media.schema ? propertiesOf(media.schema, '') : []
    );
    const query = (operation?.parameters ?? [])
        .map((parameter) =>
            parameter.$ref === undefined
                ? parameter
                : readSpec().components?.parameters?.[parameter.$ref.split('/').pop() ?? '']
        )
        .filter((parameter) => parameter?.in === 'query' && parameter.schema !== undefined)
        .flatMap((parameter) => propertiesOf(parameter?.schema ?? {}, parameter?.name ?? ''));
    return [...body, ...query];
};

/** `/orders/` is how a module mounts its root; the contract and the keys write `/orders`. */
const withoutTrailingSlash = (path: string): string => path.replace(/(.)\/$/, '$1');

/** The routes a customer can call: an identity guard, and every permission one a customer holds. */
const customerRoutes = everyMountedRoute().filter(
    (route) =>
        identityGuardIndex(route.guards) >= 0 &&
        route.permissions.every((ask) => holds(callerAs('customer'), ask.action, ask.subject))
);

/** Every key the contract and the mounted routes derive, and every `*Id` property that is not an `Id`. */
const derive = () => {
    const keys: string[] = [];
    const untyped: string[] = [];
    for (const route of customerRoutes) {
        const path = withoutTrailingSlash(route.path);
        if (path.includes(':')) keys.push(`${route.method} ${path}`);
        const specPath = path.replaceAll(/:(\w+)/g, '{$1}');
        for (const found of requestProperties(specPath, route.method)) {
            if (found.typedId) keys.push(`${route.method} ${path}#${found.field}`);
            else if (found.field.endsWith('Id')) untyped.push(found.field.split('.').pop() ?? '');
        }
    }
    return { keys: [...new Set(keys)], untyped: [...new Set(untyped)] };
};

/** The list entries of the modules this checkout still has. */
const deployed = (entries: readonly OwnedId[]): string[] =>
    entries.filter(({ module }) => isDeployed(module)).map(({ key }) => key);

describe('every id a customer can send is classified (derived from the routes and the contract)', () => {
    const derived = derive();
    const listed = Object.values(FAMILIES).flatMap((entries) => deployed(entries));

    it('has no id that sits in no list', () => {
        expect(derived.keys.filter((key) => !listed.includes(key))).toEqual([]);
    });

    it('has no list entry the routes and the contract no longer derive', () => {
        expect(listed.filter((key) => !derived.keys.includes(key))).toEqual([]);
    });

    it('lists no id twice, across or within a family', () => {
        expect(listed.filter((key, index) => listed.indexOf(key) !== index)).toEqual([]);
    });

    it('has no request property named like an id that is not typed Id, unless it is not one', () => {
        expect(derived.untyped.filter((name) => !NOT_AN_ID_BY_NAME.includes(name))).toEqual([]);
    });
});

/** A's address and A's login session, built over HTTP the way a client would. */
const seedFoundation = async () => {
    const victim = await authenticateAs('user');
    const created = await api()
        .post('/account/addresses')
        .set('Authorization', victim.bearer)
        .send({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1',
            city: 'Modena',
            zip: '41121',
            country: 'IT'
        });
    const sessions = await api().get('/account/sessions').set('Authorization', victim.bearer);
    const attacker = await authenticateAsRole('customer');
    return {
        victim,
        attacker,
        addressId: String(created.body.id),
        sessionId: String(sessions.body.sessions[0].id)
    };
};

/** The cases of the foundation families, one per `OWNED_PATH` entry of `addresses` and `account`. */
const foundationCases = (world: Awaited<ReturnType<typeof seedFoundation>>): OwnedCase[] => {
    const { attacker, addressId, sessionId } = world;
    /** A path case: `key`'s method and `template`, aimed at `victimId` or at nothing. */
    const at = (key: string, template: string, victimId: string, body?: object): OwnedCase => ({
        key,
        answer: { status: 404 },
        aim: (foreign) => ({
            method: key.split(' ', 1)[0] as Verb, // the key's first word is always one of the verbs
            path: template.replace(/:\w+/, () => (foreign ? victimId : MISSING_ID)),
            bearer: attacker.bearer,
            body
        })
    });
    const address = '/account/addresses/:addressId';
    return [
        at('GET /account/addresses/:addressId', address, addressId),
        at('PUT /account/addresses/:addressId', address, addressId, {
            fullName: 'Mallory',
            street: 'Via Roma 2',
            city: 'Modena',
            zip: '41121',
            country: 'IT'
        }),
        at('PATCH /account/addresses/:addressId', address, addressId, { city: 'Roma' }),
        at('DELETE /account/addresses/:addressId', address, addressId),
        at('PUT /account/addresses/:addressId/default', `${address}/default`, addressId),
        at('GET /account/sessions/:sessionId', '/account/sessions/:sessionId', sessionId),
        at('DELETE /account/sessions/:sessionId', '/account/sessions/:sessionId', sessionId)
    ];
};

describe('another customer’s saved address and login session answer like a missing one', () => {
    it('refuses every foundation path id, and leaves the victim’s rows as they were', async () => {
        const world = await seedFoundation();
        const cases = foundationCases(world);
        const { bearer } = world.victim;
        const watch = () =>
            Promise.all([
                api().get('/account/addresses').set('Authorization', bearer),
                api().get('/account/sessions').set('Authorization', bearer)
            ]).then(([addresses, sessions]) => ({
                addresses: addresses.body,
                // `lastUsedAt` moves with the victim's own reads, so only the handles are compared.
                sessions: (sessions.body.sessions as { id: string }[]).map((one) => one.id)
            }));

        expect(cases.map((one) => one.key).toSorted()).toEqual(
            deployed(
                OWNED_PATH.filter(({ module }) => ['addresses', 'account'].includes(module))
            ).toSorted()
        );
        const problems: string[] = [];
        for (const one of cases) problems.push(...(await judge(one, watch)));

        expect(problems).toEqual([]);
    });
});
