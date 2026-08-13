/**
 * `src/infrastructure/observability/analytics-events.ts` — the event names both repos emit.
 *
 * WHY IT IS FRAGMENTED. `PRODUCTS_SEARCHED` is a fact about the products domain and
 * `CART_ITEM_ADDED` one about the cart, and both used to be declared in the substrate — the layer
 * that must know no domain at all. Each module now owns its own names, so deleting a module takes
 * its events out of the funnel with it, and `src/infrastructure/` is left holding the transport.
 *
 * WHO OWNS WHAT follows one rule: a name lives with the code that EMITS it. `CHECKOUT_*` sits with
 * `cart` because `POST /cart/checkout` is what reports it — delete that module and the two outcomes
 * leave the funnel with the endpoint that produced them, which is the property the whole split
 * exists for. The frontend emits the same two names from its orders store and applies the same
 * rule to its own code; that is why ownership is a per-repo mapping while the ORDER below, which
 * decides the bytes, is shared.
 *
 * THE COMMA IS THE JOIN, not part of any fragment. The entries are an object literal, so exactly
 * one comma belongs between two module slices and none after the last — a property of the list and
 * not of the module that happens to be last in it. Fragments therefore end on their final entry
 * with no comma, and `SECTION_SEPARATOR` supplies both the comma and the blank line that has always
 * separated the groups. Prettier's `trailingComma: 'none'` is what makes this load-bearing: leave a
 * dangling comma in and `prettier:check` fails the build.
 */

import path from 'node:path';
import { REPO_ROOT, type IContractBundle, type TSegment } from './fragments';

/** The order the groups appear in — auth first, then the path a user walks through the shop. */
export const ANALYTICS_SECTION_ORDER = [
    'account',
    'products',
    'cart',
    'wishlist',
    'orders'
] as const;

export type TAnalyticsSectionName = (typeof ANALYTICS_SECTION_ORDER)[number];

/** Comma, blank line: what goes BETWEEN two groups of entries and after none of them. */
const SECTION_SEPARATOR = ',\n\n';

/** Where a module's slice of the event names lives. */
export const analyticsFragment = (section: TAnalyticsSectionName): string =>
    path.join(REPO_ROOT, 'src', 'modules', section, 'analytics.fragment.ts');

/** The prose, and the opening of the object literal. */
const HEADER_FRAGMENT = path.join(
    REPO_ROOT,
    'shared',
    'contracts',
    'analytics-events.header.fragment.ts'
);

/** The closing of the object literal, and the union type over its values. */
const FOOTER_FRAGMENT = path.join(
    REPO_ROOT,
    'shared',
    'contracts',
    'analytics-events.footer.fragment.ts'
);

export const analyticsEventsBundle: IContractBundle = {
    name: 'analytics-events',
    label: 'src/infrastructure/observability/analytics-events.ts',
    output: path.join(REPO_ROOT, 'src', 'infrastructure', 'observability', 'analytics-events.ts'),
    segments: (): TSegment[] => [
        HEADER_FRAGMENT,
        {
            parts: ANALYTICS_SECTION_ORDER.map((section) => analyticsFragment(section)),
            separator: SECTION_SEPARATOR
        },
        FOOTER_FRAGMENT
    ]
};
