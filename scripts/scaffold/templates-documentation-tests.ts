/**
 * @module
 * The docs page skeleton and the smoke tests of a scaffolded module. Same conventions as the
 * runtime templates: plain template literals, no backticks in generated comments.
 */

import type { ModuleNames } from './names';
import type { ScaffoldOptions } from './options';

/**
 * The module's page under docs/modules, with the graph markers `regenerate` fills.
 * @param names - the module's spellings
 * @param options - the scaffold options
 * @returns the Markdown text
 */
export const documentationPage = (
    names: ModuleNames,
    options: ScaffoldOptions
): string => `# ${names.kebab}

::: tip At a glance
**Owns** — ${options.summary}
**Depends on** — nothing yet. Fill this in when the module starts importing a sibling.
**Breaks if you change** — TODO: the one contract a caller cannot live without.
:::

## Its neighbourhood

<!-- module-graph:${names.kebab}:start -->

<!-- module-graph:${names.kebab}:end -->

## Who can do what

Every rule this module declares and who holds it, role by role.

<!-- permissions:start -->

<!-- permissions:end -->

## The story

TODO: why this domain exists, the decisions that are not obvious from the code, and the traps.
Do not restate the routes or the fields; they live in \`src/modules/${names.kebab}/routes.ts\`,
\`openapi.yaml\` and \`model.ts\`.

## The pipeline

Scaffolded from the core of the \`example\` module ([the module template](../theory/modules.md#the-module-template)): every route sits behind one gate and one
permission rule.

\`\`\`mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["admin"] --> G["getAuth + isAuthOrCredential"]
    G --> K["requirePermission<br/><i>read · create · update · delete on ${names.entity}</i>"]
    K --> C["controller"]
    C --> S["service${options.audit ? '<br/><i>records an audit row</i>' : ''}"]
    S --> R["repository"]
    R --> D[("${names.entity}")]

    classDef public fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef store fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,G,K public;
    class D store;
\`\`\`

## Related pages

- [Modules overview](./index.md) — the whole context map
- [Adding & removing a module](../theory/module-lifecycle.md) — what to do next
- [Module scaffolder](../tools/module-scaffolder.md) — what generated this page
`;

/**
 * The route-table unit test.
 * @param names - the module's spellings
 * @returns the TypeScript text
 */
export const routesTest = (names: ModuleNames): string => `/**
 * @module
 * The ${names.kebab} route table: which endpoints are mounted, and that every one sits below the
 * gate and carries a permission key. Positional assertions on purpose - per-route middleware
 * alone would pass whatever order the routes were typed in.
 */

import { routeSignatures, guardsOn, identityGuardIndex, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/${names.kebab}/routes';

describe('${names.kebab} routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /',
            'GET /:id',
            'POST /',
            'PUT /:id',
            'PATCH /:id',
            'DELETE /:id'
        ]);
    });

    it.each(routeSignatures(router))('%s sits below the gate and is keyed', (signature) => {
        const guards = guardsOn(router, signature);

        expect(identityGuardIndex(guards)).toBeGreaterThanOrEqual(0);
        expect(guards).toContain('requirePermissionGuard');
    });

    it('never Redis-caches the list, only privateNoCache', () => {
        const chain = chainOf(router, 'GET /');

        expect(chain).toContain('privateNoCache');
        expect(chain.some((entry) => entry.startsWith('setCache'))).toBe(false);
    });
});
`;

/**
 * The factory unit test.
 * @param names - the module's spellings
 * @returns the TypeScript text
 */
export const factoriesTest = (names: ModuleNames): string => `/**
 * @module
 * make${names.entity} - the fixture builder: defaults apply, overrides win, and an absent optional
 * field stays absent so the schema decides.
 */

import { make${names.entity} } from '@modules/${names.kebab}/factories';

describe('make${names.entity}', () => {
    it('gives a name by default and leaves notes absent', () => {
        const fixture = make${names.entity}();

        expect(fixture.name).not.toBe('');
        expect(Object.hasOwn(fixture, 'notes')).toBe(false);
    });

    it('lets an override win', () => {
        expect(make${names.entity}({ name: 'Custom', notes: 'Hello' })).toEqual({
            name: 'Custom',
            notes: 'Hello'
        });
    });
});
`;

