#!/usr/bin/env tsx
/**
 * `shared/authorization-keys.yaml`, assembled from one fragment per module plus a root residual
 * file for the app-level rules — `npm run regenerate`.
 *
 * Each rule and set is defined in its own module's `authorization.yaml`, so a module's rules
 * never outlive its own deletion — a fact about this bundle (it reads only fragments that exist),
 * checked below, rather than two hand-kept lists reconciled by a test.
 *
 * Spliced as TEXT, not merged through the YAML AST the way `asyncapi-bundles.ts` merges channel
 * maps: every entry here is a flat, self-contained list item with no cross-fragment reference to
 * resolve, so a structural merge would buy nothing and risks the stringifier re-wrapping a
 * description or re-quoting a scalar. A straight splice keeps every authored byte, which matters
 * more here than for AsyncAPI — `shared/authorization-keys.yaml` is read by the PHP twin too.
 *
 * `--check` asserts the committed file is not stale, the same contract every bundle in
 * `scripts/contracts/bundle-registry.ts` makes — kept separate from that registry because `shared`
 * there means "the paired FRONTEND holds a copy", which is not this file's story at all: it is
 * shared with the PHP twin, a repository this one has no access to and no pairing test for.
 *
 * See: docs/api/contract-fragmentation.md, docs/theory/authorization.md
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { orderSections } from './section-order';
import { REPO_ROOT, MODULES_ROOT, modulesWith } from '../modules-on-disk';
import { readAuthorizationFragment } from './fragments';
import { writeOrCheck } from './generated-file';

/** The root residual file: everything no module owns — preamble, `version`, `actions`, `implies`, `scopes`, the closing note. */
const ROOT_FILE = path.join(REPO_ROOT, 'shared', 'contracts', 'authorization-keys.root.yaml');

/** The app-level rules and sets — `read:Translation`, `update:Translation` — that belong to `core`, not to one module. See `kernel/translation.ts`'s translation port, which the fragment's own comment explains. */
const CORE_FILE = path.join(REPO_ROOT, 'shared', 'contracts', 'authorization-keys.core.yaml');

/** The committed bundle every backend reads at boot. */
const OUTPUT_FILE = path.join(REPO_ROOT, 'shared', 'authorization-keys.yaml');

/** Where the root file's `rules:` section goes — a YAML comment, so the file still parses as one document with no `rules` field of its own. */
const RULES_MARKER = '# %AUTHORIZATION_RULES%';

/** Where the root file's `sets:` section goes; same reasoning as {@link RULES_MARKER}. */
const SETS_MARKER = '# %AUTHORIZATION_SETS%';

/** The heading line that separates a fragment's rules from its sets. */
const SETS_HEADING = /^sets:\r?\n/m;

/**
 * The order the original hand-written file had its sections in, kept so a PHP port's own diff of
 * this file stays small. A preference, not a registry — see `scripts/contracts/section-order.ts`. `core`'s two keys
 * sit between `locales` and `users`, where they always have.
 */
const PREFERRED_ORDER = [
    'products',
    'cart',
    'orders',
    'payments',
    'inventory',
    'delivery',
    'returns',
    'feedback',
    'locales',
    'core',
    'users',
    'account',
    'access',
    'audit-logs',
    'webhooks',
    'api-keys',
    'observability'
];

/** A section's own fragment file, on disk. */
const fragmentPath = (section: string): string =>
    section === 'core'
        ? CORE_FILE
        : path.join(REPO_ROOT, 'src', 'modules', section, 'authorization.yaml');

/**
 * The raw text a fragment contributes: its `rules:` list and its `sets:` list, each with its own
 * heading stripped — what gets spliced under the bundle's single `rules:` and `sets:` lines.
 * Also the fail-closed check the "never outlive its module" guarantee leans on: a fragment whose
 * own rule or set names a DIFFERENT module than the folder it lives in is a typo the bundle
 * refuses to launder.
 * @param section - the module name, or `core` for the app-level fragment
 * @throws Error if the fragment is missing, malformed, or misattributes one of its own entries
 */
const fragmentBlocks = (section: string): { rules: string; sets: string } => {
    const file = fragmentPath(section);
    if (!existsSync(file)) throw new Error(`[authorization] missing fragment: ${file}`);

    const raw = readFileSync(file, 'utf8');
    const parsed = readAuthorizationFragment(file);
    const misattributed = [...parsed.rules, ...parsed.sets].filter(
        (entry) => entry.module !== section
    );
    if (misattributed.length > 0)
        throw new Error(
            `[authorization] ${file}: every rule and set must declare module: ${section} — found ` +
                misattributed.map((entry) => entry.module).join(', ')
        );

    const [rulesPart, setsPart = ''] = raw.replace(/^rules:\r?\n/, '').split(SETS_HEADING);
    return { rules: rulesPart.replace(/\n+$/, ''), sets: setsPart.replace(/\n+$/, '') };
};

/** Every section that has a fragment on disk: each module folder carrying an `authorization.yaml`, plus `core`. */
const sectionsOnDisk = (): string[] => [...modulesWith(MODULES_ROOT, 'authorization.yaml'), 'core'];

/**
 * Assemble the bundle from the root file plus every fragment that exists, in `PREFERRED_ORDER`, extras appended.
 * A module deleted from the tree drops out with its own fragment — nothing lists it by hand.
 */
export const assembleAuthorizationKeys = (): string => {
    const root = readFileSync(ROOT_FILE, 'utf8');
    for (const marker of [RULES_MARKER, SETS_MARKER])
        if (!root.includes(marker))
            throw new Error(`[authorization] ${ROOT_FILE} is missing the ${marker} marker`);
    const [beforeRules, afterRules] = root.split(RULES_MARKER);
    const [betweenText, afterSets] = afterRules.split(SETS_MARKER);

    const blocks = orderSections(PREFERRED_ORDER, sectionsOnDisk()).map((section) =>
        fragmentBlocks(section)
    );
    const rules = blocks.map((block) => block.rules).join('\n\n');
    const sets = blocks
        .map((block) => block.sets)
        .filter((block) => block !== '')
        .join('\n\n');

    return (
        `${beforeRules.replace(/\n+$/, '')}\nrules:\n${rules}\n` +
        `${betweenText.replace(/^\n+/, '\n').replace(/\n+$/, '')}\nsets:\n${sets}\n` +
        afterSets.replace(/^\n+/, '\n')
    );
};

/** The bundle as the fragments say it should read: written, or under `--check` compared. */
writeOrCheck(OUTPUT_FILE, assembleAuthorizationKeys(), 'its fragments', 'npm run regenerate');
