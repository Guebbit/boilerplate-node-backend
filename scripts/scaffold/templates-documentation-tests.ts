/**
 * @module
 * The docs page skeleton and the smoke tests of a scaffolded module. Same conventions as the
 * runtime templates: plain template literals, no backticks in generated comments.
 */

import type { ModuleNames } from './names';
import type { ScaffoldOptions } from './options';

/**
 * The module's page under docs/modules, with the graph markers `docs:graph` fills.
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

## The story

TODO: why this domain exists, the decisions that are not obvious from the code, and the traps.
Do not restate the routes or the fields; they live in \`src/modules/${names.kebab}/routes.ts\`,
\`openapi.yaml\` and \`model.ts\`.

## The pipeline

Scaffolded from [\`feedback\`](./feedback.md)'s admin half: every route sits behind one gate and one
permission key.

\`\`\`mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["admin"] --> G["getAuth + isAuthOrCredential"]
    G --> K["requirePermission<br/><i>${names.family}.any.read · create · update · delete</i>"]
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
 * The service integration test, against a real database.
 * @param names - the module's spellings
 * @returns the TypeScript text
 */
export const serviceTest = (names: ModuleNames): string => `/**
 * @module
 * The ${names.kebab} service against a real database: create trims, a merge leaves omitted fields
 * alone, a null clears one, and a missing id answers 404 for both update and remove.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { MISSING_ID } from '@tests/ids';
import { asReject, asSuccess } from '@tests/response';
import { create, search, updateById, remove } from '@modules/${names.kebab}/service';
import { make${names.entity} } from '@modules/${names.kebab}/factories';

setupTestDb();

describe('${names.kebab} service', () => {
    it('trims the name on create', () =>
        create({ ...make${names.entity}(), name: '  Padded  ' }).then((created) => {
            expect(created.name).toBe('Padded');
        }));

    it('lists what was created', () =>
        create(make${names.entity}())
            .then(() => search())
            .then((page) => {
                expect(page.items).toHaveLength(1);
                expect(page.meta.totalItems).toBe(1);
            }));

    it('merges: an omitted field stays, a null clears', () =>
        create(make${names.entity}({ notes: 'keep me' }))
            .then((created) => updateById(String(created._id), { name: 'Renamed' }))
            .then((renamed) => {
                expect(asSuccess(renamed).data.name).toBe('Renamed');
                expect(asSuccess(renamed).data.notes).toBe('keep me');
                return updateById(String(asSuccess(renamed).data._id), { notes: null });
            })
            .then((cleared) => {
                expect(asSuccess(cleared).data.notes).toBeUndefined();
            }));

    it('answers 404 for an id nothing owns', () =>
        Promise.all([updateById(MISSING_ID, { name: 'x' }), remove(MISSING_ID)]).then(
            ([updated, removed]) => {
                expect(asReject(updated).status).toBe(404);
                expect(asReject(removed).status).toBe(404);
            }
        ));

    it('removes for good', () =>
        create(make${names.entity}())
            .then((created) => remove(String(created._id)))
            .then((removed) => {
                expect(asSuccess(removed).status).toBe(200);
                return search();
            })
            .then((page) => {
                expect(page.items).toHaveLength(0);
            }));
});
`;
