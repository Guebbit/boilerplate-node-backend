/**
 * @module
 * The user record: admin-facing search, read, write and soft delete. Depends on nothing —
 * deleting an account empties that user's cart via `user.deleted`, keeping cart → users a
 * one-way arrow. Authentication lives in `account`, which reaches this module's barrel for the
 * record it authenticates.
 *
 * Not in the import graph: `account` writes this same document — the shared kernel.
 *
 * See: docs/modules/users.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import type { ExportSession } from '@types';
import { router } from './routes';
import { userRepository } from './repository';
import { userService } from './service';
import { isLiveRefreshSession, type Token } from './model';
import './events';

/**
 * This caller's own live refresh sessions, metadata only — keeps `type` (a stored `Session`
 * doesn't carry it, since its one filter already fixes it; an export naming every field is worth
 * the one extra key).
 */
const ownSessions = (tokens: Token[]): ExportSession[] =>
    tokens
        .filter((token) => isLiveRefreshSession(token))
        .map((token) => ({
            id: String(token._id),
            type: 'refresh' as const,
            ...(token.expiration ? { expiration: token.expiration.toISOString() } : {}),
            ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt.toISOString() } : {})
        }));

/** This module's manifest entry: routes, locales, and the image writeback target. */
export default {
    name: 'users',
    basePath: '/users',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: ['users.any.read', 'users.any.create', 'users.any.update', 'users.any.delete'],
    routes: router,
    locales: path.join(__dirname, 'locales'),
    /*
     * `account`'s signup and profile-update flows write through this same `userRepository` —
     * there is no separate `users` collection for them to register their own target under.
     */
    imageTargets: { users: { writeback: userRepository.writebackImage } },
    personalData: [
        // `undefined` when the subject's own row is gone — `account`'s assembly answers 404 for
        // this section specifically, since nothing else in the export means anything without it.
        {
            section: 'profile',
            collect: (subject) => userService.findByIdWithCredentials(subject.userId)
        },
        {
            section: 'sessions',
            // `findByIdWithCredentials` again rather than sharing `profile`'s read: each section's
            // `collect` is independent by design (see `kernel/registry.ts`'s own docblock), and a
            // data export is not a hot path worth optimizing a second query out of.
            collect: (subject) =>
                userService
                    .findByIdWithCredentials(subject.userId)
                    .then((user) => (user ? ownSessions(user.tokens) : []))
        }
    ]
} satisfies AppModule;
