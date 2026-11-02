/**
 * @module
 * The one place a task becomes the wire shape `openapi.yaml` declares: the stored fields, plus
 * what is computed per reader or per read (`overdue`, `actions`, the assignee's name, the earlier
 * tasks). Shared by the contact form's 201, the staff reads and every door.
 */

import type { Task, TaskRef } from '@types';
import { isOpen, type TaskActionFlags } from './domain';
import type { TaskDocument } from './model';

/** A task as stored and read back: the contract's `Task` before what is computed per reader. */
export type StoredTask = Omit<Task, 'actions' | 'overdue' | 'assigneeName' | 'earlierTasks'>;

/** What a reader adds to a stored task. */
export interface TaskView {
    actions: TaskActionFlags;
    assigneeName?: string;
    earlierTasks?: TaskRef[];
}

/** The view of a reader who may do nothing — the visitor's own 201. */
export const NO_ACTIONS: TaskView = {
    actions: {
        resolve: false,
        markSpam: false,
        reopen: false,
        assign: false,
        unassign: false,
        note: false,
        delete: false
    }
};

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform and drops the dedup
 * key; the document is typed as stored, not as the wire shape, so one cast narrows it.
 *
 * @param document - the stored task
 */
export const storedTaskOf = (document: TaskDocument): StoredTask => document.toJSON() as StoredTask;

/**
 * A stored task with the reader's view added. `overdue` is read-time arithmetic: open and past
 * `dueAt`, so no sweep has to keep it true.
 *
 * @param stored - the task on the wire, before the view
 * @param view - what this reader may do, and the names looked up for them
 * @param now - the clock
 */
export const withView = (stored: StoredTask, view: TaskView, now = new Date()): Task => ({
    ...stored,
    overdue:
        isOpen(stored.status) &&
        stored.dueAt !== undefined &&
        Date.parse(stored.dueAt) < now.getTime(),
    actions: view.actions,
    ...(view.assigneeName === undefined ? {} : { assigneeName: view.assigneeName }),
    ...(view.earlierTasks === undefined ? {} : { earlierTasks: view.earlierTasks })
});

/**
 * {@link storedTaskOf} then {@link withView}.
 *
 * @param document - the stored task
 * @param view - the reader's view
 */
export const presentTask = (document: TaskDocument, view: TaskView): Task =>
    withView(storedTaskOf(document), view);
