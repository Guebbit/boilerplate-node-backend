/**
 * @module
 * The `notifications` schema's contract — the declarations, not the documents. `code` and
 * `severity` are closed sets, and the one compound index serves both the inbox read and the cap's
 * trim, so a dropped enum or a flipped direction changes no valid fixture.
 */
import { NOTIFICATION_CODES, notificationSchema } from '@modules/notifications/model';
import { NotificationSeverity } from '@types';
import { defaultOf, enumOf, indexSpecs, optionsOf, refOf, requiredPaths } from '@tests/schema';

describe('notificationSchema', () => {
    it('requires the owner, the code and the severity', () => {
        expect(requiredPaths(notificationSchema)).toEqual(['code', 'severity', 'userId']);
    });

    it('leaves readAt absent until the inbox is opened on it', () => {
        // A default here would mark every new notification as already read.
        expect(requiredPaths(notificationSchema)).not.toContain('readAt');
        expect(defaultOf(notificationSchema, 'readAt')).toBeUndefined();
    });

    it('restricts code and severity to their closed sets', () => {
        expect(enumOf(notificationSchema, 'code')).toEqual([...NOTIFICATION_CODES]);
        expect(enumOf(notificationSchema, 'severity')).toEqual(Object.values(NotificationSeverity));
    });

    it('starts params empty, since its shape depends on the code', () => {
        expect(defaultOf(notificationSchema, 'params')).toEqual({});
    });

    it('points the owner at users', () => {
        expect(refOf(notificationSchema, 'userId')).toBe('User');
    });

    it('declares the inbox index newest first, and nothing else', () => {
        // The same order serves the inbox read and, from the far end, the cap's trim.
        expect(indexSpecs(notificationSchema)).toEqual([
            'userId_1_createdAt_-1: userId+1, createdAt-1'
        ]);
    });

    it('stamps creation only: a row is written once', () => {
        expect(optionsOf(notificationSchema).timestamps).toEqual({
            createdAt: true,
            updatedAt: false
        });
    });
});
