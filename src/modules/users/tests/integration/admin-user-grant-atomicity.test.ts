/**
 * @module
 * An admin create or update and its role grant are one transaction: the grant is checked, and a
 * refusal audited, before any write; a failure inside it rolls the whole write back instead of
 * leaving a half-made account. Each case forces the role write (and, for a create, any delete that
 * could undo it) to fail, then looks at what is stored. `users` writes; `access`, which it depends
 * on, owns the `membershipModel` write that is forced to fail.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { asStub } from '@tests/stub';
import { observePort } from '@tests/ports';
import * as auditPort from '@infrastructure/observability/audit';
import { accessAuditActions, membershipModel } from '@modules/access/tests/factories';
import { userService } from '../../services';
import { createUser, userRepository } from '../factories';

// See `tests/support/ports.ts`: `observePort` needs a plain `jest.fn()` behind the namespace.
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

setupTestDb();
afterEach(() => jest.restoreAllMocks());

/** Makes the next membership write reject, the shape an infrastructure failure takes. */
const failMembershipWrites = () =>
    jest.spyOn(membershipModel, 'findOneAndUpdate').mockReturnValue(
        asStub<ReturnType<typeof membershipModel.findOneAndUpdate>>({
            exec: () => Promise.reject(new Error('mongo is down'))
        })
    );

describe('userService.create', () => {
    it('writes nothing, and audits the refusal, when the role is an escalation', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const createSpy = jest.spyOn(userRepository, 'create');

        // `moderator` can create accounts but cannot grant `admin`.
        await expect(
            userService.create(
                { email: 'never-created@example.com', username: 'nevercreated', role: 'admin' },
                callerContextAs('moderator')
            )
        ).rejects.toMatchObject({ name: 'AccessInvariantError' });

        expect(createSpy).not.toHaveBeenCalled();
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_ASSIGNED,
                outcome: 'failure',
                metadata: expect.objectContaining({ role: 'admin' })
            })
        );
    });

    it('leaves no row when the role write fails, with no compensating delete to depend on', async () => {
        failMembershipWrites();
        // The delete that used to undo a half-made account is the very thing that could fail too.
        jest.spyOn(userRepository, 'deleteOne').mockRejectedValue(new Error('delete failed'));

        await expect(
            userService.create(
                { email: 'half-made@example.com', username: 'halfmade', role: 'support' },
                callerContextAs('admin')
            )
        ).rejects.toThrow();

        expect(await userRepository.findOne({ email: 'half-made@example.com' })).toBeNull();
    });
});

describe('userService.updateById', () => {
    it('audits a refused role grant even though nothing was written', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ active: true });

        await expect(
            userService.updateById(
                user.id,
                { active: false, role: 'admin' },
                callerContextAs('moderator')
            )
        ).rejects.toMatchObject({ name: 'AccessInvariantError' });

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_ASSIGNED,
                outcome: 'failure',
                targetId: user.id
            })
        );
    });

    it('commits none of the update when its role write fails', async () => {
        const user = await createUser({ username: 'beforerename' }, 'customer');
        failMembershipWrites();

        await expect(
            userService.updateById(
                user.id,
                { username: 'afterrename', role: 'support' },
                callerContextAs('admin')
            )
        ).rejects.toThrow('mongo is down');

        const refreshed = await userRepository.findById(user.id);
        expect(refreshed?.username).toBe('beforerename');
    });
});
