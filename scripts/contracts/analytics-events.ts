/**
 * Builds `src/infrastructure/observability/analytics-events.frontend.ts` — the event names the
 * paired FRONTEND emits.
 *
 * Both repos write into ONE Umami namespace and every name has exactly one emitter, so only the
 * frontend's half is published: a module's own names are ordinary TypeScript its controllers
 * import, and a published copy would have no reader on either side.
 *
 * Two constraints on the mechanism:
 *
 *   - Each section's body is taken VERBATIM out of its source, because the declarations carry
 *     comments a rebuild-from-values would drop. `assertSliceMatches` compares the extracted names
 *     against the exported ones, so a slice that lost an entry fails the bundle.
 *   - THE COMMA IS THE JOIN. Entries form an object literal and `trailingComma: 'none'` makes a
 *     dangling comma before `}` a `prettier:check` failure.
 *
 * See: docs/api/contract-fragmentation.md#analytics-events-frontend-ts-—-a-name-lives-with-the-code-that-emits-it
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, type CompiledBundle } from './fragments';

import { accountAnalyticsEvents } from '../../src/modules/account/analytics';
import { productsAnalyticsEvents } from '../../src/modules/products/analytics';
import { cartAnalyticsEvents } from '../../src/modules/cart/analytics';
import { wishlistAnalyticsEvents } from '../../src/modules/wishlist/analytics';
import { ordersAnalyticsEvents } from '../../src/modules/orders/analytics';
import { paymentsAnalyticsEvents } from '../../src/modules/payments/analytics';
import { frontendAnalyticsEvents } from '../../shared/contracts/analytics.frontend';

/**
 * Which side emits a section's names — the field the old single catalogue was missing.
 *
 * `backend` names stay here and are imported by the controllers that fire them. `frontend` names
 * are published, and this repo cannot emit them: they are absent from `AnalyticsEventMap`, so
 * `emitAnalyticsEvent` rejects them at compile time.
 */
export type AnalyticsScope = 'backend' | 'frontend';

/**
 * The order the groups appear in — auth first, then the path a user walks through the shop, and
 * the client's own moments last.
 *
 * Each entry names the section, its exported constant, the constant's value and its emitter. The
 * value is what makes the slice checkable; listing it here is also what makes deleting a module a
 * compile error rather than a silently shorter catalogue.
 */
const SECTIONS = [
    {
        module: 'account',
        constant: 'accountAnalyticsEvents',
        events: accountAnalyticsEvents,
        scope: 'backend'
    },
    {
        module: 'products',
        constant: 'productsAnalyticsEvents',
        events: productsAnalyticsEvents,
        scope: 'backend'
    },
    {
        module: 'cart',
        constant: 'cartAnalyticsEvents',
        events: cartAnalyticsEvents,
        scope: 'backend'
    },
    {
        module: 'wishlist',
        constant: 'wishlistAnalyticsEvents',
        events: wishlistAnalyticsEvents,
        scope: 'backend'
    },
    {
        module: 'orders',
        constant: 'ordersAnalyticsEvents',
        events: ordersAnalyticsEvents,
        scope: 'backend'
    },
    {
        module: 'payments',
        constant: 'paymentsAnalyticsEvents',
        events: paymentsAnalyticsEvents,
        scope: 'backend'
    },
    {
        module: 'frontend',
        constant: 'frontendAnalyticsEvents',
        events: frontendAnalyticsEvents,
        scope: 'frontend'
    }
] as const satisfies readonly {
    module: string;
    constant: string;
    events: Record<string, string>;
    scope: AnalyticsScope;
}[];

/**
 * Every section, both scopes — what the cross-cutting test checks the one namespace against.
 *
 * Deliberately not filtered: the collision worth catching is a module and the client claiming the
 * same name, and a list holding only one scope could never see it.
 */
export const ANALYTICS_SECTIONS = SECTIONS;

export const ANALYTICS_SECTION_ORDER = SECTIONS.map(({ module }) => module);

/** The sections one scope owns, in publication order. */
const sectionsInScope = (scope: AnalyticsScope): readonly (typeof SECTIONS)[number][] =>
    SECTIONS.filter((section) => section.scope === scope);

/**
 * Where a section's names are declared — a module's own file, or the shared one for the client.
 *
 * The client's names sit under `shared/contracts/` for the same reason the queue channels do: they
 * belong to no domain, so no module folder is the honest place to put them.
 */
export const analyticsSource = (module: string): string =>
    module === 'frontend'
        ? path.join(REPO_ROOT, 'shared', 'contracts', 'analytics.frontend.ts')
        : path.join(REPO_ROOT, 'src', 'modules', module, 'analytics.ts');

/** Comma, blank line: what goes BETWEEN two groups of entries and after none of them. */
const SECTION_SEPARATOR = ',\n\n';

