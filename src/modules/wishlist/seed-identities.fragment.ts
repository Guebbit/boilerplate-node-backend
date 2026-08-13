export interface ISeedWishlist {
    /** The owner — one of `seedUsers` by id. */
    userId: string;
    /* Product ids from `seedProducts`, saved without quantity — a wishlist answers "do I want
     * this", not "how many". Only publicly visible products appear here: a seeded line pointing
     * at the soft-deleted fixture would render as a hole in the storefront's wishlist page. */
    productIds: string[];
}

export const seedWishlists: ISeedWishlist[] = [
    {
        /* root — one saved product, enough for the admin account to show a non-empty page. */
        userId: '65dd2bdb923652b7800fe180',
        productIds: ['65dc9be92f2794d1c16741e1']
    },
    {
        /* ginopinoshow — two saved products, one of which also sits in no cart, so moving it to
         * the cart is a state change a demo can actually see. */
        userId: '65de646a44f861fd83c13f13',
        productIds: ['65dc8a99604c307b702b5ccc', '65dcdec2b18ad5e4bd597f0f']
    }
];
