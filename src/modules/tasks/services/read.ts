/**
 * @module
 * The staff reads: the paginated search and the one-task read, both bounded by the caller's
 * jurisdiction.
 *
 * See: docs/modules/tasks.md
 */

import type { CallerContext, SearchTasksRequest, Task, TaskListItem } from '@types';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { isObjectIdString, toObjectId } from '@infrastructure/persistence/create-repository';
import type { TaskDocument } from '../model';
import { taskRepository } from '../repository';
import { OPEN_STATUSES } from '../domain';
import { inJurisdiction, jurisdictionScope } from '../access';
import { presentTask, presentTaskListItem, withView } from '../presenter';
import { assigneeNamesOf, viewerOf } from '../views';

/** What a search may filter on, past the repository's own text and address matching. */
type TaskFilters = Omit<SearchTasksRequest, 'page' | 'pageSize'> & {
    page?: string | number;
    pageSize?: string | number;
};

/**
 * The part of a search that is a closed enum or a relation, declared as scope rather than on the
 * repository's spec: each has its own collection-wide meaning, not a per-field text match.
 *
 * @param filters - the validated filters
 * @param context - the caller, whose jurisdiction bounds the search and whose id `assignee=me` reads
 * @param now - the clock, for `overdue`
 */
const scopeOf = (
    filters: TaskFilters,
    context: CallerContext,
    now: Date
): Record<string, unknown> => {
    const { caller } = context;
    const clauses: Record<string, unknown>[] = [jurisdictionScope(caller)];

    if (filters.overdue === true)
        clauses.push({ status: { $in: OPEN_STATUSES }, dueAt: { $lt: now } });

    if (filters.assignee === 'none') clauses.push({ assigneeId: { $exists: false } });
    else if (filters.assignee !== undefined) {
        const who = filters.assignee === 'me' ? caller.id : filters.assignee;
        // `me` for a caller with no account (an API key), or an id that is not one, matches nothing.
        clauses.push(
            isObjectIdString(who) ? { assigneeId: toObjectId(who) } : { _id: { $in: [] } }
        );
    }

    return {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        $and: clauses
    };
};

/**
 * Search tasks by status, kind, source, assignee, overdue, email fragment or free text,
 * paginated — inside the caller's jurisdiction. Rows are list items: a message preview, no notes.
 *
 * @param filters - the validated filters; `page`/`pageSize` may be strings, which
 *   `normalizePagination` coerces and bounds
 * @param context - the caller. Required: the jurisdiction is theirs.
 */
export const search = (
    filters: TaskFilters,
    context: CallerContext
): Promise<{ items: TaskListItem[]; meta: PaginatedMeta }> => {
    const now = new Date();

    return taskRepository.search(filters, scopeOf(filters, context, now)).then(({ items, meta }) =>
        assigneeNamesOf(items.map((row) => row.assigneeId)).then((names) => {
            const viewer = viewerOf(context.caller, names);
            return {
                items: items.map((row) => presentTaskListItem(withView(row, viewer.of(row), now))),
                meta
            };
        })
    );
};

/**
 * One task by id, inside the caller's jurisdiction, with its notes, its assignee's name and the
 * earlier tasks about the same record. A task outside the jurisdiction is a 404, not a 403: it
 * does not admit to existing.
 *
 * @param id - the task
 * @param context - the caller
 * @returns the task, or the 404 a missing or out-of-jurisdiction one earns
 */
export const getById = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<Task> | ResponseReject> =>
    taskRepository.findById(id).then((task) => {
        if (!task || !inJurisdiction(context.caller, task))
            return generateReject(404, [t('generic.error-item-gone')]);

        return Promise.all([
            assigneeNamesOf([task.assigneeId?.toString()]),
            task.link ? earlierThan(task, context) : Promise.resolve([])
        ]).then(([names, earlierTasks]) =>
            generateSuccess(
                presentTask(task, {
                    ...viewerOf(context.caller, names).of(task),
                    earlierTasks
                })
            )
        );
    });

/**
 * The tasks about the same record that came before this one, newest first, inside the caller's
 * jurisdiction.
 *
 * @param task - the task being read
 * @param context - the caller
 */
const earlierThan = (task: TaskDocument, context: CallerContext) =>
    taskRepository
        .findAll(
            {
                'link.type': task.link?.type,
                'link.id': task.link?.id,
                _id: { $ne: task._id },
                createdAt: { $lte: task.createdAt },
                ...jurisdictionScope(context.caller)
            },
            { sort: { createdAt: -1 }, limit: 20 }
        )
        .then((rows) =>
            rows.map((row) => ({
                id: String(row._id),
                kind: row.kind,
                status: row.status,
                createdAt: (row.createdAt ?? new Date(0)).toISOString()
            }))
        );
