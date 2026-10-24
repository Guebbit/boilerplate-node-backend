/**
 * @module
 * What `ADMIN_USER_UPDATED` says about an edit: preferences
 * by value, everything that identifies the person by NAME only. The audit collection is never
 * scrubbed on erasure, so a phone number or an email must never be copied into it.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '../../services';
import { usersAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The `metadata` of the one row an edit wrote under `action`. */
const metadataOf = (
    spy: jest.SpiedFunction<typeof auditPort.emitAuditEvent>,
    action: string
): unknown =>
    spy.mock.calls.map(([entry]) => entry).find((entry) => entry.action === action)?.metadata;

describe('userService.updateById — the audit row of an admin edit', () => {
    it('records the locale by value and the personal fields by name', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ username: 'before', email: 'a@example.com' });

        await userService.updateById(
            user.id,
            { username: 'after', locale: 'it', phone: '+1 555 0100' },
            callerContextAs('admin')
        );

        expect(metadataOf(auditSpy, usersAuditActions.ADMIN_USER_UPDATED)).toEqual({
            changes: { locale: { from: 'en', to: 'it' } },
            changedFields: ['username', 'phone']
        });
    });

    it('writes nothing for a value sent unchanged, a phone included', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ username: 'same', email: 'b@example.com' });
        await userService.updateById(user.id, { phone: '+1 555 0100' }, callerContextAs('admin'));
        auditSpy.mockClear();

        await userService.updateById(
            user.id,
            { username: 'same', phone: '+1 555 0100' },
            callerContextAs('admin')
        );

        expect(metadataOf(auditSpy, usersAuditActions.ADMIN_USER_UPDATED)).toEqual({});
    });
});
