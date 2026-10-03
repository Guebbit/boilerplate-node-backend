#!/usr/bin/env tsx
/**
 * `shared/authorization-keys.yaml`, assembled from one fragment per module plus a root residual
 * file for the app-level keys — `npm run authorization:bundle`.
 *
 * Each key is defined in its own module's `authorization.yaml`, so a module's keys
 * never outlive its own deletion — a fact about this bundle (it reads only fragments that exist),
 * checked below, rather than two hand-kept lists reconciled by a test.
 *
 * Spliced as TEXT, not merged through the YAML AST the way `asyncapi-bundles.ts` merges channel
 * maps: every key here is a flat, self-contained list item with no cross-fragment reference to
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

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { orderSections } from './section-order';

/** Repo root, from `scripts/contracts/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The root residual file: everything no module owns — preamble, `version`, `actions`, `scopes`, the closing note. */
const ROOT_FILE = path.join(REPO_ROOT, 'shared', 'contracts', 'authorization-keys.root.yaml');

/** The app-level keys — `translations.any.*` — that belong to `core`, not to one module. See `kernel/translation.ts`'s translation port, which the fragment's own comment explains. */
const CORE_FILE = path.join(REPO_ROOT, 'shared', 'contracts', 'authorization-keys.core.yaml');

/** The committed bundle every backend reads at boot. */
const OUTPUT_FILE = path.join(REPO_ROOT, 'shared', 'authorization-keys.yaml');

/** Where the root file's own `keys:` section goes — a YAML comment, so the file still parses as one document with no `keys` field of its own. */
const SPLICE_MARKER = '# %AUTHORIZATION_KEYS%';

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
    'audit-logs',
    'webhooks',
    'api-keys',
    'observability'
];

/** One key, as `authorization.yaml` and the root's `keys:` shape both declare it — only the field this bundler checks. */
interface FragmentKey {
    module: string;
}

/** A fragment's own `keys:` document — just enough shape to validate module attribution. */
interface FragmentDocument {
    keys: FragmentKey[];
}

/** A section's own fragment file, on disk. */
const fragmentPath = (section: string): string =>
    section === 'core'
        ? CORE_FILE
        : path.join(REPO_ROOT, 'src', 'modules', section, 'authorization.yaml');

/**
 * The raw `keys:` list text a fragment contributes, its own `keys:` heading stripped — what gets
 * spliced under the bundle's single `keys:` line. Also the fail-closed check that
 * guarantee leans on: a fragment whose own key names a DIFFERENT module than the folder it lives in is a typo the
 * bundle refuses to launder.
 * @param section - the module name, or `core` for the app-level fragment
 * @throws Error if the fragment is missing, malformed, or misattributes one of its own keys
 */
const fragmentKeysBlock = (section: string): string => {
    const file = fragmentPath(section);
    if (!existsSync(file)) throw new Error(`[authorization] missing fragment: ${file}`);

    const raw = readFileSync(file, 'utf8');
    const parsed = parseYaml(raw) as FragmentDocument;
    const owner = section === 'core' ? 'core' : section;
    const misattributed = parsed.keys.filter((key) => key.module !== owner);
    if (misattributed.length > 0)
        throw new Error(
            `[authorization] ${file}: every key must declare module: ${owner} — found ` +
                misattributed.map((key) => key.module).join(', ')
        );

    const withoutHeading = raw.replace(/^keys:\r?\n/, '');
    return withoutHeading.replace(/\n+$/, '');
};

/** Every section that has a fragment on disk: each module folder carrying an `authorization.yaml`, plus `core`. */
const sectionsOnDisk = (): string[] => [
    ...readdirSync(path.join(REPO_ROOT, 'src', 'modules'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) =>
            existsSync(path.join(REPO_ROOT, 'src', 'modules', name, 'authorization.yaml'))
        ),
    'core'
];

/**
 * Assemble the bundle from the root file plus every fragment that exists, in `PREFERRED_ORDER`, extras appended.
 * A module deleted from the tree drops out with its own fragment — nothing lists it by hand.
 */
export const assembleAuthorizationKeys = (): string => {
    const root = readFileSync(ROOT_FILE, 'utf8');
    if (!root.includes(SPLICE_MARKER))
        throw new Error(`[authorization] ${ROOT_FILE} is missing the ${SPLICE_MARKER} marker`);
    const [before, after] = root.split(SPLICE_MARKER);

    const keys = orderSections(PREFERRED_ORDER, sectionsOnDisk())
        .map((section) => fragmentKeysBlock(section))
        .join('\n\n');

    return `${before.replace(/\n+$/, '')}\nkeys:\n${keys}\n${after.replace(/^\n+/, '\n')}`;
};

/** `authorization:bundle` writes the committed file; `--check` only compares against it. */
const checkOnly = process.argv.includes('--check');

/** The bundle as the fragments say it should read. */
const assembled = assembleAuthorizationKeys();

/** The bundle as it is on disk now; empty when the file does not exist yet. */
const committed = existsSync(OUTPUT_FILE) ? readFileSync(OUTPUT_FILE, 'utf8') : '';

// Three outcomes: in sync, drifted under `--check` (fail), or drifted so rewrite it.
if (assembled === committed) {
    console.info(
        '[authorization] shared/authorization-keys.yaml is up to date with its fragments.'
    );
} else if (checkOnly) {
    console.error(
        '[authorization] STALE — shared/authorization-keys.yaml does not match its fragments.\n' +
            '  A fragment was edited without re-bundling, or the bundle was hand-edited.\n' +
            '  Fix with: npm run authorization:bundle'
    );
    process.exit(1);
} else {
    writeFileSync(OUTPUT_FILE, assembled);
    console.info('[authorization] rebuilt shared/authorization-keys.yaml.');
}
