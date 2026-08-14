export interface SeedUser {
    id: string;
    username: string;
    email: string;
    /* Plaintext on purpose — the backend model's pre-save hook hashes it. A hash written here
     * would drift from that hook and its plaintext would be lost, which is exactly what once
     * happened to the `gino@pino.it` fixture. The frontend drops this field entirely. */
    password: string;
    admin: boolean;
    /* Path under the backend's `public/`. The frontend's MSW profile deliberately does NOT use
     * these — see the note in `mockProfiles.ts` — but they belong to the identity, so a drift in
     * what the backend serves is still visible in one `diff`. */
    imageUrl: string;
    cart: SeedCartItem[];
}

export const seedUsers: SeedUser[] = [
    {
        id: '65dd2bdb923652b7800fe180',
        username: 'root',
        email: SEED_ADMIN_EMAIL,
        password: SEED_ADMIN_PASSWORD,
        admin: true,
        imageUrl: '/images/seed/9726c4217f5998511f372afab4800ac8.jpg',
        cart: [
            { productId: '65dc8a99604c307b702b5ccc', quantity: 2 },
            { productId: '65dcdec2b18ad5e4bd597f0f', quantity: 3 }
        ]
    },
    {
        id: '65de646a44f861fd83c13f13',
        username: 'ginopinoshow',
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        admin: false,
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg',
        cart: []
    }
];
