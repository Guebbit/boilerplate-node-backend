/**
 * @module
 * In any module: the domain events it emits, declared in `./asyncapi.domain-events.yaml`.
 * Here: `example.published`, which also becomes a public webhook through `module.ts`'s `publicEvents`.
 * Delete it if: the module announces nothing to the rest of the app.
 *
 * @see docs/understand/events-and-logging.md#the-domain-event-bus-and-what-it-is-not
 */

import type { DomainEventName } from '@kernel/events';

/** See the `example.published` channel in `asyncapi.domain-events.yaml`. */
export const EXAMPLE_PUBLISHED = 'example.published' satisfies DomainEventName;
