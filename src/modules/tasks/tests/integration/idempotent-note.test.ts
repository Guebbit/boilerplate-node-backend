/**
 * @module
 * `POST /tasks/{id}/notes` with an `Idempotency-Key`: a task note has no delete door, so a retry
 * after a lost answer must replay the first answer, never append the note twice.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { sendTwice } from '@tests/replay';
import { taskModel } from '../../model';
import { createSystemTask } from '../factories';

setupTestDb();

/** Staff add `body` to the task's thread under `key`. */
const note = (taskId: string, bearer: string, key: string, body: string) =>
    api()
        .post(`/tasks/${taskId}/notes`)
        .set('Authorization', bearer)
        .set('Idempotency-Key', key)
        .send({ body });

/** The bodies of the task's thread, in order. */
const threadOf = (taskId: string): Promise<string[]> =>
    taskModel
        .findById(taskId)
        .lean()
        .exec()
        .then((task) => (task?.notes ?? []).map(({ body }) => body));

describe('POST /tasks/{id}/notes with an Idempotency-Key', () => {
    it('appends one note and replays its answer to a retry', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const taskId = await createSystemTask().then((task) => String(task._id));

        const { first, retry } = await sendTwice(() =>
            note(taskId, bearer, 'task-note-1', 'Called back.')
        );

        expect(first.status).toBe(200);
        expect(retry.status).toBe(200);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        expect(retry.body).toEqual(first.body);
        expect(await threadOf(taskId)).toEqual(['Called back.']);
    });

    it('appends another note for a new key: two clicks make two', async () => {
        const { bearer } = await authenticateAsRole('admin');
        const taskId = await createSystemTask().then((task) => String(task._id));

        await sendTwice(() => note(taskId, bearer, 'task-note-1', 'Called back.'));
        await note(taskId, bearer, 'task-note-2', 'Called back.');

        expect(await threadOf(taskId)).toEqual(['Called back.', 'Called back.']);
    });
});
