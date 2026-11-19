/**
 * @module
 * Moves every order's encrypted addresses and notes, and every timeline staff note, onto the newest
 * `NODE_PII_ENCRYPTION_KEY`.
 * Run by the ops script `reencrypt`; see `@infrastructure/security/reencrypt`.
 */

import { mergeReports, type EncryptedField } from '@infrastructure/security/reencrypt';
import { getPiiEncryptionKeyRing, piiBinding } from '@infrastructure/security/pii-encryption';
import type { OrderBillingAddress } from '@types';
import type { OrderDocument, OrderEventDocument } from '../model';
import { orderEventRepository, orderRepository } from '../repository';
import { ADDRESS_PATHS, addressAad, addressFieldsOf, notesAad, timelineNoteAad } from '../pii';

/** Every encrypted value one order holds, bound to its own `_id`. */
const fieldsOf = (order: OrderDocument): EncryptedField[] => {
    const id = String(order._id);
    const addresses = ADDRESS_PATHS.flatMap((path) =>
        addressFieldsOf(path).flatMap((field) => {
            // `vatNumber` is on the billing address only; `addressFieldsOf` hands it to that path alone.
            // Widened to the billing shape: it alone can hold a `vatNumber`, and `addressFieldsOf` asks for one only on that path.
            const address: OrderBillingAddress | undefined = order[path];
            const stored = address?.[field];
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

/** The one encrypted value a staff note holds, bound to the order it is on. */
const noteFieldsOf = (event: OrderEventDocument): EncryptedField[] =>
    event.text === undefined
        ? []
        : [
              {
                  path: 'text',
                  stored: event.text,
                  binding: piiBinding(timelineNoteAad(String(event.orderId))),
                  label: 'orderevents.text'
              }
          ];

/**
 * Re-encrypts every order's addresses and notes, and every staff note on a timeline, onto the
 * newest PII key. Only `note_added` text is ciphertext: an override's reason is stored as written.
 *
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptOrders = (dryRun = false) =>
    orderRepository
        .reencrypt({ ring: getPiiEncryptionKeyRing(), fieldsOf }, dryRun)
        .then((orders) =>
            orderEventRepository
                .reencrypt(
                    {
                        ring: getPiiEncryptionKeyRing(),
                        filter: { type: 'note_added', text: { $exists: true } },
                        fieldsOf: noteFieldsOf
                    },
                    dryRun
                )
                .then((notes) => mergeReports(orders, notes))
        );
