/**
 * @module
 * The image half of a write, as the SERVER decides it — never as a client's body states it.
 */

/**
 * A request type with its wire `imageUrl` replaced by the server-decided one.
 *
 * On the wire `imageUrl` is `null` (remove) or absent; only the upload pipeline may name a path,
 * so the path arrives here as a string, after validation, from `readUploadedImage`.
 */
export type WithServerImage<TRequest> = Omit<TRequest, 'imageUrl'> & {
    /** The path the upload pipeline produced, `null` to remove the image, absent to leave it. */
    imageUrl?: string | null;
};
