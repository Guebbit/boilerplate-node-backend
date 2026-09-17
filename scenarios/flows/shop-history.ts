/**
 * @module
 * The `shop` scenario's order book, written by driving the application rather than by inserting
 * rows: every order below was placed at `POST /cart/checkout`, paid at `POST /payments/…`,
 * shipped through the lifecycle and — where the story calls for it — declined, refunded,
 * cancelled or deleted through the endpoint a person would use.
 *
 * What that buys, and what nothing written by hand can claim: the payments, stock movements,
 * reservations, shipments, audit entries and analytics events behind these orders are the real
 * ones, produced by the real code, and they stay right when that code changes.
 *
 * Runs ONCE per process — `src/app/demo.ts` keeps the result in memory and replays it on every
 * restore. See: docs/tools/demo-profile.md
 */

import {
    SEED_OWNER_EMAIL,
    SEED_OWNER_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_PASSWORD
} from '@scenarios/accounts';
import { SEED_PRODUCT_IDS } from '../subjects';
import { fillerProductId, openingStockFor, productFixtures } from '../products';
import { SEED_CUSTOMER_EMAILS, SEED_CUSTOMER_IDS } from '../users';
import { PLAIN_PASSWORD } from '@modules/users/factories';
import { signIn, type Caller } from './client';
import {
    advanceCourier,
    advanceOrder,
    cancelOrder,
    CARD,
    checkout,
    checkoutAndPay,
    hardDeleteProduct,
    openPayment,
    receiveStock,
    recordOfflinePayment,
    replaceProductImage,
    softDeleteOrder,
    submitCard,
    syncPayment,
    type Line
} from './actions';

/** What the flows produced: the guarantee-name → row-id map, and how far back each order sits. */
export interface ShopHistory {
    /** `order.paid`, `payment.refunded`, … — merged into `GET /__test/scenario`'s `subjects`. */
    subjects: Record<string, string>;

    /**
     * Order id → how many days the whole order moves back, itself and everything it produced.
     * `0` means today, which is where the two orders still holding stock have to stay.
     */
    ages: Record<string, number>;
}

/**
 * The oldest order in the shop, in days.
 *
 * Inside `NODE_AUDIT_RETENTION_DAYS` (90) on purpose: the audit trail is TTL-reaped on
 * `timestamp`, so an order backdated past the window would still be here with its own history
 * silently gone — a dataset that contradicts itself in the one screen that exists to explain it.
 */
const OLDEST_DAYS = 80;

/** One filler shopper's order: whose it is, and its lines as `[productIndex, quantity]` pairs. */
interface FillerOrder {
    customer: keyof typeof SEED_CUSTOMER_IDS;
    lines: [productIndex: number, quantity: number][];
}

/**
 * The customer base's own history — seven small shoppers with one modest order each, three
 * medium ones with two fuller orders apiece.
 *
 * Its job is VOLUME: the analytics and order-list screens need more than the handful of named
 * rows below to look like a shop rather than a fixture file. Each draws different rows from the
 * combinatorial catalogue so the ten don't all buy the same thing.
 */
const FILLER_ORDERS: FillerOrder[] = [
    { customer: 'amelia', lines: [[3, 1]] },
    { customer: 'benjamin', lines: [[15, 1]] },
    { customer: 'chloe', lines: [[27, 2]] },
    { customer: 'daniel', lines: [[42, 1]] },
    { customer: 'grace', lines: [[58, 1]] },
    { customer: 'felix', lines: [[71, 1]] },
    { customer: 'priya', lines: [[89, 2]] },
    {
        customer: 'marcus',
        lines: [
            [5, 2],
            [46, 1]
        ]
    },
    {
        customer: 'marcus',
        lines: [
            [63, 1],
            [97, 3],
            [112, 1]
        ]
    },
    {
        customer: 'harper',
        lines: [
            [8, 2],
            [50, 2]
        ]
    },
    {
        customer: 'harper',
        lines: [
            [70, 1],
            [99, 1],
            [120, 2]
        ]
    },
    {
        customer: 'isla',
        lines: [
            [12, 1],
            [40, 3]
        ]
    },
    {
        customer: 'isla',
        lines: [
            [66, 2],
            [95, 1],
            [118, 2]
        ]
    }
];

