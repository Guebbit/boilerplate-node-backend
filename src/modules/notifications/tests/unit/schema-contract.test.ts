/**
 * @module
 * The `notifications` schema's contract — the declarations, not the documents. `code` and
 * `severity` are closed sets, and the one compound index serves both the inbox read and the cap's
 * trim, so a dropped enum or a flipped direction changes no valid fixture.
 */
import { notificationSchema } from '@modules/notifications/model';
import { NotificationSeverity } from '@types';
import { defaultOf, enumOf, indexSpecs, optionsOf, refOf, requiredPaths } from '@tests/schema';

describe('notificationSchema', () => {
    it('requires the owner, the audience, the code and the severity', () => {
        expect(requiredPaths(notificationSchema)).toEqual([
            'audience',
            'code',
            'severity',
            'userId'
        ]);
    });

    it('leaves readAt absent until the inbox is opened on it', () => {
        // A default here would mark every new notification as already read.
        expect(requiredPaths(notificationSchema)).not.toContain('readAt');
        expect(defaultOf(notificationSchema, 'readAt')).toBeUndefined();
    });

    it('restricts severity to its closed set and leaves code open to the module that writes it', () => {
        // No list of codes lives here: the module that adds one owns it, and the writers are typed.
        expect(enumOf(notificationSchema, 'code') ?? []).toEqual([]);
        expect(enumOf(notificationSchema, 'severity')).toEqual(Object.values(NotificationSeverity));
    });

    it('starts params empty, since its shape depends on the code', () => {
        expect(defaultOf(notificationSchema, 'params')).toEqual({});
    });

    it('points the owner at users', () => {
        expect(refOf(notificationSchema, 'userId')).toBe('User');
    });

    it('declares the inbox index newest first, the work notice dedupe key and the TTL', () => {
        // The first serves the inbox read and, from the far end, the cap's trim; the second keeps
        // a redelivered event to one row per recipient; the third lets work notices age out.
        expect(indexSpecs(notificationSchema)).toEqual([
            'expiresAt_1: expiresAt+1',
            'userId_1_createdAt_-1: userId+1, createdAt-1',
            'userId_1_dedupeKey_1: userId+1, dedupeKey+1'
        ]);
    });

    it('treats a message as the owner’s own unless a work notice says otherwise', () => {
        expect(defaultOf(notificationSchema, 'audience')).toBe('own');
        expect(enumOf(notificationSchema, 'audience')).toEqual(['own', 'staff']);
    });

    it('stamps creation only: a row is written once', () => {
        expect(optionsOf(notificationSchema).timestamps).toEqual({
            createdAt: true,
            updatedAt: false
        });
    });
});
