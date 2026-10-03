/**
 * Every domain here names the module that answers it in `boilerplate-vue-frontend`.
 *
 * Most domains exist on both sides under the same name, which needs no entry anywhere. The ones
 * that do not carry a `frontend:` block in their own `module.yaml` (`counterparts`, plus a `why`):
 * `access` and `antibot` because they have no screen of their own, `addresses` and `invoicing`
 * because their screens live inside a sibling's frontend module, and `audit-logs` because it
 * shares the frontend's `observability` screen. An asymmetry that is real architecture rather
 * than drift.
 *
 * STATED, NOT DERIVED FROM NAMES. A name matcher would call `audit-logs` unpaired, which is
 * exactly the wrong answer: the trail lives here, the endpoint that reads it belongs to
 * `observability`, and the screen that renders it is the frontend's `observability` module. The
 * statement lives beside the module it describes, so adding or deleting a module edits nothing
 * here.
 *
 * TWO HALVES. The first holds each `frontend:` block to its own rule: a counterpart that is not
 * simply the module's own name has to carry its reason. The second reads the sibling checkout and
 * holds the names to what is actually over there, in both directions — it is the half that can
 * notice the FRONTEND renaming `admin`, dropping `realtime` or adding a module.
 *
 * The second half is conditional on `FRONTEND_PATH`: a deployment with no paired frontend
 * at all owes it nothing, and says so out loud rather than passing quietly — the same bargain
 * `tests/unit/scripts/pairing/spec-identity.test.ts` makes, for the same reason: a guard that
 * evaporates in silence is worse than one that is visibly absent.
 *
 * See: docs/modules/index.md#the-two-repositories
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    frontendCounterparts,
    readAllModuleDescriptors
} from '../../scripts/docs/module-descriptor';
import { MODULES_ROOT } from '@tests/paths';
import { resolveFrontendPath } from '../../scripts/pairing/paired-frontend-path';

/** Every module's descriptor, read off disk. */
const DESCRIPTORS = readAllModuleDescriptors(MODULES_ROOT);

/** Frontend modules with no backend module at all, and what they pair with instead. */
const FRONTEND_ONLY: Readonly<Record<string, string>> = {};

describe('the two repositories, module by module', () => {
    it('finds the modules it means to check', () => {
        expect(Object.keys(DESCRIPTORS).length).toBeGreaterThan(0);
    });

    it('gives a reason wherever the counterpart is not simply the same name', () => {
        const unexplained = Object.entries(DESCRIPTORS)
            .filter(([name, descriptor]) => {
                const counterparts = frontendCounterparts(name, descriptor);
                const sameName = counterparts.length === 1 && counterparts[0] === name;
                return !sameName && !descriptor.frontend?.why;
            })
            .map(([name]) => name);

        expect(unexplained).toEqual([]);
    });
});

/**
 * Whether someone named a paired checkout at all, and so expects the live cross-repo cases below
 * to actually run.
 *
 * Not `CI`: the pipeline's cross-repo guard is the `spec-identity` job, which checks the sibling out
 * and fails on its own when it cannot — see `tests/unit/scripts/pairing/spec-identity.test.ts`.
 * An adopter who stripped the frontend pairing (no `FRONTEND_PATH`) owes it nothing.
 */
const siblingExpected = Boolean(process.env.FRONTEND_PATH?.trim());

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
        ...Object.entries(DESCRIPTORS).flatMap(([name, descriptor]) =>
            frontendCounterparts(name, descriptor)
        ),
        ...Object.keys(FRONTEND_ONLY)
    ])
];

describe(`the paired frontend at ${siblingRoot}`, () => {
    it('is checked out, or this half is knowingly incomplete', () => {
        if (siblingPresent) return;

        const message = `Cross-repo pairing checks skipped: no frontend modules at ${siblingModules}.`;
        // eslint-disable-next-line no-console -- the skip warning must reach a terminal with no logger configured
        if (!siblingExpected) console.warn(`⚠️  ${message}`);
        expect(siblingExpected ? message : '').toBe('');
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
