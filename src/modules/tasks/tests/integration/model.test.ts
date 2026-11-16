/**
 * @module
 * Tasks must never leak
 * `_id`/`__v`, on either response path — a real document (`toJSON`) or a `.lean()`
 * list result (mapped manually via `applyTaskTransform`).
 */
import { asStub } from '@tests/stub';
import { callerContextAs } from '@tests/callers';
import { setupTestDb } from '@tests/setup-test-db';
import { taskRepository } from '@modules/tasks/repository';
import { taskModel } from '@modules/tasks/model';
import { taskService } from '@modules/tasks/services';

setupTestDb();

/** A task through the repository, with valid required fields. */
const createTask = () =>
    taskRepository.create({
        email: 'reporter@example.com',
        subject: 'Something broke',
        message: 'Details about what broke.'
    });

describe('retention clocks', () => {
    it('ages a visitor message from its arrival, and nothing else from there', async () => {
        const all = await taskModel.collection.indexes();
        const indexes = all.filter((index) => index.expireAfterSeconds !== undefined);

        expect(indexes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: { createdAt: 1 },
                    partialFilterExpression: { source: 'visitor' }
                }),
                expect.objectContaining({ key: { closedAt: 1 } })
            ])
        );
    });
});

describe('task serialization', () => {
    it('normalizes a hydrated document via toJSON', async () => {
        const task = await createTask();
        const json = task.toJSON() as Record<string, unknown>;

        expect(json.id).toBe(task._id.toString());
        expect(JSON.stringify(json)).not.toContain('_id');
        expect(JSON.stringify(json)).not.toContain('__v');
    });

    it('normalizes a lean list via taskService.search', async () => {
        await createTask();
        const { items } = await taskService.search({}, callerContextAs('admin'));

        expect(items).toHaveLength(1);
        const item = asStub<Record<string, unknown>>(items[0]);
        expect(item.id).toMatch(/^[\da-f]{24}$/);
        expect(item._id).toBeUndefined();
        expect(item.__v).toBeUndefined();
    });
});
