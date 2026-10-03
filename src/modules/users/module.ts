/**
 * @module
 * The user record: admin-facing search, read, write and soft delete. Reads roles through
 * `@modules/access`'s barrel, never writes there directly. Hard-deleting an account runs every
 * module's `personalData.erase` hook (cart, addresses, ...) inside one transaction, keeping
 * those modules' arrows to `users` one-way. Authentication lives in
 * `account`, which reaches this module's barrel for the record it authenticates.
 *
 * Not in the import graph: `account` writes this same document — the shared kernel.
 *
 * See: docs/modules/users.md
 */

import path from 'node:path';
import { resolvePersonalDataErasers, type AppModule } from '@kernel/registry';
import type { ExportSession } from '@types';
import { router } from './routes';
import { userRepository } from './repository';
import { userService } from './services';
import { isLiveRefreshSession, type Token } from './model';
import { setPersonalDataErasers } from './erasure-registry';
import './events';
import { usersConfig } from './config';

/**
 * Resolves every module's `personalData.erase` hook once every module is known, and
 * hands the list to `./services/remove.ts`'s hard-delete path through `./erasure-registry.ts` — the same
 * pattern `account/module.ts`'s `onRegistered` follows for `personalData` export sections.
 *
 * @param modules - every enabled module, for the erase-hook list
 */
const onRegistered = (modules: readonly AppModule[]): void => {
    setPersonalDataErasers(resolvePersonalDataErasers(modules));
};

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
    routes: router,
    onRegistered,
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
    ],
    // The PII encryption key: see `./config`.
    config: [usersConfig.slice]
} satisfies AppModule;
