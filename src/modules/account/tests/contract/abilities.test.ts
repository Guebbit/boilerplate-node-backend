/**
 * @module
 * `GET /account/abilities` — the rules the server enforces, as a client receives them.
 *
 * What matters here is not that the endpoint answers, but that it answers with the SAME rules the
 * server just used. A client that greys out from its own copy of the policy keeps a duplicate, and
 * the duplicate drifts silently: nobody finds out until a button that was rendered answers 403, or
 * one that should have been rendered is missing.
 *
 * So these assert the round trip — pack here, unpack there, ask both — rather than the shape.
 */

import { api, authenticateAs } from '@tests/http';
import { unpackRules } from '@casl/ability/extra';
import { createMongoAbility, subject, type MongoAbility } from '@casl/ability';
import { setupTestDb } from '@tests/setup-test-db';
import { PERMISSION_KEYS } from '@kernel/permissions';

setupTestDb();

/**
 * Rebuild ONE scope's ability the way a browser would, from what the wire carried.
 *
 * `unpackRules` is CASL's own reader for `packRules`' output, so this is literally the client's
 * code path — which is the point: if these two ever stopped agreeing, the endpoint would be
 * publishing something no client can use.
 *
 * Takes the scope by name because the two lists are never merged: a client builds one ability per
 * scope and asks the one that owns the subject, and a test that concatenated them would prove the
 * opposite of the invariant.
 */
const abilityFrom = (
    body: { data: { tenant: unknown[]; platform: unknown[] } },
    scope: 'tenant' | 'platform'
): MongoAbility => createMongoAbility(unpackRules(body.data[scope] as never) as never);

describe('GET /account/abilities', () => {
    it('answers a stranger with the guest role rather than refusing them', async () => {
        // A shop front that greys nothing out for a visitor lies twice: it offers what it will
        // refuse, and it hides that a visitor may browse at all.
        const response = await api().get('/account/abilities').expect(200);
        // The client's own job, documented on `Abilities.tenantId`: the collection stores no
        // tenant column at all (this deployment ships one shop), so a checked object never
        // carries one — the envelope's own `tenantId` is what a client attaches before asking.
        const { tenantId } = response.body.data;

        expect(
            abilityFrom(response.body, 'tenant').can(
                'read',
                subject('Product', { active: true, tenantId })
            )
        ).toBe(true);
    });

    it('does not let a stranger read somebody’s order', async () => {
        const response = await api().get('/account/abilities').expect(200);
        const { tenantId } = response.body.data;

        expect(
            abilityFrom(response.body, 'tenant').can(
                'read',
                subject('Order', { userId: 'someone', tenantId })
            )
        ).toBe(false);
    });

    it('carries a signed-in customer’s own rules, and only their own rows', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .get('/account/abilities')
            .set('Authorization', bearer)
            .expect(200);
        const ability = abilityFrom(response.body, 'tenant');
        const { tenantId } = response.body.data;

        expect(
            ability.can('read', subject('Order', { userId: user.id, deletedAt: null, tenantId }))
        ).toBe(true);
        expect(ability.can('read', subject('Order', { userId: 'somebody-else', tenantId }))).toBe(
            false
        );
    });

    it('carries a shop owner’s rules, which narrow nothing', async () => {
        const { bearer } = await authenticateAs('owner');

        const response = await api()
            .get('/account/abilities')
            .set('Authorization', bearer)
            .expect(200);
        const { tenantId } = response.body.data;

        // The same key that lets the route guard through: one rule set, asked twice.
        expect(
            abilityFrom(response.body, 'tenant').can('delete', subject('Product', { tenantId }))
        ).toBe(true);
    });

    it('keeps the two scopes apart in the one payload', async () => {
        // This account is a shop owner AND the installation's operator — two memberships, which is
        // what makes it the one caller that can prove the lists do not leak into each other.
        const { bearer } = await authenticateAs('owner');

        const response = await api()
            .get('/account/abilities')
            .set('Authorization', bearer)
            .expect(200);

        // The scope invariant, reaching the client: the platform key is answerable ONLY from the
        // platform list, and the shop's unrestricted `all.manage` does not reach it.
        expect(
            abilityFrom(response.body, 'platform').can('read', subject('ObservabilitySnapshot', {}))
        ).toBe(true);
        expect(
            abilityFrom(response.body, 'tenant').can('read', subject('ObservabilitySnapshot', {}))
        ).toBe(false);
    });

    it('hands a caller with no platform membership an empty platform list', async () => {
        // Empty rather than absent: every caller gets the same shape, so a client never branches
        // on whether the field arrived — it just builds an ability that grants nothing.
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .get('/account/abilities')
            .set('Authorization', bearer)
            .expect(200);

        expect(response.body.data.platform).toEqual([]);
        expect(
            abilityFrom(response.body, 'platform').can('read', subject('ObservabilitySnapshot', {}))
        ).toBe(false);
    });

    it('states a version that moves with the KEYS, not with a role', async () => {
        // A client caches these. The version is what tells it the cache is about a different
        // model rather than merely a different person — so it is derived from the declared key
        // set rather than typed in, and editing a role cannot change it.
        const response = await api().get('/account/abilities').expect(200);

        expect(response.body.data.version).toBe(PERMISSION_KEYS.length);
    });
});