/** The prose the published file opens with, and the opening of the object literal. */
const HEADER = `// Code generated by \`npm run contracts:bundle\`. DO NOT EDIT.
/**
 * The analytics event names THIS APP emits.
 *
 * ─── Generated in the paired backend, byte-identical here — do not hand-edit ─────────────────
 * Backend:  src/infrastructure/observability/analytics-events.frontend.ts
 * Frontend: src/infrastructure/observability/analytics-events.ts
 * Authored as \`shared/contracts/analytics.frontend.ts\` in the backend, published by
 * \`npm run contracts:bundle\` and copied by \`npm run sync:frontend\`.
 * \`npm run check:spec-identity\` fails the build on the commit that forks the two copies.
 * Two filenames because the backend publishes it beside its own catalogue; the CONTENT
 * must match exactly.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS LIST IS SHORT. Both repos write into one Umami website, and each name has exactly one
 * emitter: the server reports what the server knows, the client reports only what the client
 * alone knows. Everything with an API call behind it — signups, logins, cart changes, checkout
 * outcomes, orders, payments — is emitted by the backend, where it cannot be blocked by an
 * extension, lost with the tab, or forged from a console. What is left is what no request can
 * carry: the app's own lifecycle, a token discarded in the browser, and a checkout that never
 * reached the API.
 *
 * The names live in the backend because the two repos share ONE event namespace; declaring them
 * there is what lets a single test prove no client name collides with a server one.
 *
 * A \`const\` object rather than an \`enum\`: the frontend's lint requires \`E\`-prefixed enums and the
 * backend's does not, so no single \`enum\` satisfies both.
 */
export const analyticsEvents = {
`;

const FOOTER = `} as const;

/** Any name this app can emit. */
export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
`;

/**
 * The body of a section's `as const`, exactly as written.
 *
 * Bounded by the declaration line and the closing `} as const;` at column zero, so the comments,
 * blank lines and indentation between them survive into the published file.
 */
const sliceOf = ({ module, constant }: (typeof SECTIONS)[number]): string => {
    const source = readFileSync(analyticsSource(module), 'utf8');
    const opening = `export const ${constant} = {\n`;
    const start = source.indexOf(opening);
    if (start === -1)
        throw new Error(
            `[analytics-events] ${module} does not declare \`${constant}\`.\n` +
                `  The published catalogue is sliced out of that declaration, so the name must match.`
        );

    const from = start + opening.length;
    const end = source.indexOf('\n} as const;', from);
    if (end === -1)
        throw new Error(
            `[analytics-events] ${module}: \`${constant}\` has no closing \`} as const;\`.`
        );

    return source.slice(from, end);
};

/**
 * Fail unless the text taken out of the file lists exactly the names the file exports.
 *
 * The slice is text and the export is a value, so nothing but this connects them. Without it, a
 * declaration reformatted onto one line, an entry moved out of the literal, or a second constant
 * added above would publish a catalogue that quietly disagrees with what the app can emit — and the
 * frontend would receive it.
 */
const assertSliceMatches = (section: (typeof SECTIONS)[number], slice: string): void => {
    const sliced = [...slice.matchAll(/^ {4}([A-Z][\dA-Z_]*):/gm)].map((match) => match[1]);
    const exported = Object.keys(section.events);

    if (sliced.join(',') !== exported.join(','))
        throw new Error(
            `[analytics-events] the slice taken from ${section.module} does not match ` +
                `what it exports.\n` +
                `  sliced:   ${sliced.join(', ') || '(none)'}\n` +
                `  exported: ${exported.join(', ')}\n` +
                `  Keep the names one per line inside \`export const ${section.constant} = {\`.`
        );
};

/**
 * Fail on a name or a value claimed by two sections, whatever their scope.
 *
 * The one namespace is the point: two repos writing `cart_item_added` into one Umami website
 * produce two rows nothing can tell apart, which is the bug the scope field exists to prevent.
 * Checked here rather than only in the test suite so `contracts:bundle` refuses to publish a
 * catalogue that would reintroduce it.
 */
const assertNamespaceIsUnique = (): void => {
    const seen = new Map<string, string>();

    for (const { module, events } of SECTIONS)
        for (const [key, value] of Object.entries(events))
            for (const claim of [`name ${key}`, `value ${value}`]) {
                const owner = seen.get(claim);
                if (owner !== undefined)
                    throw new Error(
                        `[analytics-events] ${claim} is declared by both \`${owner}\` and ` +
                            `\`${module}\`.\n` +
                            `  Both repos write into one Umami website, so an event name has ` +
                            `exactly one emitter. Two rows carrying it cannot be told apart.`
                    );
                seen.set(claim, module);
            }
};

const content = (): string => {
    assertNamespaceIsUnique();

    const slices = sectionsInScope('frontend').map((section) => {
        const slice = sliceOf(section);
        assertSliceMatches(section, slice);
        return slice.trimEnd();
    });

    return HEADER + slices.join(SECTION_SEPARATOR) + '\n' + FOOTER;
};

/**
 * The frontend's catalogue, and the only analytics file that crosses the repo boundary.
 *
 * Committed rather than produced on demand for the reason every shared document is: it is
 * hash-compared across the repos by `check:spec-identity`, and a check cannot compare a file that
 * only exists after someone remembers to build it.
 *
 * There is no backend counterpart on purpose. A module's names are ordinary TypeScript its own
 * controllers import, so a published copy of them would have no reader here and no reader there.
 */
export const analyticsEventsBundle: CompiledBundle = {
    name: 'analytics-events',
    label: 'src/infrastructure/observability/analytics-events.frontend.ts',
    output: path.join(
        REPO_ROOT,
        'src',
        'infrastructure',
        'observability',
        'analytics-events.frontend.ts'
    ),
    compiled: true,
    content,
    sources: () => sectionsInScope('frontend').map(({ module }) => analyticsSource(module))
};
