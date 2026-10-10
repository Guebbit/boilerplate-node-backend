/**
 * @module
 * The public event catalogue: the events of the REGISTERED modules, read from each one's own
 * `asyncapi.webhooks.yaml` fragment, the same files `asyncapi.public.yaml` is bundled from
 * (`npm run contracts:bundle`). `GET /webhooks/events`, the subscribe check and the contract
 * therefore cannot drift apart, and a module that is not registered contributes nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { WebhookEventCatalogueEntry } from '@types';
import { ALL_EVENTS } from '../domain';

/** `src/modules/`: a module's folder is its registry name (`AppModule.name`). */
const MODULES_DIRECTORY = path.join(__dirname, '..', '..');

/** The file a module owning webhook events ships, beside its `module.ts`. */
const FRAGMENT_FILE = 'asyncapi.webhooks.yaml';

/** The subset of an AsyncAPI fragment this module reads: just enough to list channel names. */
interface AsyncApiChannelsDocument {
    channels?: Record<string, { description?: string }>;
}

/** Every event of the modules registered at boot; empty until {@link registerWebhookCatalogue}. */
let catalogue: readonly WebhookEventCatalogueEntry[] = [];

/**
 * One module's events, or none when it owns no fragment.
 *
 * @param moduleName - a registered module's name, which is its folder under `src/modules/`
 */
const eventsOf = (moduleName: string): WebhookEventCatalogueEntry[] => {
    const file = path.join(MODULES_DIRECTORY, moduleName, FRAGMENT_FILE);
    if (!existsSync(file)) return [];
    // `yaml.parse`: https://eemeli.org/yaml/#parse — a plain object back, no custom tags here.
    const document = parse(readFileSync(file, 'utf8')) as AsyncApiChannelsDocument;
    return Object.entries(document.channels ?? {}).map(([name, channel]) => ({
        name,
        description: channel.description
    }));
};

/**
 * Builds the catalogue from the registered modules. Called once, from `onRegistered`, when every
 * enabled module is known: the fragments are static files, so a request never touches the disk.
 *
 * @param moduleNames - the registered modules' names, in registration order
 */
export const registerWebhookCatalogue = (moduleNames: readonly string[]): void => {
    catalogue = moduleNames.flatMap((name) => eventsOf(name));
};

/** Every event a subscription may filter on. */
export const listWebhookEventCatalogue = (): readonly WebhookEventCatalogueEntry[] => catalogue;

/**
 * The names a subscription may not filter on: anything the catalogue does not list. `*` always
 * stands, since it names every event present and future.
 *
 * @param eventTypes - a subscription's requested filter
 * @returns the unknown names, in request order and without repeats; empty when the filter is fine
 */
export const unknownEventTypes = (eventTypes: readonly string[]): string[] => {
    const known = new Set(catalogue.map((event) => event.name));
    return [...new Set(eventTypes)].filter((name) => name !== ALL_EVENTS && !known.has(name));
};
