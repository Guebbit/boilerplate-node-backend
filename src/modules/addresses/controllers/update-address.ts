/**
 * @module
 * Controllers for `PUT /account/addresses/:addressId` (replace) and
 * `PATCH /account/addresses/:addressId` (merge) — AUDIT_0924 D17d, built on the shared
 * `createUpdateController` factory.
 *
 * An entry the caller does not hold answers the same 404 as one that never existed: ownership is
 * checked in the service, and a distinguishable answer would confirm the id belongs to somebody.
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceAddressBody, UpdateAddressBody } from '@api/schemas.zod';
import { addressUpdate } from '../service';
import { addressesAuditActions } from '../audit';

export const { replace: replaceAddress, patch: patchAddress } = createUpdateController({
    entity: 'address',
    replaceSchema: ReplaceAddressBody,
    patchSchema: UpdateAddressBody,
    writableFields: Object.keys(ReplaceAddressBody.shape),
    // Unlike users/account/products, `addressUpdate` (service.ts) never self-audits — passing
    // this is the DM2 carve-out's OTHER branch: the factory records the generic entry itself,
    // since nothing else here would.
    auditAction: addressesAuditActions.AUTH_ADDRESS_BOOK_ENTRY_UPDATED,
    // The path param is `:addressId`, not the `:id` `extractAndValidateId` assumes — same
    // opt-out `/account` uses (DM3, DECISION_MADE.md), for a different reason. No ObjectId
    // format check here, matching the pre-existing behaviour: `updateEntry` matches entries by a
    // plain string compare (`String(item._id) === addressId`), so a malformed id already misses
    // every entry and falls out through the ordinary 404, never a Mongo CastError.
    // `String(...)`: Express types every param as `string | string[]` (a route CAN repeat a
    // segment), but this one never does — narrows the same way every other id-reading controller
    // in this repo already does.
    idFrom: (request) => String(request.params.addressId),
    update: (id, changes, request) => addressUpdate(request.authContext!.id, id, changes),
    present: (view) => view,
    notFoundKey: 'addresses.not-found'
});
