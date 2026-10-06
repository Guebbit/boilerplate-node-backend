/**
 * @module
 * Moves every order's encrypted addresses and notes onto the newest `NODE_PII_ENCRYPTION_KEY`.
 * Run by the ops script `reencrypt`; see `@infrastructure/security/reencrypt`.
 */

import type { EncryptedField } from '@infrastructure/security/reencrypt';
import { getPiiEncryptionKeyRing, piiBinding } from '@infrastructure/security/pii-encryption';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import { ADDRESS_FIELDS, ADDRESS_PATHS, addressAad, notesAad } from '../pii';

/** Every encrypted value one order holds, bound to its own `_id`. */
const fieldsOf = (order: OrderDocument): EncryptedField[] => {
    const id = String(order._id);
    const addresses = ADDRESS_PATHS.flatMap((path) =>
        ADDRESS_FIELDS.flatMap((field) => {
            const stored = order[path]?.[field];
            return stored === undefined
                ? []
                : [
                      {
                          path: `${path}.${field}`,
                          stored,
                          binding: piiBinding(addressAad(path, field, id)),
                          label: `orders.${path}.${field}`
                      }
                  ];
        })
    );
    const notes =
        order.notes === undefined
            ? []
            : [
                  {
                      path: 'notes',
                      stored: order.notes,
                      binding: piiBinding(notesAad(id)),
                      label: 'orders.notes'
                  }
              ];
    return [...addresses, ...notes];
};

/**
 * Re-encrypts every order's addresses and notes onto the newest PII key.
 *
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptOrders = (dryRun = false) =>
    orderRepository.reencrypt({ ring: getPiiEncryptionKeyRing(), fieldsOf }, dryRun);
