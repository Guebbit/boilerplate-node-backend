/**
 * @module
 * The example module: a small note with an owner and a draft, published, archived life. Its only
 * job is to be copied when you start a new domain, and deleted once you have your own. It depends
 * on `users` (through its barrel) for the owner's name, and nothing depends on it.
 *
 * In any module: the manifest below is everything this module asks the application to do for it.
 * Each optional capability is one entry here plus its own files, and each can be deleted alone.
 *
 * Capability       Files                                      Manifest entry
 * ---------------  -----------------------------------------  ---------------------------
 * events + mail    ./events.ts, ./services/notify.ts, ./emails.ts, ./templates  subscribe
 * rate limits      ./rate-limits.ts                             rateLimits
 * webhook          ./events.ts, the webhooks catalogue          publicEvents
 * translations     (the repository's `writeTranslatedFields`)   translatables
 * cover image      ./services/cover.ts, ./controllers/put-example-cover.ts  imageTargets
 * typed setting    ./config.ts                                  config
 * demo seed        ../../../scenarios/examples.ts               (the scenario table)
 * metrics, probes, analytics   ./metrics.ts, ./probes.ts, ./analytics.ts   (found by name)
 *
 * See: docs/theory/modules.md#the-module-template
 */

import path from 'node:path';
import type { AppModule, PublicEventTarget } from '@kernel/registry';
import { onDomainEvent, type DomainEventMap } from '@kernel/events';
import { exampleConfig } from './config';
import { EXAMPLE_IMAGE_COLLECTION } from './services/cover';
import { EXAMPLE_PUBLISHED } from './events';
import { mailOwnerOfPublished } from './services/notify';
import { collectPersonalData, eraseForUser } from './services/personal-data';
import { exampleRateLimits } from './rate-limits';
import { exampleRepository } from './repository';
import { router } from './routes';

/**
 * The public (webhook-visible) events: `webhooks` projects them through `kernel/registry.ts`'s
 * registry, so it never imports this module by name.
 */
const publicEvents: Readonly<Record<string, PublicEventTarget>> = {
    [EXAMPLE_PUBLISHED]: {
        toPublicEvent: (payload: DomainEventMap[typeof EXAMPLE_PUBLISHED]) => ({
            eventType: 'example.published',
            data: { exampleId: payload.exampleId, title: payload.title }
        })
    }
};

/** This module's manifest entry. */
export default {
    name: 'example',
    basePath: '/examples',
    routes: router,
    config: [exampleConfig.slice],
    rateLimits: exampleRateLimits,
    publicEvents,
    // Attached once at boot, after every module is known, not at import time.
    subscribe: () => {
        onDomainEvent(EXAMPLE_PUBLISHED, mailOwnerOfPublished);
    },
    // Where the image pipeline writes a finished digest back, keyed by the job's `collection`.
    imageTargets: { [EXAMPLE_IMAGE_COLLECTION]: { writeback: exampleRepository.writebackImage } },
    // `title` is the fallback-language column; other languages live in `locales`' own rows.
    translatables: {
        example: {
            collection: 'examples',
            fields: ['title'],
            cacheTag: 'examples',
            exists: exampleRepository.existsById,
            writeDerived: exampleRepository.writeTranslatedFields,
            markEdited: exampleRepository.markEdited
        }
    },
    // An export lists the person's examples; an erasure deletes them, inside its transaction.
    personalData: [{ section: 'examples', collect: collectPersonalData, erase: eraseForUser }],
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
