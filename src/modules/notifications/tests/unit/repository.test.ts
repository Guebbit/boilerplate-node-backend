/**
 * @module
 * `notificationRepository` — a malformed id reaches the caller as a rejection, never a synchronous
 * throw: `toObjectId` runs inside an `async` method, and a promise chain at the call site only sees
 * the first. Nothing here touches a database; the id is refused before a query is built.
 */

import { mongo } from 'mongoose';
import { notificationRepository } from '@modules/notifications/repository';

describe('a malformed user id', () => {
    it('rejects deleteByUserId instead of throwing', async () => {
        await expect(notificationRepository.deleteByUserId('bad')).rejects.toBeInstanceOf(
            mongo.BSON.BSONError
        );
    });

    it('rejects deleteByAudience instead of throwing', async () => {
        await expect(notificationRepository.deleteByAudience('bad', 'own')).rejects.toBeInstanceOf(
            mongo.BSON.BSONError
        );
    });
});
