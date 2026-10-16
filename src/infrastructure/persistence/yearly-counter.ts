/**
 * @module
 * The yearly counter behind a `{year}-{sequence}` number: one document per year, bumped by one
 * atomic upsert. Order numbers and invoice numbers both use it; the two series differ in their
 * promises (gaps are fine for an order, illegal for an invoice), so each module owns its own
 * model and decides what `session` means for it.
 */

import type { ClientSession, Document, Model } from 'mongoose';

/** A counter document: its `_id` is the calendar year, `seq` the last number handed out. */
export interface YearlyCounterDocument extends Document<number> {
    seq: number;
}

/** How wide the sequence part of a printed number is padded, e.g. `000041`. */
const SEQUENCE_WIDTH = 6;

/**
 * Atomically take the next sequence number for `year`, creating the year's row on first use.
 * @param counterModel - the series' own counter collection
 * @param year - the calendar year the sequence belongs to
 * @param session - the transaction the number belongs to, so an abort gives it back
 * @returns the number just taken (1 for the year's first document)
 */
export const incrementYearlyCounter = (
    counterModel: Model<YearlyCounterDocument>,
    year: number,
    session?: ClientSession
): Promise<number> =>
    counterModel
        // Mongoose: `upsert` creates the year's row; `returnDocument: 'after'` returns the
        // incremented value rather than the pre-update one.
        // https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
        .findOneAndUpdate(
            { _id: year },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after', session }
        )
        .exec()
        .then((counter) => counter.seq);

/**
 * `{year}-{sequence}`, the sequence zero-padded to six digits.
 * @param year - the calendar year
 * @param sequence - the number {@link incrementYearlyCounter} returned
 */
export const formatYearlySequence = (year: number, sequence: number): string =>
    `${year}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`;
