/**
 * A real `sk_...` credential for a test that drives the mounted chain.
 *
 * Through the real `mint`, not a fixture: the secret has to be one `resolveCredential` will
 * actually recognise, and the minter has to really hold the keys — `mint` refuses a superset.
 */

import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { TenantCallerContext } from '@types';
import { createUser } from '@modules/users/tests/factories';
import { mint } from '@modules/api-keys/services/api-keys';

/**
 * Mint a credential holding exactly `permissions` and return its plaintext secret.
 *
 * @param permissions - the keys the credential holds, e.g. `['products.any.read']`; the minter
 *   is an admin, so any declared key is mintable
 * @returns the plaintext secret, for an `Authorization: Bearer` header
 */
export const credentialHolding = async (permissions: string[]): Promise<string> => {
    const user = await createUser({ verifiedAt: new Date() }, 'admin');
    const context: TenantCallerContext = {
        caller: {
            id: String(user._id),
            // `DEPLOYMENT_TENANT_ID`, not `TEST_TENANT_ID`: `createUser` writes the minter's
            // membership under the former, and `resolveCredential` re-reads what the minter holds
            // NOW rather than trusting the snapshot. A mismatch here mints fine and then resolves
            // to no permissions at all, which reads as a 403 and looks like a guard bug.
            tenantId: DEPLOYMENT_TENANT_ID,
            scope: 'tenant',
            permissions,
            unrestricted: false,
            system: false
        },
        analyticsConsent: false
    };

    const result = await mint({ name: 'partner integration', permissions }, context);
    if (!result.success || !result.data) throw new Error('mint failed in test setup');

    return result.data.secret;
};
