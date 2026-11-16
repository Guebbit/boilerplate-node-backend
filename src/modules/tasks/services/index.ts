/**
 * @module
 * Task service — assembled from one file per use case: the contact form (`./contact`), the staff
 * reads (`./read`) and delete (`./remove`), the two `personalData` halves (`./personal-data`), the
 * reminder sweeps (`./overdue`), system tasks (`./system`) and the doors that move a task
 * (`./workflow`). The rules they apply are in `../domain`.
 *
 * @see docs/modules/tasks.md#its-neighbourhood
 */

import { create, mailMainMailbox } from './contact';
import { search, getById } from './read';
import { removeById } from './remove';
import {
    findOwnTasks,
    findOwnTasksForExport,
    findSystemTasksForExport,
    eraseOwnTasks
} from './personal-data';
import { workflow } from './workflow';
import { remindDueSoon, remindOverdue } from './overdue';
import { clearSystemTasks, openSystemTask } from './system';

/** The module's barrel export — used by the controllers in `./controllers`. */
export const taskService = {
    create,
    mailMainMailbox,
    remindOverdue,
    remindDueSoon,
    openSystemTask,
    clearSystemTasks,
    search,
    getById,
    removeById,
    ...workflow,
    findOwnTasks,
    findOwnTasksForExport,
    findSystemTasksForExport,
    eraseOwnTasks
};
