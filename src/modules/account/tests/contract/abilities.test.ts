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
 * Rebuild the ability a browser would, from what the wire carried.
 *
 * `unpackRules` is CASL's own reader for `packRules`' output, so this is literally the client's
 * code path — which is the point: if these two ever stopped agreeing, the endpoint would be
 * publishing something no client can use.
 */
const abilityFrom = (body: { data: { rules: unknown[] } }): MongoAbility =>
    createMongoAbility(unpackRules(body.data.rules as never) as never);

describe('GET /account/abilities', () => {
    it('answers a stranger with the guest role rather than refusing them', async () => {
        // A shop front that greys nothing out for a visitor lies twice: it offers what it will
        // refuse, and it hides that a visitor may browse at all.
        const response = await api().get('/account/abilities').expect(200);

        expect(response.body.data.scope).toBe('tenant');
        expect(abilityFrom(response.body).can('read', subject('Product', { active: true }))).toBe(
            true
        );
    });

    it('does not let a stranger read somebody’s order', async () => {
        const response = await api().get('/account/abilities').expect(200);

        expect(
            abilityFrom(response.body).can('read', subject('Order', { userId: 'someone' }))
        ).toBe(false);
    });

    it('carries a signed-in customer’s own rules, and only their own rows', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .get('/account/abilities')
            .set('Authorization', bearer)
            .expect(200);
        const ability = abilityFrom(response.body);

        expect(ability.can('read', subject('Order', { userId: user.id, deletedAt: null }))).toBe(
            true
        );
        expect(ability.can('read', subject('Order', { userId: 'somebody-else' }))).toBe(false);
    });

    it('carries a shop owner’s rules, which narrow nothing', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/account/abilities')
            .set('Authorization', bearer)
            .expect(200);

        // The same key that lets the route guard through: one rule set, asked twice.
        expect(abilityFrom(response.body).can('delete', subject('Product', {}))).toBe(true);
    });

    it('does not hand a shop owner the platform’s keys', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/account/abilities')
            .set('Authorization', bearer)
            .expect(200);

        // The §7 invariant, reaching the client: what is published is the TENANT scope's rules,
        // and a platform key can never be satisfied from them.
        expect(response.body.data.scope).toBe('tenant');
        expect(abilityFrom(response.body).can('read', subject('ObservabilitySnapshot', {}))).toBe(
            false
        );
    });

    it('states a version that moves with the KEYS, not with a role', async () => {
        // A client caches these. The version is what tells it the cache is about a different
        // model rather than merely a different person — so it is derived from the declared key
        // set rather than typed in, and editing a role cannot change it.
        const response = await api().get('/account/abilities').expect(200);

        expect(response.body.data.version).toBe(PERMISSION_KEYS.length);
    });
});
