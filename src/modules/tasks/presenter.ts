/**
 * @module
 * The one place a task becomes the wire shape `openapi.yaml` declares: the stored fields, plus
 * what is computed per reader or per read (`overdue`, `actions`, the assignee's name, the earlier
 * tasks). Shared by the staff reads and every door.
 */

import type { Task, TaskListItem, TaskRef } from '@types';
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

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform and drops the dedup
 * key; the document is typed as stored, not as the wire shape, so one cast narrows it.
 *
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

/** The longest `messagePreview`, in characters: enough to triage a message, not to read it. */
const PREVIEW_LENGTH = 160;

/**
 * The message cut for the inbox: whole user-perceived characters (never half a surrogate pair or a
 * composed emoji), the last of them `…` when anything was cut.
 * https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
 *
 * @param message - the whole message
 */
const previewOf = (message: string): string => {
    const characters = Array.from(new Intl.Segmenter().segment(message), ({ segment }) => segment);
    return characters.length <= PREVIEW_LENGTH
        ? message
        : `${characters.slice(0, PREVIEW_LENGTH - 1).join('')}…`;
};

/**
 * One row of the staff inbox: what the inbox renders and the start of the message. The whole
 * message, the notes and the sender's account are the audited detail read's.
 *
 * @param task - the task with its reader's view, as {@link withView} builds it
 */
export const presentTaskListItem = (task: Task): TaskListItem => ({
    id: task.id,
    source: task.source,
    kind: task.kind,
    ...(task.name === undefined ? {} : { name: task.name }),
    ...(task.email === undefined ? {} : { email: task.email }),
    subject: task.subject,
    messagePreview: previewOf(task.message),
    ...(task.category === undefined ? {} : { category: task.category }),
    ...(task.orderNumber === undefined ? {} : { orderNumber: task.orderNumber }),
    ...(task.assigneeId === undefined ? {} : { assigneeId: task.assigneeId }),
    ...(task.assigneeName === undefined ? {} : { assigneeName: task.assigneeName }),
    ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
    overdue: task.overdue,
    status: task.status,
    ...(task.respondedAt === undefined ? {} : { respondedAt: task.respondedAt }),
    createdAt: task.createdAt,
    actions: task.actions
});
