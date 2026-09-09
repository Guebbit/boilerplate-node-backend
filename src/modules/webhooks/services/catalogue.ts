/**
 * @module
 * The public event catalogue, read straight from this module's own `asyncapi.yaml` fragment — the
 * same source `asyncapi.public.yaml` is generated from (`npm run gen:asyncapi`) — so
 * `GET /webhooks/events` and what this module can actually fire can never drift apart.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** One entry in the catalogue — a name a subscription may filter on, and its human description. */
export interface WebhookEventCatalogueEntry {
    name: string;
    description?: string;
}

/** The subset of an AsyncAPI document this module reads — just enough to list channel names. */
interface AsyncApiChannelsDocument {
    channels?: Record<string, { description?: string }>;
}

/**
 * Parsed once, at import time: the fragment is a static file this process does not change, so
 * re-parsing it per request would only cost every call a disk read for the same six rows.
 */
const catalogue: readonly WebhookEventCatalogueEntry[] = (() => {
    // `yaml.parse`: https://eemeli.org/yaml/#parse — a plain object back, no custom tags here.
    const document = parse(
        readFileSync(path.join(__dirname, '..', 'asyncapi.yaml'), 'utf8')
    ) as AsyncApiChannelsDocument;

    return Object.entries(document.channels ?? {}).map(([name, channel]) => ({
        name,
        description: channel.description
    }));
})();

/** Every event a subscription may filter on. */
export const listWebhookEventCatalogue = (): readonly WebhookEventCatalogueEntry[] => catalogue;
