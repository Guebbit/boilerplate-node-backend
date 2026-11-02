/**
 * @module
 * A task's lifecycle. `status` is read-only on the wire: it moves only through three doors
 * (`resolve`, `mark-spam`, `reopen`) and through assignment (`new` <-> `in_progress`). Each door
 * here is a pure function from the task's facts to the write it owes, or to the refusal.
 *
 *   open   = new | in_progress     closed = resolved | spam
 *
 * Closing stamps `closedAt` (the retention clock), `resolution` and unsets `openKey` (the dedup
 * key). Reopening undoes all three. `dueAt` is NOT touched by any door: the clock belongs to the
 * situation (an FTC deadline does not restart because staff reopened), not to the reopen.
 */

import { TaskStatus } from '@types';

/** The facts a transition reads. */
export interface TaskFacts {
    status: TaskStatus;
    closedAt?: Date;
    respondedAt?: Date;
    assigned: boolean;
    openKey?: string;
    kind: string;
    link?: { type: string; id: string };
}

/** The write a transition owes: fields to set, fields to unset. */
export interface TaskPatch {
    set: Record<string, unknown>;
    unset: string[];
}

/** Why a door refused. */
export type TaskRefusal = 'already_resolved' | 'already_spam' | 'already_open';

/** A door's answer. */
export type Transition = { patch: TaskPatch } | { refusal: TaskRefusal };

/** The statuses that still owe work. */
export const OPEN_STATUSES: readonly TaskStatus[] = [TaskStatus.new, TaskStatus.in_progress];

/**
 * Whether a status is one that still owes work.
 *
 * @param status - the task's status
 */
export const isOpen = (status: TaskStatus): boolean => OPEN_STATUSES.includes(status);

/**
 * The dedup key of an open system task: one open task per kind and record. A visitor message
 * has none (two people may ask the same thing).
 *
 * @param kind - the task's kind
 * @param link - the record the task is about
 */
export const openKeyOf = (kind: string, link: { type: string; id: string }): string =>
    `${kind}:${link.type}:${link.id}`;

/** The status a freshly filed task starts at: `spam` is closed at birth. */
export const initialTaskStatus = (suspectedSpam: boolean): TaskStatus =>
    suspectedSpam ? TaskStatus.spam : TaskStatus.new;

/**
 * Staff resolve a task: from `new`, `in_progress` or `spam`. `closedAt` is kept when the task
 * was already closed (spam to resolved), `respondedAt` stamps once.
 *
 * @param task - its facts
 * @param now - the clock
 */
export const resolve = (task: TaskFacts, now: Date): Transition =>
    task.status === TaskStatus.resolved
        ? { refusal: 'already_resolved' }
        : {
              patch: {
                  set: {
                      status: TaskStatus.resolved,
                      resolution: 'staff',
                      closedAt: task.closedAt ?? now,
                      respondedAt: task.respondedAt ?? now
                  },
                  unset: ['openKey']
              }
          };

/**
 * Staff mark a task as spam: from `new`, `in_progress` or `resolved`. Same stamps as a
 * resolve, with `resolution: spam` and no `respondedAt`.
 *
 * @param task - its facts
 * @param now - the clock
 */
export const markSpam = (task: TaskFacts, now: Date): Transition =>
    task.status === TaskStatus.spam
        ? { refusal: 'already_spam' }
        : {
              patch: {
                  set: {
                      status: TaskStatus.spam,
                      resolution: 'spam',
                      closedAt: task.closedAt ?? now
                  },
                  unset: ['openKey']
              }
          };

/**
 * Staff reopen a closed task: to `in_progress` when it has an assignee, else `new`. Unsets
 * `closedAt` (so the retention clock stops) and `resolution`, and restores the dedup key of a
 * linked task.
 *
 * @param task - its facts
 */
export const reopen = (task: TaskFacts): Transition =>
    isOpen(task.status)
        ? { refusal: 'already_open' }
        : {
              patch: {
                  set: {
                      status: task.assigned ? TaskStatus.in_progress : TaskStatus.new,
                      ...(task.link ? { openKey: openKeyOf(task.kind, task.link) } : {})
                  },
                  unset: ['closedAt', 'resolution']
              }
          };

/**
 * The system closes a task because the situation it was opened for ended: `resolved`, with
 * `resolution: cleared` so "the system closed it" shows. The caller applies it only to a task
 * that is still open, so a task staff closed first is never touched; notes are kept.
 *
 * @param now - the clock
 */
export const clear = (now: Date): TaskPatch => ({
    set: { status: TaskStatus.resolved, resolution: 'cleared', closedAt: now },
    unset: ['openKey']
});
