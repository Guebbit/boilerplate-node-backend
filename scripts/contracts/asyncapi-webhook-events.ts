/**
 * The webhook events each module owns, assembled into the `webhooks` AsyncAPI section.
 *
 * A module that fires a public webhook ships `src/modules/<m>/asyncapi.webhooks.yaml`: its
 * channels, operations, messages and payload schemas. The bundler merges those fragments into the
 * `webhooks` section, and only into it, so a deployment without `webhooks` carries none of them,
 * and a deployment without `orders` carries no `order.*` channel. Same principle as the OpenAPI
 * side: a module's contract leaves with the module.
 *
 * Its own file so the bundler meets it at one call (`withWebhookEvents`) and the discovery rule
 * stays testable on its own.
 *
 * See: docs/api/contract-fragmentation.md#module-owned-webhook-events
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, type Document } from 'yaml';
import { REPO_ROOT } from './bundle-kinds';
import { orderSections } from './section-order';

/** The AsyncAPI section the fragments merge into: the `webhooks` module's own. */
const WEBHOOKS_SECTION = 'webhooks';

/** The file name a module owning webhook events ships. */
const FRAGMENT_FILE = 'asyncapi.webhooks.yaml';

/** Narrative order for the shop's modules; the rest follow alphabetically (a preference, not a registry). */
const FRAGMENT_ORDER: readonly string[] = ['orders', 'payments', 'returns'];

/**
 * Every module's webhook-event fragment, discovered from disk.
 *
 * @returns absolute paths, in {@link FRAGMENT_ORDER} then alphabetically
 */
export const webhookEventFragments = (): string[] => {
    const modulesDirectory = path.join(REPO_ROOT, 'src', 'modules');
    const owners = readdirSync(modulesDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(modulesDirectory, name, FRAGMENT_FILE)));
    return orderSections(FRAGMENT_ORDER, owners).map((name) =>
        path.join(modulesDirectory, name, FRAGMENT_FILE)
    );
};

/**
 * Folds every module's fragment into the `webhooks` section's document; any other section passes
 * through untouched.
 *
 * @param section - the section being read, as the bundler names it
 * @param document - that section's own parsed document
 * @param merge - the bundler's merge, which refuses a key two owners both declare
 * @returns the same document, now carrying every owner's events when it is the `webhooks` section
 */
export const withWebhookEvents = (
    section: string,
    document: Document,
    merge: (target: Document, label: string, source: Document) => void
): Document => {
    if (section !== WEBHOOKS_SECTION) return document;
    for (const fragment of webhookEventFragments())
        // `yaml`'s `parseDocument`, keeping source tokens so each node keeps its authored style.
        merge(
            document,
            path.basename(path.dirname(fragment)),
            parseDocument(readFileSync(fragment, 'utf8'), { keepSourceTokens: true })
        );
    return document;
};