/**
 * The `customer` account's own three large orders — more lines and higher quantities than any
 * filler shopper's, so "this account has a long history" is a property of the data rather than a
 * claim. Stated as lines rather than as {@link FillerOrder}s because they mix named catalogue
 * rows with filler ones.
 */
const CUSTOMER_ORDERS: Line[][] = [
    [
        { productId: SEED_PRODUCT_IDS.dogFoodStandard, quantity: 3 },
        { productId: SEED_PRODUCT_IDS.dogBedPremium, quantity: 2 },
        { productId: fillerProductId(25), quantity: 4 },
        { productId: fillerProductId(77), quantity: 1 }
    ],
    [
        { productId: fillerProductId(9), quantity: 5 },
        { productId: fillerProductId(48), quantity: 2 },
        { productId: fillerProductId(101), quantity: 3 }
    ],
    [
        { productId: fillerProductId(31), quantity: 2 },
        { productId: fillerProductId(64), quantity: 6 },
        { productId: fillerProductId(110), quantity: 1 },
        { productId: fillerProductId(4), quantity: 2 }
    ]
];

/**
 * The baskets left sitting in the shop when the flows finish — `[whose, lines]`.
 *
 * Filled LAST, and through `POST /cart` like everything else here, for a reason that is not
 * stylistic: a checkout empties the cart it came from, so any cart written before these flows ran
 * would be gone by the time anyone looked. Only four people have one — absence and an empty cart
 * are the same state, so "has never added anything" is most of the customer base's fixture.
 */
const CARTS: [who: 'owner' | keyof typeof SEED_CUSTOMER_IDS, lines: Line[]][] = [
    [
        'owner',
        [
            { productId: SEED_PRODUCT_IDS.dogFoodStandard, quantity: 2 },
            { productId: SEED_PRODUCT_IDS.dogBedPremium, quantity: 3 }
        ]
    ],
    [
        'marcus',
        [
            { productId: fillerProductId(10), quantity: 2 },
            { productId: fillerProductId(34), quantity: 1 }
        ]
    ],
    [
        'harper',
        [
            { productId: fillerProductId(58), quantity: 1 },
            { productId: fillerProductId(82), quantity: 3 }
        ]
    ],
    [
        'isla',
        [
            { productId: fillerProductId(20), quantity: 2 },
            { productId: fillerProductId(106), quantity: 1 }
        ]
    ]
];

/** The named rows' lines, small enough that any one product's shelf can carry all of them. */
const DOG_FOOD = (quantity: number): Line[] => [
    { productId: SEED_PRODUCT_IDS.dogFoodStandard, quantity }
];

/** Every line every flow below will buy — the demand the opening receipts have to cover. */
const plannedDemand = (): Map<string, number> => {
    const demand = new Map<string, number>();
    const add = ({ productId, quantity }: Line) =>
        demand.set(productId, (demand.get(productId) ?? 0) + quantity);

    for (const { lines } of FILLER_ORDERS)
        for (const [index, quantity] of lines) add({ productId: fillerProductId(index), quantity });
    for (const lines of CUSTOMER_ORDERS) for (const line of lines) add(line);
    // The named rows below, in the order they appear: nine dog-food orders and the one big bed
    // order. Overstated rather than counted line by line — a shelf with spare units on it is a
    // shop, and a shelf one unit short is a checkout that fails three hundred requests into a boot.
    add({ productId: SEED_PRODUCT_IDS.dogFoodStandard, quantity: 40 });
    add({ productId: SEED_PRODUCT_IDS.dogBedPremium, quantity: 30 });
    // The three `current`-image demo rows below, each bought alone once and again inside
    // `order.mixedImageStates` — two units apiece.
    for (const index of [121, 122, 123]) add({ productId: fillerProductId(index), quantity: 2 });

    return demand;
};

/**
 * Put every product's opening stock on the shelf — `POST /inventory/receipts`, before anyone can
 * buy anything, since the catalogue seeds at `onHand: 0`.
 *
 * Each receipt is the catalogue's own opening figure PLUS what the flows are about to buy, so a
 * shelf is never left at the figure `scenarios/products.ts` describes MINUS a history — which
 * would be the one number in the shop nothing explains. The named rows' demand is overstated (see
 * {@link plannedDemand}), so theirs settle a little above their figure rather than exactly on it.
 *
 * The out-of-stock subject gets no receipt at all — that is the whole reason it is in the
 * catalogue.
 *
 * @param owner - a caller holding `inventory.any.create`
 */
