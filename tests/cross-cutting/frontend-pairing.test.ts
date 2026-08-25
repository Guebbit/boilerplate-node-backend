/**
 * Every domain here names the module that answers it in `boilerplate-vue-frontend`.
 *
 * Eleven of thirteen domains exist on both sides under the same name. The interesting two do not,
 * and neither does the frontend's one extra module — an asymmetry that is real architecture rather
 * than drift, and that is written down nowhere else in either repository.
 *
 * STATED, NOT DERIVED. A name matcher would call `audit-logs` unpaired, which is exactly the wrong
 * answer: the trail lives here, the endpoint that reads it belongs to `observability`, and the
 * screen that renders it is the frontend's admin dashboard. Three names, one domain.
 *
 * TWO HALVES, AND ONLY ONE OF THEM WORKS WITHOUT THE SIBLING. The cases against this repo hold the
 * map to the modules here: an added module with no entry, an entry for a module that is gone. On
 * their own they would be a completeness check on a hand-written list — they cannot notice the
 * FRONTEND renaming `admin`, dropping `realtime` or adding a module, which is most of the drift the
 * map exists to catch. So the second half reads the sibling checkout and holds the names to what is
 * actually over there, in both directions.
 *
 * That half is conditional on the sibling being present, and says so out loud rather than passing
 * quietly — the same bargain `tests/unit/scripts/spec-identity.test.ts` makes, for the same reason:
 * a guard that evaporates in silence is worse than one that is visibly absent.
 *
 * `why` is required whenever the counterpart is not simply the same name, because that is the case
 * where a reader cannot guess and the pairing is worth having written down at all.
 *
 * See: docs/modules/index.md#the-two-repositories
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';
import { resolveFrontendPath } from '../../scripts/paired-frontend-path';

/** One module's counterpart in `boilerplate-vue-frontend`. */
interface Pairing {
    /** Frontend module names that cover this domain. Empty means nothing over there does. */
    counterparts: readonly string[];
    /** Required when the names differ or the list is empty. One sentence, present tense. */
    why?: string;
}

const FRONTEND_PAIRING: Readonly<Partial<Record<string, Pairing>>> = {
    account: { counterparts: ['account'] },
    'audit-logs': {
        counterparts: ['admin'],
        why: 'This module owns the trail and no URL; the endpoint that reads it belongs to `observability`, and the screen that renders it is the frontend’s admin dashboard.'
    },
    cart: { counterparts: ['cart'] },
    delivery: { counterparts: ['delivery'] },
    feedback: { counterparts: ['feedback'] },
    inventory: { counterparts: ['inventory'] },
    locales: { counterparts: ['locales'] },
    observability: {
        counterparts: ['admin', 'realtime'],
        why: 'Its two surfaces are consumed by two different frontend modules: the health and metrics reads by `admin`, the SSE stream by `realtime`.'
    },
    orders: { counterparts: ['orders'] },
    payments: { counterparts: ['payments'] },
    products: { counterparts: ['products'] },
    users: { counterparts: ['users'] },
    wishlist: { counterparts: ['wishlist'] }
};

/** Frontend modules with no backend module at all, and what they pair with instead. */
const FRONTEND_ONLY: Readonly<Record<string, string>> = {
    demo: 'A client-side showcase of the shared UI kit. It pairs with the demo profile and the seeded dataset rather than with any single domain.'
};

const moduleNames = (): string[] => enabledModules.map((appModule) => appModule.name);

describe('the two repositories, module by module', () => {
    it('finds the modules it means to check', () => {
        expect(moduleNames().length).toBeGreaterThan(0);
    });

    it('gives every module here an entry', () => {
        expect(moduleNames().filter((name) => !FRONTEND_PAIRING[name])).toEqual([]);
    });

    it('names no module that is not enabled', () => {
        const enabled = new Set(moduleNames());
        expect(Object.keys(FRONTEND_PAIRING).filter((name) => !enabled.has(name))).toEqual([]);
    });

    it('demands a reason wherever the counterpart is not the same name', () => {
        const unexplained = moduleNames().filter((name) => {
            const pairing = FRONTEND_PAIRING[name];
            if (!pairing) return false;
            const sameName = pairing.counterparts.length === 1 && pairing.counterparts[0] === name;
            return !sameName && !pairing.why;
        });

        expect(unexplained).toEqual([]);
    });

    it('explains every frontend module that stands alone', () => {
        // The other direction, and the one no walk of this repository could ever discover.
        expect(Object.entries(FRONTEND_ONLY).filter(([, why]) => !why.trim())).toEqual([]);
    });
});

/*
 * The live pair. Everything above is about this repo's list; everything below is about whether the
 * names in it still mean anything on the other side.
 */
const siblingRoot = resolveFrontendPath();
const siblingModules = path.join(siblingRoot, 'src', 'modules');
const siblingPresent = existsSync(siblingModules);

/** Every module folder in the paired frontend. */
const frontendModules = (): string[] =>
    readdirSync(siblingModules, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

/** Every frontend name this map claims exists, counterparts and stand-alones together. */
const claimedNames = (): string[] => [
    ...new Set([
        ...Object.values(FRONTEND_PAIRING).flatMap((pairing) => [...(pairing?.counterparts ?? [])]),
        ...Object.keys(FRONTEND_ONLY)
    ])
];

describe(`the paired frontend at ${siblingRoot}`, () => {
    it('is checked out, or this half is knowingly incomplete', () => {
        if (siblingPresent) return;

        const message = `Cross-repo pairing checks skipped: no frontend modules at ${siblingModules}.`;
        // eslint-disable-next-line no-console -- the skip warning must reach a terminal with no logger configured
        if (!process.env.CI) console.warn(`⚠️  ${message}`);
        expect(process.env.CI ? message : '').toBe('');
    });

    if (!siblingPresent) return;

    it('names only modules that exist over there', () => {
        const actual = new Set(frontendModules());

        expect(claimedNames().filter((name) => !actual.has(name))).toEqual([]);
    });

    it('accounts for every module over there', () => {
        // The direction nothing in this repository could ever discover on its own: a frontend
        // module that answers to no domain here and is not declared as standing alone.
        const claimed = new Set(claimedNames());

        expect(frontendModules().filter((name) => !claimed.has(name))).toEqual([]);
    });
});
