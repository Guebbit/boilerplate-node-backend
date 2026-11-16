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
import { heldRules } from '@kernel/ability';
import { findRule, type PermissionRuleId } from '@kernel/permissions';
import type { Caller, WebhookEventCatalogEntry, WebhookEventName } from '@types';
import { ALL_EVENTS } from '../domain';

/** `src/modules/`: a module's folder is its registry name (`AppModule.name`). */
const MODULES_DIRECTORY = path.join(__dirname, '..', '..');

/** The file a module owning webhook events ships, beside its `module.ts`. */
const FRAGMENT_FILE = 'asyncapi.webhooks.yaml';

/** The `x-read-rule` value of an event any subscriber may receive, whatever they hold. */
const PUBLIC_RULE = 'public' as const;

/** The subset of an AsyncAPI fragment this module reads: channel names, text and read rule. */
interface AsyncApiChannelsDocument {
    channels?: Record<string, { description?: string; 'x-read-rule'?: string }>;
}

/** One catalogue event plus the rule a subscriber must hold to receive it. */
interface CatalogEvent {
    name: WebhookEventName;
    description?: string;
    /** A declared tenant rule id (`display:Order`), or `public`. */
    readRule: PermissionRuleId | typeof PUBLIC_RULE;
}

/** Every event of the modules registered at boot; empty until {@link registerWebhookCatalog}. */
let catalogue: readonly CatalogEvent[] = [];

/**
 * Checks a channel's `x-read-rule` at boot. The check on the caller is literal (`heldRules`), so
 * the rule must be one every holder holds for EVERY row: declared, tenant-scoped, no conditions.
 * An own-rows rule such as `read:Order` would pass for every customer and gate nothing.
 *
 * @param event - the channel's name, for the message
 * @param readRule - the raw `x-read-rule` value
 * @throws when it is missing, undeclared, platform-scoped or conditioned
 */
const assertReadRule = (event: string, readRule: string | undefined): CatalogEvent['readRule'] => {
    if (readRule === PUBLIC_RULE) return readRule;
    const declared = readRule === undefined ? undefined : findRule(readRule);
    if (declared?.scope === 'tenant' && declared.conditions === undefined) return declared.id;
    throw new Error(
        `Webhook event "${event}" needs an x-read-rule: "${PUBLIC_RULE}" or a declared tenant rule without conditions (got ${String(readRule)}).`
    );
};

/**
 * One module's events, or none when it owns no fragment.
 *
 * @param moduleName - a registered module's name, which is its folder under `src/modules/`
 */
const eventsOf = (moduleName: string): CatalogEvent[] => {
    const file = path.join(MODULES_DIRECTORY, moduleName, FRAGMENT_FILE);
    if (!existsSync(file)) return [];
    // `yaml.parse`: https://eemeli.org/yaml/#parse — a plain object back, no custom tags here.
    const document = parse(readFileSync(file, 'utf8')) as AsyncApiChannelsDocument;
    return Object.entries(document.channels ?? {}).map(([name, channel]) => ({
        /**
         * The contract's `WebhookEventName` enum is filled from these same channel keys at bundle
         * time, so the compiler cannot see that a key read from disk is one of them.
         */
        name: name as WebhookEventName,
        description: channel.description,
        readRule: assertReadRule(name, channel['x-read-rule'])
    }));
};

/**
 * Builds the catalogue from the registered modules. Called once, from `onRegistered`, when every
 * enabled module is known: the fragments are static files, so a request never touches the disk.
 *
 * @param moduleNames - the registered modules' names, in registration order
 */
export const registerWebhookCatalog = (moduleNames: readonly string[]): void => {
    catalogue = moduleNames.flatMap((name) => eventsOf(name));
};

/**
 * Whether the caller may receive an event: it is public, or the caller holds its read rule.
 *
 * @param event - a catalogue event
 * @param caller - the caller, in tenant scope
 */
const mayRead = (event: CatalogEvent, caller: Caller): boolean =>
    event.readRule === PUBLIC_RULE || heldRules(caller).has(event.readRule);

/**
 * Every event a subscription may filter on, each with whether THIS caller may subscribe to it.
 *
 * @param caller - the caller, in tenant scope
 */
export const listWebhookEventCatalog = (caller: Caller): WebhookEventCatalogEntry[] =>
    catalogue.map((event) => ({
        name: event.name,
        description: event.description,
        actions: { subscribe: mayRead(event, caller) }
    }));

/**
 * The names a subscription may not filter on: anything the catalogue does not list. `*` always
 * stands, since it names every event present and future.
 *
 * @param eventTypes - a subscription's requested filter
 * @returns the unknown names, in request order and without repeats; empty when the filter is fine
 */
export const unknownEventTypes = (eventTypes: readonly string[]): string[] => {
    const known = new Set<string>(catalogue.map((event) => event.name));
    return [...new Set(eventTypes)].filter((name) => name !== ALL_EVENTS && !known.has(name));
};

/**
 * The catalogue events in a filter that the caller may not receive. A subscription is a standing
 * hand-off of an event stream to a machine, like an API key, so it needs the same "only what you
 * hold" (`api-keys` `isMintable`). `*` stands for every catalogue event. Unknown names are the
 * 422's business and are skipped here.
 *
 * @param eventTypes - a subscription's filter, stored, requested, or both
 * @param caller - the caller, in tenant scope
 * @returns the unreadable event names in catalogue order; empty when the caller may read them all
 */
export const unreadableEventTypes = (eventTypes: readonly string[], caller: Caller): string[] => {
    const wanted = eventTypes.includes(ALL_EVENTS) ? undefined : new Set(eventTypes);
    return catalogue
        .filter((event) => wanted === undefined || wanted.has(event.name))
        .filter((event) => !mayRead(event, caller))
        .map((event) => event.name);
};
