/**
 * @module
 * Moves the address copy on every shipment onto the newest `NODE_PII_ENCRYPTION_KEY`. Run by the
 * ops script `reencrypt`; see `@infrastructure/security/reencrypt`.
 */

import type { EncryptedField } from '@infrastructure/security/reencrypt';
import { getPiiEncryptionKeyRing, piiBinding } from '@infrastructure/security/pii-encryption';
import type { ShipmentDocument } from '../model';
import { shipmentRepository } from '../repository';
import { DESTINATION_FIELDS, destinationAad } from '../pii';

/** The encrypted values of one shipment's `destination`, bound to the shipment's own `_id`. */
const fieldsOf = (shipment: ShipmentDocument): EncryptedField[] =>
    DESTINATION_FIELDS.flatMap((field) => {
        const stored = shipment.destination?.[field];
        return stored === undefined
            ? []
            : [
                  {
                      path: `destination.${field}`,
                      stored,
                      binding: piiBinding(destinationAad(field, String(shipment._id))),
                      label: `delivery.shipments.destination.${field}`
                  }
              ];
    });

/**
 * Re-encrypts every shipment's destination onto the newest PII key.
 *
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptShipments = (dryRun = false) =>
    shipmentRepository.reencrypt(
        { filter: { destination: { $exists: true } }, ring: getPiiEncryptionKeyRing(), fieldsOf },
        dryRun
    );
