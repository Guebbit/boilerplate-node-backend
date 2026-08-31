/**
 * @module
 * The key rules — everything that decides whether a translation key can be stored and rendered.
 * Internal to `services/`; `entries.ts` and `messages.ts` share these and none of them owns it.
 * Pure and database-free by construction — an i18n admin has no rules worth a separate `domain/`
 * folder.
 */

import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import type { EntryInput } from '../repository';

/**
 * Key segments that must never reach a tree.
 *
 * `__proto__` written onto a plain object mutates its PROTOTYPE rather than creating a property —
 * prototype pollution reached through a translation key. {@link buildMessageTree} already builds
 * from null-prototype objects so it cannot happen there, but a key nobody can render is not worth
 * storing either. An empty segment (`a..b`, `a.`) is in the same bucket: it names a node no client
 * could address.
 */
const UNSAFE_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/** Narrows to an ordinary object node — excludes arrays and `null`, which `typeof` alone would not. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Flat dotted rows into the nested shape `GET /locales/{locale}` already serves.
 *
 * THROWS on a collision (`products.list` and `products.list.title` both existing) rather than
 * picking one silently — every write path already refuses such a pair (see
 * {@link findKeyCollision}), so reaching this throw means an invariant broke behind the API's
 * back; `tests/unit/service.test.ts` asserts it.
 *
 * Nodes are null-prototype objects, so a stored `__proto__` segment creates an ordinary property
 * instead of reassigning a prototype.
 */
export const buildMessageTree = (
    entries: readonly Pick<EntryInput, 'key' | 'value'>[]
): Record<string, unknown> => {
    const tree = Object.create(null) as Record<string, unknown>;

    for (const { key, value } of entries) {
        const segments = key.split('.');
        let node = tree;

        for (const [index, segment] of segments.entries()) {
            if (index === segments.length - 1) {
                if (isPlainObject(node[segment]))
                    throw new Error(
                        `locale key "${key}" is both a string and a group; ` +
                            `one of the two must be renamed`
                    );
                node[segment] = value;
                continue;
            }

            if (node[segment] === undefined) node[segment] = Object.create(null) as unknown;
            else if (!isPlainObject(node[segment]))
                throw new Error(
                    `locale key "${key}" needs "${segments.slice(0, index + 1).join('.')}" ` +
                        `to be a group, but it is already a string`
                );

            node = node[segment] as Record<string, unknown>;
        }
    }

    return tree;
};

/** The offending segment of a key no tree could address, or `undefined` when it is fine. */
export const findUnsafeKeySegment = (key: string): string | undefined =>
    key.split('.').find((segment) => segment.length === 0 || UNSAFE_KEY_SEGMENTS.has(segment));

/**
 * A key from `others` that cannot coexist with `key` in one tree, if there is one.
 *
 * "Cannot coexist" is exactly one relation: either is a strict dotted prefix of the other. An
 * identical key is NOT a collision — it is a duplicate, which is a different answer to the caller
 * and a different message.
 */
export const findKeyCollision = (key: string, others: Iterable<string>): string | undefined => {
    for (const other of others) {
        if (other === key) continue;
        if (other.startsWith(`${key}.`) || key.startsWith(`${other}.`)) return other;
    }
    return undefined;
};

/** The first pair of keys within one batch that cannot coexist. */
export const findBatchCollision = (keys: readonly string[]): [string, string] | undefined => {
    const seen = new Set<string>();

    for (const key of keys) {
        const collision = findKeyCollision(key, seen);
        if (collision) return [key, collision];
        seen.add(key);
    }

    return undefined;
};

/** The first key a batch names twice. */
export const findDuplicateKey = (keys: readonly string[]): string | undefined => {
    const seen = new Set<string>();

    for (const key of keys) {
        if (seen.has(key)) return key;
        seen.add(key);
    }

    return undefined;
};

/**
 * The checks every key has to pass before it can be stored, in the order their answers differ.
 *
 * `others` is what the key will have to live alongside once written — for a create that is
 * everything already stored, for a bulk replace it is only the rest of the batch.
 *
 * Does NOT check that the key is one anything renders — entries may add keys a dictionary never
 * defined (by design), or belong to a frontend tenant's own keyspace this API cannot see (by
 * necessity). A typo saves cleanly and renders nowhere; the checks below guard against actual
 * damage instead: an unstorable key, and one that collides with a key already stored.
 */
export const rejectUnusableKey = (
    key: string,
    others: Iterable<string>
): ResponseReject | undefined => {
    const unsafe = findUnsafeKeySegment(key);
    if (unsafe !== undefined) return generateReject(422, [t('locales.error-key-invalid', { key })]);

    const collision = findKeyCollision(key, others);
    if (collision !== undefined)
        return generateReject(409, [
            t('locales.error-key-collision', { key, existing: collision })
        ]);

    return undefined;
};
