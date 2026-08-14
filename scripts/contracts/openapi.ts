/**
 * `openapi.yaml` — the REST contract, assembled from one fragment pair per domain.
 *
 * The rule the module registry already uses applies here too: a module owns the paths under its
 * `basePath`, and the schemas only its paths reference. Everything two or more modules reference —
 * the error envelope, the pagination parameters, the scalars, the entities a cart line embeds —
 * stays in `shared/contracts/schemas.yaml`. Duplicating one of those into two module fragments
 * would put two definitions in the bundle that drift apart silently, which is the failure mode this
 * split has to avoid.
 *
 * `GET /` — the health probe — belongs to no module: it is the application shell answering for
 * itself, so it is filed under the `system` section in `shared/contracts/`.
 *
 * THE ORDER IS SHARED, THE LAYOUT IS NOT. The paired frontend holds the bundled document and does
 * not fragment it, but if it ever did, its modules are not these: a path this repo files under
 * `observability` is the frontend's `admin`. `SECTION_ORDER` is the canonical sequence the document
 * is assembled in; where each section's fragment lives is a per-repo detail.
 */

import path from 'node:path';
import { REPO_ROOT, type ContractBundle, type Segment } from './fragments';

/**
 * The canonical order the document is assembled in, by path-group prefix.
 *
 * It is the order the contract already had, so adopting fragments changed no bytes.
 */
export const SECTION_ORDER = [
    'system',
    'locales',
    'observability',
    'account',
    'users',
    'feedback',
    'products',
    'cart',
    'wishlist',
    'orders',
    'payments',
    'delivery',
    'inventory'
] as const;

export type SectionName = (typeof SECTION_ORDER)[number];

/** Where a section's fragment of `kind` lives in THIS repo. */
export const sectionFragment = (section: SectionName, kind: 'paths' | 'schemas'): string =>
    section === 'system'
        ? path.join(REPO_ROOT, 'shared', 'contracts', `system.${kind}.yaml`)
        : path.join(REPO_ROOT, 'src', 'modules', section, 'openapi', `${kind}.yaml`);

/** Preamble, tags, security schemes, parameters, responses — down to the `schemas:` key. */
export const HEADER_FRAGMENT = path.join(REPO_ROOT, 'shared', 'contracts', 'header.yaml');

/**
 * The scalars, envelopes and entities that MORE THAN ONE module references.
 *
 * `Product` is here because cart lines and order items both embed it; `Order` because a checkout
 * returns one; `User` because `account` authenticates the record `users` administers.
 */
export const SHARED_SCHEMAS_FRAGMENT = path.join(REPO_ROOT, 'shared', 'contracts', 'schemas.yaml');

/** The lone `paths:` key, between the components and the path fragments. */
export const PATHS_KEY_FRAGMENT = path.join(REPO_ROOT, 'shared', 'contracts', 'paths.header.yaml');

export const openapiBundle: ContractBundle = {
    name: 'openapi',
    label: 'openapi.yaml',
    output: path.join(REPO_ROOT, 'openapi.yaml'),
    segments: (): Segment[] => [
        HEADER_FRAGMENT,
        SHARED_SCHEMAS_FRAGMENT,
        ...SECTION_ORDER.map((section) => sectionFragment(section, 'schemas')),
        PATHS_KEY_FRAGMENT,
        ...SECTION_ORDER.map((section) => sectionFragment(section, 'paths'))
    ]
};