const openEveryShelf = async (owner: Caller): Promise<void> => {
    const demand = plannedDemand();

    for (const product of productFixtures) {
        const productId = product._id.toString();
        if (productId === SEED_PRODUCT_IDS.scratchPostOutOfStock) continue;

        const quantity = openingStockFor(productId) + (demand.get(productId) ?? 0);
        if (quantity > 0) await receiveStock(owner, productId, quantity);
    }
};

/**
 * Sign in every filler shopper at once.
 *
 * Concurrent, unlike everything else here: each login is a bcrypt cost-12 comparison, and ten of
 * them in series is most of what this runner costs. Nothing they do afterwards is concurrent —
 * the story's order is the point.
 */
const signInCustomerBase = (baseUrl: string): Promise<Map<string, Caller>> =>
    Promise.all(
        Object.entries(SEED_CUSTOMER_EMAILS).map(([key, email]) =>
            signIn(baseUrl, email, PLAIN_PASSWORD).then((caller): [string, Caller] => [key, caller])
        )
    ).then((entries) => new Map(entries));

/**
 * The two catalogue edits the audit trail exists to show: a price, and a dictionary entry.
 *
 * Runs after every order — an operator edits a shop that already has customers, and an audit row
 * dated before the orders it sits among would read as a shop edited before it opened.
 */
const driveCatalogueEdits = async (owner: Caller): Promise<void> => {
    await owner.call('PATCH', `/products/${SEED_PRODUCT_IDS.dogFoodStandard}`, {
        // A price change is the edit an operator makes most, and the one an audit reader most
        // wants to see a trail for.
        price: 71
    });

    // `scenarios/locales.ts`'s Italian override of a key that really exists for `it`.
    await owner.call('PUT', '/locales/it/entries/65e0200a9a7d4b2e1c0f3101', {
        value: 'Sessione scaduta. Effettua di nuovo l’accesso.'
    });
};

/**
 * Ban `marcus`, so the trail carries the one action a moderator screen exists for.
 *
 * Last of all, and after every shopper has signed out: he places two of the orders above, and a
 * banned account cannot use the session it placed them with.
 *
 * `PUT /users/{id}` validates the whole identity rather than the field being changed, so the row
 * is read back first — which is also what an admin screen does before it saves.
 */
const banOneCustomer = async (owner: Caller): Promise<void> => {
    const banned = await owner.call<{ username: string; email: string }>(
        'GET',
        `/users/${SEED_CUSTOMER_IDS.marcus}`
    );
    await owner.call('PUT', `/users/${SEED_CUSTOMER_IDS.marcus}`, {
        username: banned.username,
        email: banned.email,
        active: false
    });
};

/**
 * Every caller signs out of every device — `POST /account/logout-all`.
 *
 * Not housekeeping: a login writes a refresh token onto the user document, and twelve accounts
 * signed in at build time would ship twelve phantom sessions in the demo dataset. They are an
 * artifact of HOW the shop was built, not part of the story it tells — the customer who ordered
 * in March is not still logged in — and the paired frontend's sessions screen counts what it
 * finds.
 */
const signOutEveryone = (callers: Caller[]): Promise<void> =>
    Promise.all(callers.map((caller) => caller.call('POST', '/account/logout-all'))).then(
        () => undefined
    );

/**
 * The signed-in caller shopping as `who` — the customer base's own entry, or `owner` for the one
 * basket that belongs to the shop owner.
 *
 * A throw rather than a silent skip: a name with no session behind it means this file and
 * `scenarios/users.ts` have drifted, and an order quietly never placed would surface weeks later
 * as a missing row with nothing pointing at the cause.
 *
 * @param base - every filler shopper, as {@link signInCustomerBase} signed them in
 * @param owner - the shop owner's own caller
 * @param who - a `SEED_CUSTOMER_IDS` key, or `'owner'`
 * @throws {Error} when nothing signed in under that name
 */
const shopperFor = (base: ReadonlyMap<string, Caller>, owner: Caller, who: string): Caller => {
    const shopper = who === 'owner' ? owner : base.get(who);
    if (!shopper) throw new Error(`shop history: no signed-in caller for "${who}"`);

    return shopper;
};