/**
 * The domain unit test.
 * @param names - the module's spellings
 * @returns the TypeScript text
 */
export const domainTest = (names: ModuleNames): string => `/**
 * @module
 * The ${names.kebab} domain rules, with no database: the actions a caller is told they have are
 * exactly the keys they hold.
 */

import { ${names.entityCamel}ActionsFor } from '@modules/${names.kebab}/domain';

describe('${names.entityCamel}ActionsFor', () => {
    it.each([
        [{ update: true, delete: true }],
        [{ update: true, delete: false }],
        [{ update: false, delete: true }],
        [{ update: false, delete: false }]
    ])('echoes the keys %j', (permits) => {
        expect(${names.entityCamel}ActionsFor(permits)).toEqual(permits);
    });
});
`;

/**
 * The service integration test, against a real database.
 * @param names - the module's spellings
 * @returns the TypeScript text
 */
export const serviceTest = (names: ModuleNames): string => `/**
 * @module
 * The ${names.kebab} service against a real database: create trims, a merge leaves omitted fields
 * alone, a null clears one, a missing id answers 404 for read, update and remove, and every answer
 * carries the actions the caller holds.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { MISSING_ID } from '@tests/ids';
import { asReject, asSuccess } from '@tests/response';
import { ${names.entityCamel}Service } from '@modules/${names.kebab}/services';
import { make${names.entity} } from '@modules/${names.kebab}/factories';

setupTestDb();

/** An administrator, who holds every key by name. */
const admin = callerContextAs('admin');

/** Anonymous: holds no key, so every action is false. */
const guest = callerContextAs('guest');

describe('${names.kebab} service', () => {
    it('trims the name on create, and tells the caller what they may do next', () =>
        ${names.entityCamel}Service
            .create({ ...make${names.entity}(), name: '  Padded  ' }, admin)
            .then((created) => {
                expect(created.name).toBe('Padded');
                expect(created.actions).toEqual({ update: true, delete: true });
            }));

    it('lists what was created, each row with its actions', () =>
        ${names.entityCamel}Service
            .create(make${names.entity}(), admin)
            .then(() => ${names.entityCamel}Service.search({}, admin))
            .then((page) => {
                expect(page.items).toHaveLength(1);
                expect(page.items[0].actions).toEqual({ update: true, delete: true });
                expect(page.meta.totalItems).toBe(1);
            }));

    it('reads one by id, and tells a caller without keys they may do nothing', () =>
        ${names.entityCamel}Service
            .create(make${names.entity}({ name: 'Findable' }), admin)
            .then((created) => ${names.entityCamel}Service.getById(created.id, guest))
            .then((found) => {
                expect(found?.name).toBe('Findable');
                expect(found?.actions).toEqual({ update: false, delete: false });
            }));

    it('merges: an omitted field stays, a null clears', () =>
        ${names.entityCamel}Service
            .create(make${names.entity}({ notes: 'keep me' }), admin)
            .then((created) => ${names.entityCamel}Service.updateById(created.id, { name: 'Renamed' }, admin))
            .then((renamed) => {
                expect(asSuccess(renamed).data.name).toBe('Renamed');
                expect(asSuccess(renamed).data.notes).toBe('keep me');
                return ${names.entityCamel}Service.updateById(asSuccess(renamed).data.id, { notes: null }, admin);
            })
            .then((cleared) => {
                expect(asSuccess(cleared).data.notes).toBeUndefined();
            }));

    it('answers 404 for an id nothing owns, or null for a read', () =>
        Promise.all([
            ${names.entityCamel}Service.updateById(MISSING_ID, { name: 'x' }, admin),
            ${names.entityCamel}Service.removeById(MISSING_ID, admin),
            ${names.entityCamel}Service.getById(MISSING_ID, admin)
        ]).then(([updated, removed, read]) => {
            expect(asReject(updated).status).toBe(404);
            expect(asReject(removed).status).toBe(404);
            expect(read).toBeNull();
        }));

    it('removes for good', () =>
        ${names.entityCamel}Service
            .create(make${names.entity}(), admin)
            .then((created) => ${names.entityCamel}Service.removeById(created.id, admin))
            .then((removed) => {
                expect(asSuccess(removed).status).toBe(200);
                return ${names.entityCamel}Service.search({}, admin);
            })
            .then((page) => {
                expect(page.items).toHaveLength(0);
            }));
});
`;

