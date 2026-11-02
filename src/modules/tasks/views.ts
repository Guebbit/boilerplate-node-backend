/**
 * @module
 * What a reader adds to a stored task: the assignee's name (one lookup per page, not per row) and
 * the `actions` their standing allows. The caller's standing is resolved once, so a page of rows
 * costs one ability, not one per row.
 */

import type { Caller } from '@types';
import { userService } from '@modules/users';
import { actionsOf } from './domain';
import { mayDelete, mayWork } from './access';
import type { TaskView } from './presenter';
import type { TaskStatus, TaskSource } from '@types';

/** The facts of a task a viewer reads, whether stored as a document or on the wire. */
export interface Viewable {
    source: TaskSource;
    routeSet: string;
    status: TaskStatus;
    assigneeId?: string | { toString(): string };
}

/**
 * The usernames of some assignees, in one query.
 *
 * @param ids - assignee ids; absent ones are skipped
 * @returns a map from id to username; an id with no account is simply missing
 */
export const assigneeNamesOf = (
    ids: readonly (string | { toString(): string } | undefined)[]
): Promise<Map<string, string>> => {
    const wanted = [...new Set(ids.filter((id) => id !== undefined).map(String))];
    if (wanted.length === 0) return Promise.resolve(new Map<string, string>());

    return userService
        .search({ id: wanted, pageSize: wanted.length })
        .then(
            ({ items }) =>
                new Map<string, string>(
                    items.map((user): [string, string] => [user.id, user.username])
                )
        );
};

/**
 * A reader's view of tasks, with their standing resolved once.
 *
 * @param caller - the reader, in tenant scope
 * @param names - assignee usernames from {@link assigneeNamesOf}
 */
export const viewerOf = (
    caller: Caller,
    names: ReadonlyMap<string, string>
): { of: (task: Viewable) => TaskView } => ({
    of: (task) => {
        const assignee = task.assigneeId === undefined ? undefined : String(task.assigneeId);
        const assigneeName = assignee === undefined ? undefined : names.get(assignee);

        return {
            actions: actionsOf({
                status: task.status,
                mayWork: mayWork(caller, task),
                mayDelete: mayDelete(caller, task),
                assigned: assignee !== undefined
            }),
            ...(assigneeName === undefined ? {} : { assigneeName })
        };
    }
});