/**
 * Refuse to seed a shop the `order.awaitingTransfer` guarantee cannot hold in.
 *
 * Bank transfer is offered only once the deployment names a beneficiary and an IBAN
 * (`src/infrastructure/adapters/bank-transfer.ts`), and the `shop` scenario declares a row that
 * needs it — so an unconfigured deployment has to fail here, naming the two variables, rather
 * than three hundred requests later on a 409 that says `CART_PAYMENT_METHOD_NOT_AVAILABLE`.
 *
 * @throws {Error} when `GET /payments/methods` does not offer `bank_transfer`
 */
const requireBankTransfer = (owner: Caller): Promise<void> =>
    owner.call<{ methods: { id: string }[] }>('GET', '/payments/methods').then(({ methods }) => {
        if (methods.some((method) => method.id === 'bank_transfer')) return;
        throw new Error(
            'the shop scenario needs bank transfer offered — set NODE_BANK_TRANSFER_BENEFICIARY and NODE_BANK_TRANSFER_IBAN'
        );
    });

/**
 * Drive the whole history against a running app, oldest row first.
 *
 * The ORDER of what follows is the specification: `POST /delivery/advance` is one global tick
 * with no body, so an order meant to stay in transit has to be shipped after the tick that
 * delivered the rest. The same reasoning puts the ban last.
 *
 * @param baseUrl - a listening app, without a trailing slash
 * @returns the subject ids and per-order ages the backdating pass needs
 * @throws {ScenarioFlowError} on any call that should have succeeded and did not
 */
