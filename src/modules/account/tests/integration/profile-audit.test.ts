/**
 * @module
 * What `AUTH_PROFILE_UPDATED` says about an own edit: preferences by value, an email change by
 * name only. The audit collection is never scrubbed on erasure.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { accountService } from '../../services';
import { accountAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

describe('accountService.updateProfile — the audit row of an own edit', () => {
    it('names the email when this call asked for a change, and never carries its value', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'owner@example.com', verifiedAt: new Date() });

        await accountService.updateProfile(
            user.id,
            { email: 'new@example.com', locale: 'it' },
            testCallerContext
        );

        const row = auditSpy.mock.calls
            .map(([entry]) => entry)
            .find((entry) => entry.action === accountAuditActions.AUTH_PROFILE_UPDATED);
        expect(row?.metadata).toEqual({
            changes: { locale: { from: 'en', to: 'it' } },
            changedFields: ['email']
        });
    });
});
