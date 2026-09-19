/**
 * The 51-key rename plus the 12 per-family `manage` deletions, moving every permission key to
 * the standard `<family>.<breadth>.<action>` grammar.
 * Every stored `roles` document (a shop's own edit, not only the presets) still spells its
 * `permissions` in the old shape and has to move to `<family>.<breadth>.<action>` in the same
 * change as the code, or a shop that edited its roles is silently left holding keys nothing
 * declares any more.
 *
 * Two kinds of entry, both handled:
 *
 *   - a straight RENAME (`orders.read` → `orders.self.read`) — one element for one element,
 *     breadth inserted, condition unchanged;
 *   - a `manage` key EXPANSION — the wildcard used to reach every concrete action its family
 *     declared AT THE TIME. Replaced by exactly those actions, spelled `any`, so a role's
 *     effective capability is unchanged. `inventory.manage` is the one exception: it expands to
 *     `inventory.any.read` and `inventory.any.create` only, never `inventory.any.sweep` — that
 *     action did not exist when `manage` was granted, and the sweep route stays reachable
 *     through nobody's concrete grant but the scope wildcard (`all.manage`).
 *
 * `all.manage` / `platform.all.manage` — the SCOPE wildcards — are untouched: they are not
 * declared keys and never appear in the map below.
 *
 * Idempotent: a document whose `permissions` names none of the old keys is left alone, and
 * re-running after the first pass finds nothing left to rewrite.
 */
import type { Db } from 'mongodb';

/** The one field this migration reads and rewrites, on the collection's real document shape. */
interface RoleDocument {
    permissions: string[];
}

/** A straight rename: one old key becomes one new key, same capability. */
const RENAMES = new Map<string, string>([
    ['products.read', 'products.self.read'],
    ['products.create', 'products.any.create'],
    ['products.update', 'products.any.update'],
    ['products.delete', 'products.any.delete'],
    ['cart.checkout', 'cart.self.checkout'],
    ['orders.read', 'orders.self.read'],
    ['orders.create', 'orders.any.create'],
    ['orders.update', 'orders.any.update'],
    ['orders.delete', 'orders.any.delete'],
    ['payments.read', 'payments.self.read'],
    ['payments.create', 'payments.any.create'],
    ['payments.update', 'payments.any.update'],
    ['inventory.read', 'inventory.any.read'],
    ['inventory.create', 'inventory.any.create'],
    ['delivery.read', 'delivery.any.read'],
    ['delivery.update', 'delivery.any.update'],
    ['feedback.read', 'feedback.any.read'],
    ['feedback.update', 'feedback.any.update'],
    ['feedback.delete', 'feedback.any.delete'],
    ['locales.read', 'locales.self.read'],
    ['locales.create', 'locales.any.create'],
    ['locales.update', 'locales.any.update'],
    ['locales.delete', 'locales.any.delete'],
    ['translations.read', 'translations.any.read'],
    ['translations.update', 'translations.any.update'],
    ['users.read', 'users.any.read'],
    ['users.create', 'users.any.create'],
    ['users.update', 'users.any.update'],
    ['users.delete', 'users.any.delete'],
    ['tokens.delete', 'tokens.any.delete'],
    ['audit.read', 'audit.any.read'],
    ['webhooks.read', 'webhooks.any.read'],
    ['webhooks.create', 'webhooks.any.create'],
    ['webhooks.update', 'webhooks.any.update'],
    ['webhooks.delete', 'webhooks.any.delete'],
    ['apikeys.read', 'apikeys.any.read'],
    ['apikeys.create', 'apikeys.any.create'],
    ['apikeys.delete', 'apikeys.any.delete'],
    ['platform.observability.read', 'platform.observability.any.read']
]);

/** A deleted `manage` key: the exact concrete keys it used to expand to, spelled `any`. */
const MANAGE_EXPANSIONS = new Map<string, readonly string[]>([
    [
        'products.manage',
        ['products.any.read', 'products.any.create', 'products.any.update', 'products.any.delete']
    ],
    [
        'orders.manage',
        ['orders.any.read', 'orders.any.create', 'orders.any.update', 'orders.any.delete']
    ],
    ['payments.manage', ['payments.any.read', 'payments.any.create', 'payments.any.update']],
    // Not `inventory.any.sweep` — see the module doc comment above.
    ['inventory.manage', ['inventory.any.read', 'inventory.any.create']],
    ['delivery.manage', ['delivery.any.read', 'delivery.any.update']],
    ['feedback.manage', ['feedback.any.read', 'feedback.any.update', 'feedback.any.delete']],
    [
        'locales.manage',
        ['locales.any.read', 'locales.any.create', 'locales.any.update', 'locales.any.delete']
    ],
    ['translations.manage', ['translations.any.read', 'translations.any.update']],
    [
        'users.manage',
        ['users.any.read', 'users.any.create', 'users.any.update', 'users.any.delete']
    ],
    [
        'webhooks.manage',
        ['webhooks.any.read', 'webhooks.any.create', 'webhooks.any.update', 'webhooks.any.delete']
    ],
    ['apikeys.manage', ['apikeys.any.read', 'apikeys.any.create', 'apikeys.any.delete']],
    ['platform.observability.manage', ['platform.observability.any.read']]
]);

/** Every old spelling this migration knows how to move off of. */
const OLD_KEYS = [...RENAMES.keys(), ...MANAGE_EXPANSIONS.keys()];

/**
 * One document's `permissions`, moved to the new spelling.
 *
 * A `Set` because a role may already hold, say, both `products.manage` and a since-added
 * `products.any.read` — the expansion must not duplicate what a role already states explicitly.
 */
const migrate = (permissions: readonly string[]): string[] => {
    const next = new Set<string>();

    for (const key of permissions) {
        const expansion = MANAGE_EXPANSIONS.get(key);

        if (expansion) {
            for (const concrete of expansion) {
                next.add(concrete);
            }
            continue;
        }

        next.add(RENAMES.get(key) ?? key);
    }

    return [...next];
};

export const up = async (database: Db): Promise<void> => {
    const roles = database.collection<RoleDocument>('roles');
    const stale = await roles.find({ permissions: { $in: OLD_KEYS } }).toArray();

    if (stale.length === 0) {
        return;
    }

    await roles.bulkWrite(
        stale.map((role) => ({
            updateOne: {
                filter: { _id: role._id },
                update: { $set: { permissions: migrate(role.permissions) } }
            }
        }))
    );
};