export const driveShopHistory = async (baseUrl: string): Promise<ShopHistory> => {
    const owner = await signIn(baseUrl, SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD);
    const customer = await signIn(baseUrl, SEED_USER_EMAIL, SEED_USER_PASSWORD);

    await requireBankTransfer(owner);
    await openEveryShelf(owner);

    const subjects: Record<string, string> = {};

    /*
     * Every order that will be moved into the past, in the sequence it was placed — which is what
     * lets the ages below run oldest to newest, so the shop's history reads as a shop's does: a
     * steady trickle rather than everything on one afternoon. The two orders still holding stock
     * never pass through here and stay dated today.
     */
    const placed: string[] = [];
    const dated = (orderId: string): string => {
        placed.push(orderId);
        return orderId;
    };

    // ── The customer base's volume, and the `customer` account's own long history ──────────────
    const base = await signInCustomerBase(baseUrl);
    for (const { customer: who, lines } of FILLER_ORDERS) {
        const orderId = dated(
            await checkoutAndPay(
                shopperFor(base, owner, who),
                lines.map(([index, quantity]) => ({ productId: fillerProductId(index), quantity }))
            )
        );
        await advanceOrder(owner, orderId, ['processing', 'shipped']);
    }

    for (const lines of CUSTOMER_ORDERS) {
        const orderId = dated(await checkoutAndPay(customer, lines));
        await advanceOrder(owner, orderId, ['processing', 'shipped']);
    }

    // The one named row that has to be delivered rather than in transit — placed before the tick.
    subjects['order.delivered'] = dated(await checkoutAndPay(customer, DOG_FOOD(1)));
    await advanceOrder(owner, subjects['order.delivered'], ['processing', 'shipped']);

    // One tick delivers every parcel above. Everything shipped after this line stays in transit.
    await advanceCourier(owner);

    // ── The named rows, each a branch the storefront or the admin actually has a screen for ────
    subjects['order.paid'] = dated(await checkoutAndPay(customer, DOG_FOOD(2)));

    // A card refused, then the same order paid with another — the retry the payment form offers.
    const retried = dated(await checkout(customer, DOG_FOOD(1)));
    const retriedPayment = await openPayment(customer, retried);
    await submitCard(customer, retriedPayment, CARD.declined);
    await submitCard(customer, retriedPayment, CARD.visa);

    // A 3-D Secure challenge: `requires_action`, finished at the provider, then reported back.
    const challenged = dated(await checkout(customer, DOG_FOOD(1)));
    const challengedPayment = await openPayment(customer, challenged);
    await submitCard(customer, challengedPayment, CARD.challenge);
    await syncPayment(customer, challengedPayment);

    // Cancelled by the customer before paying — the stock comes back.
    subjects['order.cancelled'] = dated(await checkout(customer, DOG_FOOD(2)));
    await cancelOrder(customer, subjects['order.cancelled']);

    /*
     * Paid, then cancelled by the operator: `payments` hears `ORDER_CANCELLED` and returns it.
     * The subject is the ORDER's id, not the payment's, because `GET /payments/order/{orderId}`
     * is the only way to read a payment back — a payment id would name a row nothing can fetch.
     */
    subjects['payment.refunded'] = dated(await checkoutAndPay(customer, DOG_FOOD(1)));
    await cancelOrder(owner, subjects['payment.refunded']);

    /*
     * The soft-deleted order sits on the NON-admin account on purpose: the case it exercises is
     * "the owner cannot see their own soft-deleted order", which ownership-only scoping would
     * wrongly allow and an admin-owned row could never catch.
     */
    subjects['order.softDeleted'] = dated(await checkoutAndPay(customer, DOG_FOOD(1)));
    await softDeleteOrder(owner, subjects['order.softDeleted']);

    // Money that arrived at the counter — recorded by hand, settled through the same path a card
    // payment takes.
    subjects['order.paidOffline'] = dated(await checkout(customer, DOG_FOOD(1)));
    await recordOfflinePayment(owner, subjects['order.paidOffline'], 'cash');

    /*
     * The owner's own shipped order, placed last of the dated rows so the courier tick above has
     * already been and gone — this is the one parcel in transit. `standard` shipping against a
     * basket well over the free-above threshold, so what it froze is 0 rather than the rate card.
     */
    subjects['order.shipped'] = dated(
        await checkout(owner, [{ productId: SEED_PRODUCT_IDS.dogBedPremium, quantity: 20 }], {
            shippingMethodId: 'standard'
        })
    );
    await submitCard(owner, await openPayment(owner, subjects['order.shipped']), CARD.visa);
    await advanceOrder(owner, subjects['order.shipped'], ['processing', 'shipped']);

    /*
     * SECURITY_HOLES_7_STORAGE_QUOTA (decision 2): an order line resolves its picture LIVE
     * against the catalogue product it still names, never a frozen one — so the branch that
     * matters here is what happened to the CATALOGUE ROW after these were bought, not the order.
     * Three products, three fates, plus one order that buys all three at once so a single
     * response shows every branch side by side. The catalogue edits run AFTER every checkout
     * below, so none of these orders is placed against an already-deleted product.
     */
    subjects['order.imageUnchanged'] = dated(
        await checkoutAndPay(customer, [{ productId: fillerProductId(121), quantity: 1 }])
    );
    subjects['order.imageReplaced'] = dated(
        await checkoutAndPay(customer, [{ productId: fillerProductId(122), quantity: 1 }])
    );
    subjects['order.productDeleted'] = dated(
        await checkoutAndPay(customer, [{ productId: fillerProductId(123), quantity: 1 }])
    );
    subjects['order.mixedImageStates'] = dated(
        await checkoutAndPay(customer, [
            { productId: fillerProductId(121), quantity: 1 },
            { productId: fillerProductId(122), quantity: 1 },
            { productId: fillerProductId(123), quantity: 1 }
        ])
    );
    // 121 gets no edit at all — `order.imageUnchanged` is the control the other two contrast with.
    await replaceProductImage(
        owner,
        fillerProductId(122),
        '/images/system/placeholder-product.png'
    );
    await hardDeleteProduct(owner, fillerProductId(123));

    /*
     * The two rows that stay dated TODAY, because both are still holding stock against a
     * deadline: backdating either would leave a hold that expired before the shop opened.
     */
    subjects['order.ownerPending'] = await checkout(owner, DOG_FOOD(2));
    subjects['order.awaitingTransfer'] = await checkout(customer, DOG_FOOD(1), {
        paymentMethod: 'bank_transfer'
    });

    /* The baskets people are still shopping with — after every checkout, which empties one. */
    for (const [who, lines] of CARTS) {
        const shopper = shopperFor(base, owner, who);
        for (const line of lines) await shopper.call('POST', '/cart', line);
    }

    await driveCatalogueEdits(owner);

    /*
     * Everyone signs out, then the owner bans `marcus` and signs out himself. The ORDER is the
     * point: a ban lands on an account that is no longer holding a session, and the owner is the
     * last one able to act.
     */
    await signOutEveryone([customer, ...base.values()]);
    await banOneCustomer(owner);
    await signOutEveryone([owner]);

    /* Spread the placed orders evenly from `OLDEST_DAYS` ago up to yesterday. */
    const ages = Object.fromEntries(
        placed.map((orderId, index) => [
            orderId,
            Math.round(OLDEST_DAYS * (1 - index / placed.length))
        ])
    );

    return { subjects, ages };
};
