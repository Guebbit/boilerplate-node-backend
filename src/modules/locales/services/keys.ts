/**
 * The key rules — everything that decides whether a translation key can be stored and rendered.
 *
 * Internal to `services/`; `entries.ts` and `messages.ts` share these and none of them owns it.
 * Pure and database-free by construction: `locales` is `subdomain: 'generic'`, so
 * `subdomain-discipline.test.ts` forbids a `domain/` here and this file is the sanctioned home.
 */

import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import type { EntryInput } from '../repository';

/**
 * Key segments that must never reach a tree.
 *
 * `__proto__` assigned onto a plain object mutates its PROTOTYPE rather than creating a property,
 * which is prototype pollution reached through a translation key. {@link buildMessageTree} is built
 * from null-prototype objects so it cannot happen there either, but a key nobody can render is not
 * worth storing — this is the half that answers with a reason instead of silently doing nothing.
 *
 * An empty segment (`a..b`, `a.`) is in the same bucket: it names a node no client could address.
 */
const UNSAFE_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Flat dotted rows into the nested shape `GET /locales/{locale}` already serves.
 *
 * THROWS on a collision rather than dropping a key, and that is the point. If both `products.list`
 * and `products.list.title` exist, no tree can hold them — one is a string, the other needs to be
 * an object at the same path — and a builder that quietly picked one would make the outcome depend
 * on insertion order. Every write path refuses such a pair (see {@link findKeyCollision}), so
 * reaching this throw means an invariant was broken behind the API's back; answering 500 is the
 * honest report of that, and `tests/unit/service.test.ts` asserts the throw exists.
 *
 * Nodes are null-prototype objects, so a stored `__proto__` segment creates an ordinary property
 * instead of reassigning a prototype. `JSON.stringify` treats them exactly like plain objects.
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
 * ## What is NOT checked, and cannot be
 *
 * That the key is one anything actually renders. A row may name a key no dictionary defines, and
 * that is deliberate on both counts:
 *
 *   By DESIGN, because entries add keys as well as override them — a page's copy can be written
 *   entirely in the database, which is the point of letting someone maintain a site without
 *   touching a JSON file.
 *
 *   By NECESSITY for a frontend tenant's rows, because their keyspace belongs to that client and
 *   lives in another repository. This API has never seen `navigation.label-home` and has no way to learn
 *   it. Only a client holding its own dictionaries can say whether a key is one it uses, so if
 *   that warning is ever wanted it belongs in the admin screen, not here.
 *
 * The cost is small and worth naming: a typo — `prodcuts.list.titel` — saves cleanly and then
 * renders nowhere. Nothing is broken and nothing is overwritten; a key simply does nothing, and
 * whoever typed it has to notice. The checks below are the ones where the alternative IS damage:
 * a key no tree can hold, and a key that would collide with one already stored.
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
