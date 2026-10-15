/**
 * @module
 * The image half of a write, as the SERVER decides it — never as a client's body states it.
 */

/**
 * The three fields an editable image occupies, all of which only the upload pipeline may set —
 * they change together, never independently.
 */
export interface ServerImageFields {
    /** The path the upload pipeline produced, `null` to remove the image, absent to leave it. */
    imageUrl?: string | null;
    /** Its thumbnail's path. `readOnly` on the contract: set only by the server. */
    thumbnailUrl?: string;
    /** Set alongside a new pending-image placeholder — see `readUploadedImage`. */
    pendingImageKey?: string;
}

/**
 * A request type with its image fields replaced by the server-decided ones.
 *
 * On the wire `imageUrl` is `null` (remove) or absent; only the upload pipeline may name a path,
 * so the path arrives here as a string, after validation, from `readUploadedImage`.
 */
export type WithServerImage<TRequest> = Omit<TRequest, keyof ServerImageFields> & ServerImageFields;
