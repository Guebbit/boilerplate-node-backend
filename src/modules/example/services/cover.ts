/**
 * @module
 * Optional capability, in its own files: a cover image. The upload middleware has already
 * quarantined the bytes; this applies the result to the row, hands a pending upload to the digest
 * pipeline (`imageTargets` in `module.ts` is where the pipeline writes back), and drops the image
 * it replaced. Delete this file, `../controllers/put-example-cover.ts`, the route, the contract path
 * and the manifest entry to drop it.
 *
 * See: docs/tools/image-processing.md
 */

import type { CallerContext, Example } from '@types';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { recordAudit } from '@infrastructure/observability/audit';
import { applyImageWriteback, imageStore } from '@infrastructure/adapters/image-store';
import { enqueueIfImagePending } from '@infrastructure/adapters/image.worker';
import type { ImageChanges } from '@infrastructure/http/uploads';
import { accessibleFilterFor } from '@kernel/access/query';
import { exampleAuditActions } from '../audit';
import { outrankedRefusalFor, presentWithOwner } from './owner';
import type { ExampleDocument } from '../model';
import { exampleRepository } from '../repository';

/**
 * The key `ImageDigestJobPayload.collection` carries for this module — the same string
 * `module.ts` registers its `imageTargets` entry under.
 */
export const EXAMPLE_IMAGE_COLLECTION = 'examples';

/**
 * Write the upload onto an example already loaded and cleared, hand a pending image to the digest
 * pipeline and drop the cover it replaced.
 *
 * @param example - the loaded example
 * @param image - the image fields the upload middleware produced
 * @param context - the caller, for the audit row
 */
const applyCover = (
    example: ExampleDocument,
    image: ImageChanges,
    context: CallerContext
): Promise<ResponseSuccess<Example> | ResponseReject> => {
    // Url, thumbnail and pending key change together, or not at all; the old url comes
    // back so it can be deleted once the save has landed — never before.
    const replaced = applyImageWriteback(example, image);

    return exampleRepository
        .save(example)
        .then((saved) =>
            enqueueIfImagePending(saved, EXAMPLE_IMAGE_COLLECTION, exampleRepository.writebackImage)
        )
        .then((saved) => imageStore.remove(replaced).then(() => saved))
        .then((saved) => {
            recordAudit(context, {
                action: exampleAuditActions.EXAMPLE_COVER_CHANGED,
                outcome: 'success',
                target_type: 'example',
                target_id: String(saved._id)
            });
            return presentWithOwner(saved);
        })
        .then((shaped) => generateSuccess(shaped, 200, t('example.cover-changed')));
};

/**
 * Replace an example's cover with this request's upload.
 *
 * @param id - the example's id
 * @param image - the image fields the upload middleware produced
 * @param context - the caller; they need `update` on the example
 * @returns 404 when the caller may not edit one by that id, 403 `OUTRANKED` for an owner at or
 *   above the caller, otherwise the example with its new cover
 */
export const setCover = (
    id: string,
    image: ImageChanges,
    context: CallerContext
): Promise<ResponseSuccess<Example> | ResponseReject> =>
    exampleRepository
        .findScoped(id, accessibleFilterFor(context.caller, 'Example', 'update'))
        .then((example) => {
            if (!example) return generateReject(404, [t('example.not-found')]);

            return outrankedRefusalFor(example, context).then(
                (outranked) => outranked ?? applyCover(example, image, context)
            );
        });