/**
 * The HTTP contract test.
 * @param names - the module's spellings
 * @returns the TypeScript text
 */
export const contractTest = (names: ModuleNames): string => `/**
 * @module
 * Contract tests for ${names.basePath}: each route over HTTP, judged against openapi.yaml. Behavioural
 * rules live in the integration suite; these make sure each declared response is actually reached.
 *
 * No bare 401 or 403 case here: the authorization sweep (tests/contract/authorization-contract.test.ts)
 * asks every guarded route for both, as every role.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

/** What an administrator is told they may do to a record. */
const ALL_ACTIONS = { update: true, delete: true };

/**
 * A record created through the API, so the payload under test is what the app produces.
 * @param bearer - the Authorization header value
 * @returns the new record's id
 */
const createViaApi = (bearer: string): Promise<string> =>
    Promise.resolve(api().post('${names.basePath}').set('Authorization', bearer).send({ name: 'A name' })).then(
        (response) => {
            if (response.status !== 201)
                throw new Error(
                    \`setup failed: POST ${names.basePath} returned \${response.status}: \${JSON.stringify(response.body)}\`
                );
            return (response.body as { id: string }).id;
        }
    );

describe('POST ${names.basePath}', () => {
    it('answers 201 with a Location and the record, actions included', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('${names.basePath}')
            .set('Authorization', bearer)
            .send({ name: 'A name' });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(\`${names.basePath}/\${response.body.id}\`);
        expect(response.body.actions).toEqual(ALL_ACTIONS);
    });
});

describe('GET ${names.basePath}/{id}', () => {
    it('answers the record with its actions, and 404 for an unknown or malformed id', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createViaApi(bearer);

        const found = await api().get(\`${names.basePath}/\${id}\`).set('Authorization', bearer);
        const missing = await api().get(\`${names.basePath}/\${MISSING_ID}\`).set('Authorization', bearer);
        const malformed = await api().get('${names.basePath}/not-an-object-id').set('Authorization', bearer);

        expect(found.status).toBe(200);
        expect(found.body).toMatchObject({ id, name: 'A name', actions: ALL_ACTIONS });
        expect(missing.status).toBe(404);
        expect(malformed.status).toBe(404);
    });
});

describe('GET ${names.basePath}', () => {
    it('lists the records, each with its actions', async () => {
        const { bearer } = await authenticateAs('admin');
        await createViaApi(bearer);

        const response = await api().get('${names.basePath}').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items[0].actions).toEqual(ALL_ACTIONS);
    });
});

describe('PUT, PATCH and DELETE ${names.basePath}/{id}', () => {
    it('replaces, merges and removes one record', async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await createViaApi(bearer);
        const path = \`${names.basePath}/\${id}\`;

        const replaced = await api().put(path).set('Authorization', bearer).send({ name: 'Whole' });
        const merged = await api().patch(path).set('Authorization', bearer).send({ notes: 'Added' });
        const removed = await api().delete(path).set('Authorization', bearer);

        expect(replaced.body).toMatchObject({ name: 'Whole', actions: ALL_ACTIONS });
        expect(merged.body).toMatchObject({ name: 'Whole', notes: 'Added' });
        expect(removed.status).toBe(204);
        const gone = await api().get(path).set('Authorization', bearer);
        expect(gone.status).toBe(404);
    });
});
`;
