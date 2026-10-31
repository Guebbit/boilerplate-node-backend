/**
 * @module
 * `GET /account` carries the caller's abilities and idle clock — the rules the server enforces, as
 * a client receives them.
 *
 * What matters is not that the answer has the members, but that the abilities are the SAME rules
 * the server just used. A client that greys out from its own copy of the policy keeps a duplicate,
 * and the duplicate drifts silently: nobody finds out until a button that was rendered answers 403.
 *
 * So these assert the round trip — pack here, unpack there, ask both — rather than the shape.
 */

import { api, authenticateAs } from '@tests/http';
import { unpackRules } from '@casl/ability/extra';
import { createMongoAbility, subject, type MongoAbility } from '@casl/ability';
import { setupTestDb } from '@tests/setup-test-db';
import { permissionModelVersion, PERMISSION_RULES } from '@kernel/permissions';

setupTestDb();

/**
 * Rebuild ONE scope's ability the way a browser would, from what the wire carried.
 *
 * Takes the scope by name because the two lists are never merged: a client builds one ability per
 * scope and asks the one that owns the subject.
 */
const abilityFrom = (
    body: { abilities: { tenant: unknown[]; platform: unknown[] } },
    scope: 'tenant' | 'platform'
): MongoAbility => createMongoAbility(unpackRules(body.abilities[scope] as never) as never);

describe('GET /account abilities', () => {
    it('carries a signed-in customer’s own rules, and only their own rows', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);
        const ability = abilityFrom(response.body, 'tenant');
        const { tenantId } = response.body.abilities;

        expect(
            ability.can('read', subject('Order', { userId: user.id, deletedAt: null, tenantId }))
        ).toBe(true);
        expect(ability.can('read', subject('Order', { userId: 'somebody-else', tenantId }))).toBe(
            false
        );
    });

    it('carries a shop owner’s rules, which narrow nothing', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);
        const { tenantId } = response.body.abilities;

        // The same key that lets the route guard through: one rule set, asked twice.
        expect(
            abilityFrom(response.body, 'tenant').can('delete', subject('Product', { tenantId }))
        ).toBe(true);
    });

    it('keeps the two scopes apart in the one payload', async () => {
        // The shop's admin AND the installation's operator — two memberships, the one caller that
        // can prove the lists do not leak into each other.
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);

        expect(
            abilityFrom(response.body, 'platform').can('read', subject('ObservabilitySnapshot', {}))
        ).toBe(true);
        expect(
            abilityFrom(response.body, 'tenant').can('read', subject('ObservabilitySnapshot', {}))
        ).toBe(false);
    });

    it('hands a caller with no platform membership an empty platform list', async () => {
        // Empty rather than absent: every caller gets the same shape.
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);

        expect(response.body.abilities.platform).toEqual([]);
    });

    it('states a version that moves with the RULES, not with a role', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);

        expect(response.body.abilities.version).toBe(
            permissionModelVersion(PERMISSION_RULES.map((entry) => entry.id))
        );
    });

    it('lists the roles an administrator may assign, and not the platform one', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);
        const { grantableRoles } = response.body.abilities;

        expect(grantableRoles).toEqual(expect.arrayContaining(['manager', 'moderator', 'admin']));
        expect(grantableRoles).not.toContain('operator');
        expect(grantableRoles).not.toContain('customer');
    });

    it('does not carry the removed subject list', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);

        expect(response.body.abilities).not.toHaveProperty('subjects');
    });

    it('answers the idle clock beside the account, and leaves a shopper’s timeout absent', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);

        expect(typeof response.body.activity.lastActiveAt).toBe('string');
        expect(response.body.activity).not.toHaveProperty('idleTimeoutSeconds');
    });

    it('keeps the ETag over the stored account, so it does not move with the abilities', async () => {
        const { bearer } = await authenticateAs('user');

        const first = await api().get('/account').set('Authorization', bearer).expect(200);
        const second = await api().get('/account').set('Authorization', bearer).expect(200);

        expect(first.headers.etag).toBeDefined();
        expect(second.headers.etag).toBe(first.headers.etag);
    });
});
