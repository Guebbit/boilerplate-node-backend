/**
 * The three API client collections in `.dev/` — Bruno, Insomnia and Mockoon.
 *
 * They restate the REST contract one request at a time, with auth, bodies and example responses.
 * Being developer tooling, nothing reads them closely enough to notice a gap, so a missing endpoint
 * is invisible until someone opens the collection and finds it useless — which is why all three are
 * in `scripts/specIdentity.ts` and why they are now DERIVED rather than written by hand.
 *
 * TWO STEPS, BOTH COMMITTED. `scripts/contracts/generateCollections.ts` writes one fragment per
 * module per tool from `openapi.yaml` and `seed-identities.ts`; this file says how those fragments
 * assemble into the three published documents. Deleting `src/modules/products` removes its Bruno
 * folder, its Insomnia folder and its Mockoon routes with it — and adding an endpoint to the
 * contract adds it to all three without anyone opening them.
 *
 * SECTIONS ARE THE CONTRACT'S. A collection groups requests exactly as the contract files paths,
 * `SECTION_ORDER` and all, because ownership is recorded once — in the OpenAPI fragments — and
 * restating it here is how the three would drift apart again. `system` (the health probe, which
 * belongs to no module) lives in `contracts/shared/`, as it does for the contract itself.
 *
 * THREE FORMATS, ONE MECHANISM. Bruno and Insomnia are YAML lists, where items need no separator
 * and a fragment is pasted verbatim. Mockoon is JSON, where entries need a comma between them and
 * none after the last, and where every route appears TWICE — once in `routes` and once as a
 * `rootChildren` reference fixing the order the UI shows them in. A module therefore owns two
 * Mockoon fragments, and both are joined rather than pasted.
 *
 * REQUESTS THE CONTRACT CANNOT DESCRIBE — an invalid body, a bogus token, a soft-deleted record —
 * are declared per module in `dev/probes.yml` and generated into the same fragments. They are not a
 * separate slice, so nothing here has to know about them.
 */

import path from 'node:path';
import { REPO_ROOT, type IContractBundle, type TSegment } from './fragments';
import { SECTION_ORDER, type TSectionName } from './openapi';

/** The three tools, and the order this file names them in. */
export const COLLECTION_TOOLS = ['bruno', 'insomnia', 'mockoon'] as const;

export type TCollectionTool = (typeof COLLECTION_TOOLS)[number];

/** What separates two entries of a JSON array, and follows none of them. */
const ENTRY_SEPARATOR = ',\n';

/** Mockoon files are JSON; the other two are YAML whatever their extension claims. */
const extensionFor = (tool: TCollectionTool): string => (tool === 'mockoon' ? 'json' : 'yml');

/**
 * Where a section's slice of a collection lives.
 *
 * `kind` is `routes` for everything except Mockoon's second slice, the `rootChildren` order tree.
 */
export const collectionFragment = (
    tool: TCollectionTool,
    section: TSectionName,
    kind: 'routes' | 'tree' = 'routes'
): string => {
    // Only Mockoon has a second slice, so only Mockoon's filenames need to say which one they are.
    const qualifier = tool === 'mockoon' ? `.${kind}` : '';

    return section === 'system'
        ? path.join(
              REPO_ROOT,
              'contracts',
              'shared',
              `${tool}.system${qualifier}.${extensionFor(tool)}`
          )
        : path.join(
              REPO_ROOT,
              'src',
              'modules',
              section,
              'dev',
              `${tool}${qualifier}.${extensionFor(tool)}`
          );
};

/** A collection's shared scaffolding: its name, environments, server settings, cookie jar. */
const sharedPart = (tool: TCollectionTool, part: string): string =>
    path.join(REPO_ROOT, 'contracts', 'shared', `${tool}.${part}.${extensionFor(tool)}`);

/** Every section's slice of one tool, in the contract's own order. */
const sectionsOf = (tool: TCollectionTool, kind: 'routes' | 'tree' = 'routes'): string[] =>
    SECTION_ORDER.map((section) => collectionFragment(tool, section, kind));

export const brunoBundle: IContractBundle = {
    name: 'bruno',
    label: '.dev/Ecommerce Demo API - Bruno.yml',
    output: path.join(REPO_ROOT, '.dev', 'Ecommerce Demo API - Bruno.yml'),
    segments: (): TSegment[] => [
        sharedPart('bruno', 'header'),
        ...sectionsOf('bruno'),
        sharedPart('bruno', 'footer')
    ]
};

export const insomniaBundle: IContractBundle = {
    name: 'insomnia',
    label: '.dev/Ecommerce Demo API - Insomnia.json',
    // Named `.json` by the tool that exports it, and YAML inside. Kept as-is: the name is what
    // Insomnia's importer and the frontend's copy of the file both expect.
    output: path.join(REPO_ROOT, '.dev', 'Ecommerce Demo API - Insomnia.json'),
    segments: (): TSegment[] => [
        sharedPart('insomnia', 'header'),
        ...sectionsOf('insomnia'),
        sharedPart('insomnia', 'footer')
    ]
};

export const mockoonBundle: IContractBundle = {
    name: 'mockoon',
    label: '.dev/Ecommerce Demo API - Mockoon.json',
    output: path.join(REPO_ROOT, '.dev', 'Ecommerce Demo API - Mockoon.json'),
    segments: (): TSegment[] => [
        sharedPart('mockoon', 'header'),
        { parts: sectionsOf('mockoon'), separator: ENTRY_SEPARATOR },
        sharedPart('mockoon', 'tree.header'),
        { parts: sectionsOf('mockoon', 'tree'), separator: ENTRY_SEPARATOR },
        sharedPart('mockoon', 'footer')
    ]
};
