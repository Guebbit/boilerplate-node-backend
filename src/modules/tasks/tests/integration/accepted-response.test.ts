/**
 * @module
 * `POST /tasks` answers 202 with no body at all: no JSON content type, no bytes. Run through the
 * real route so the idempotency ledger's capture and replay are part of what is asserted.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { findAllTasks } from '../factories';

setupTestDb();

/** A valid contact message. */
const CONTACT_PAYLOAD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The checkout button does nothing on mobile.'
};

/** The same keyed submission, sent again. */
const send = () =>
    api().post('/tasks').set('Idempotency-Key', 'contact-key-1').send(CONTACT_PAYLOAD);

describe('POST /tasks 202', () => {
    it('carries no content-type header and an empty body', async () => {
        const response = await api().post('/tasks').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(202);
        expect(response.headers).not.toHaveProperty('content-type');
        expect(response.text).toBe('');
    });

    it('replays a repeated idempotent request the same way, without filing a second task', async () => {
        const first = await send();
        // The ledger write is fire-and-forget; poll until the replay header shows up.
        let replay = await send();
        for (let attempt = 0; attempt < 20 && replay.status === 409; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            replay = await send();
        }

        expect(first.status).toBe(202);
        expect(replay.status).toBe(202);
        expect(replay.headers['idempotent-replayed']).toBe('true');
        expect(replay.headers).not.toHaveProperty('content-type');
        expect(replay.text).toBe('');
        expect(await findAllTasks()).toHaveLength(1);
    });
});
