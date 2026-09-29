/**
 * @module
 * Controllers for `PUT /account/addresses/:addressId` (replace) and
 * `PATCH /account/addresses/:addressId` (merge), built on the shared `createUpdateController`
 * factory.
 *
 * An entry the caller does not hold answers the same 404 as one that never existed: ownership is
 * checked in the service, and a distinguishable answer would confirm the id belongs to somebody.
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceAddressBody, UpdateAddressBody } from '@api/schemas.zod';
import { addressUpdate } from '../service';

/**
 * `PUT` and `PATCH /account/addresses/:addressId` — one handler pair over `addressUpdate`, which
 * answers the entry it wrote.
 */
export const { replace: replaceAddress, update: updateAddress } = createUpdateController({
    entity: 'address',
    replaceSchema: ReplaceAddressBody,
    patchSchema: UpdateAddressBody,
    // The param is `:addressId`, not the `:id` the factory would validate. No ObjectId check:
    // `updateEntry` matches entries by a plain string compare, so a malformed id misses every
    // entry and answers the ordinary 404. `String(...)`: Express types a param as
    // `string | string[]`, and this one never repeats.
    idFrom: (request) => String(request.params.addressId),
    update: (id, changes, request) => addressUpdate(request.authContext!.id, id, changes),
    present: (view) => view
});
