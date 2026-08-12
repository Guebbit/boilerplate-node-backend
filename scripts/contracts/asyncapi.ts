/**
 * `asyncapi.yaml` — the realtime/event contract, assembled the same way the REST one is.
 *
 * The document has three sections that each domain appears in — `channels:`, `components.messages:`
 * and `components.schemas:` — so a section here contributes three fragments rather than the REST
 * contract's two, and the shared key lines between them are fragments of their own.
 *
 * WHO OWNS WHAT. `observability` owns the SSE channels, because the module that serves
 * `/observability/events` is the one that decides what it pushes down them. The `worker.*` queues
 * belong to no module: the email and PDF workers are substrate (`src/app/workers.ts` over
 * `src/infrastructure/adapters/queue.ts`), enqueued by whichever domain happens to need a mail sent, so they
 * are filed under `workers` in `contracts/shared/` for the same reason `GET /` is filed under
 * `system` in the REST contract.
 *
 * The output feeds `npm run genasyncapi`, whose generated types are themselves a guarded shared
 * file — so a fragment edited without re-bundling forks the types too, one step later.
 */

import path from 'node:path';
import { REPO_ROOT, type IContractBundle, type TSegment } from './fragments';

/** The order the document's per-section fragments are assembled in, within each of its sections. */
export const ASYNC_SECTION_ORDER = ['observability', 'workers'] as const;

export type TAsyncSectionName = (typeof ASYNC_SECTION_ORDER)[number];

/** The three places every section appears: its channels, its messages, its payload schemas. */
export type TAsyncFragmentKind = 'channels' | 'messages' | 'schemas';

/** Where a section's fragment of `kind` lives in THIS repo. */
export const asyncSectionFragment = (
    section: TAsyncSectionName,
    kind: TAsyncFragmentKind
): string =>
    section === 'workers'
        ? path.join(REPO_ROOT, 'contracts', 'shared', `asyncapi.workers.${kind}.yaml`)
        : path.join(REPO_ROOT, 'src', 'modules', section, 'asyncapi', `${kind}.yaml`);

/** A shared fragment of the document's scaffolding, by the key it opens. */
const sharedFragment = (name: string): string =>
    path.join(REPO_ROOT, 'contracts', 'shared', `asyncapi.${name}.yaml`);

/** Preamble: version, id, info, content type, tags, servers. */
export const ASYNC_HEADER_FRAGMENT = sharedFragment('header');

const CHANNELS_KEY_FRAGMENT = sharedFragment('channels.header');
const COMPONENTS_KEY_FRAGMENT = sharedFragment('components.header');
const SCHEMAS_KEY_FRAGMENT = sharedFragment('schemas.header');

/** Every section's fragment of one kind, in canonical order. */
const sectionsOf = (kind: TAsyncFragmentKind): string[] =>
    ASYNC_SECTION_ORDER.map((section) => asyncSectionFragment(section, kind));

export const asyncapiBundle: IContractBundle = {
    name: 'asyncapi',
    label: 'asyncapi.yaml',
    output: path.join(REPO_ROOT, 'asyncapi.yaml'),
    segments: (): TSegment[] => [
        ASYNC_HEADER_FRAGMENT,
        CHANNELS_KEY_FRAGMENT,
        ...sectionsOf('channels'),
        COMPONENTS_KEY_FRAGMENT,
        ...sectionsOf('messages'),
        SCHEMAS_KEY_FRAGMENT,
        ...sectionsOf('schemas')
    ]
};
