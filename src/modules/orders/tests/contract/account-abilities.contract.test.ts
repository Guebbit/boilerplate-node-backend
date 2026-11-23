/**
 * @module
 * `GET /account` carries a signed-in customer's own `read:Order` rule: the server's rule, rebuilt
 * the way a browser would, grants the caller's rows and no one else's. It lives here because the
 * rule is `orders`' own; the generic round trip is `account`'s.
 */

import '@tests/contract';
import { api, authenticateAs } from '@tests/http';
import { unpackRules } from '@casl/ability/extra';
import { createMongoAbility, subject } from '@casl/ability';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

describe('GET /account abilities', () => {
    it('carries a signed-in customer’s own order rule, and only their own rows', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api().get('/account').set('Authorization', bearer).expect(200);
        const { tenantId, tenant } = response.body.abilities as {
            tenantId: string;
            tenant: unknown[];
        };
        // `unpackRules` hands back the rules a browser rebuilds its ability from.
        const ability = createMongoAbility(unpackRules(tenant as never) as never);

        expect(
            ability.can('read', subject('Order', { userId: user.id, deletedAt: null, tenantId }))
        ).toBe(true);
        expect(ability.can('read', subject('Order', { userId: 'somebody-else', tenantId }))).toBe(
            false
        );
    });
});
