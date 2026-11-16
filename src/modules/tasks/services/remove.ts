/**
 * @module
 * The staff delete: a guarded door (`mayDelete`, then an audit row).
 *
 * @see docs/modules/tasks.md#the-story
 */

import type { CallerContext } from '@types';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { recordAudit } from '@infrastructure/observability/audit';
import { taskRepository } from '../repository';
import { tasksAuditActions } from '../audit';
import { inJurisdiction, mayDelete } from '../access';

/**
 * Loads a task by id and permanently removes it, then — on success — emits
 * `tasksAuditActions.ADMIN_TASK_DELETED`. Needs `delete:Task` and, for a system task,
 * its route set.
 *
 * No soft-delete tier: this module has none, so unlike `orders`' `removeById` there is no
 * `hardDelete` flag to thread through.
 *
 * @returns A 404 when the id names no task in the caller's jurisdiction, a 403 when the caller
 *   may see but not delete it, otherwise the removal result.
 */
export const removeById = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    taskRepository.findById(id).then((task) => {
        if (!task || !inJurisdiction(context.caller, task))
            return generateReject(404, [t('generic.error-item-gone')]);
        if (!mayDelete(context.caller, task))
            return generateReject(403, [t('generic.error-forbidden')]);

        return taskRepository.deleteOne(task).then(() => {
            recordAudit(context, {
                action: tasksAuditActions.ADMIN_TASK_DELETED,
                outcome: 'success',
                targetType: 'task',
                targetId: id
            });
            return generateSuccess(undefined);
        });
    });
