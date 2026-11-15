/**
 * @module
 * The webhook events modules own: one `asyncapi.webhooks.yaml` per module that fires a public webhook.
 *
 * The bundler merges those fragments into the `webhooks` section, and only into it, so a deployment
 * without `webhooks` carries none of them, and a deployment without `orders` carries no `order.*`
 * channel. Same principle as the OpenAPI side: a module's contract leaves with the module.
 * The merge itself is generic and lives in `./asyncapi-section-fragments`.
 *
 * See: docs/build/contract-fragmentation.md#module-owned-webhook-events
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

import { sectionFragments } from './asyncapi-section-fragments';

/** The AsyncAPI section the webhook-event fragments merge into: the `webhooks` module's own. */
const WEBHOOKS_SECTION = 'webhooks';

/**
 * Every module's webhook-event fragment, discovered from disk.
 *
 * @returns absolute paths, the shop modules first then alphabetically
 */
export const webhookEventFragments = (): string[] => sectionFragments(WEBHOOKS_SECTION);

/**
 * The name of every webhook event any module ships: the channel keys of its fragment.
 *
 * What a subscription's `eventTypes` may name, so the REST contract fills its enum from here
 * instead of copying the list. Fragment order, then channel order within each.
 *
 * @returns each event name once
 */
export const webhookEventNames = (): string[] =>
    webhookEventFragments().flatMap((file) =>
        // `yaml`'s `parse`: a plain object back, no custom tags in a fragment.
        // https://eemeli.org/yaml/#parse-yaml-to-json-value
        Object.keys((parse(readFileSync(file, 'utf8')) as { channels?: object }).channels ?? {})
    );
