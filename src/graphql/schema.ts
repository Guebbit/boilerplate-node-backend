/**
 * GraphQL SDL type definitions.
 * Covers the three main entities: Product, User, Order.
 */
export const typeDefs = /* GraphQL */ `
  # ── Shared ────────────────────────────────────────────────────────────────

  type PageMeta {
    page: Int!
    pageSize: Int!
    totalItems: Int!
    totalPages: Int!
  }

  # ── Product ───────────────────────────────────────────────────────────────

  type Product {
    id: ID!
    title: String!
    price: Float!
    description: String
    imageUrl: String
    active: Boolean
    createdAt: String
    updatedAt: String
    deletedAt: String
  }

  type ProductsResponse {
    items: [Product!]!
    meta: PageMeta!
  }

  # ── User ──────────────────────────────────────────────────────────────────

  type User {
    id: ID!
    email: String!
    username: String!
    imageUrl: String
    admin: Boolean!
    roles: [String!]!
    createdAt: String
    updatedAt: String
    deletedAt: String
  }

  type UsersResponse {
    items: [User!]!
    meta: PageMeta!
  }

  # ── Order ─────────────────────────────────────────────────────────────────

  type Order {
    id: ID!
    email: String!
    userId: ID!
    status: String
    totalItems: Int
    totalQuantity: Int
    totalPrice: Float
    createdAt: String
    updatedAt: String
  }

  type OrdersResponse {
    items: [Order!]!
    meta: PageMeta!
  }

  # ── Auth ──────────────────────────────────────────────────────────────────

  type AuthPayload {
    token: String!
  }

  # ── Inputs ────────────────────────────────────────────────────────────────

  input CartItemInput {
    productId: ID!
    quantity: Int!
  }

  # ── Queries ───────────────────────────────────────────────────────────────

  type Query {
    # Products (public)
    products(
      id: ID
      page: Int
      pageSize: Int
      text: String
      minPrice: Float
      maxPrice: Float
    ): ProductsResponse!

    product(id: ID!): Product

    # Current user profile (requires auth)
    me: User

    # Orders — all for admins, own orders for authenticated users
    orders(
      id: ID
      page: Int
      pageSize: Int
      userId: ID
      email: String
      productId: ID
    ): OrdersResponse!

    order(id: ID!): Order

    # Users — admin only
    users(
      id: ID
      page: Int
      pageSize: Int
      text: String
      email: String
      username: String
      active: Boolean
    ): UsersResponse!

    user(id: ID!): User
  }

  # ── Mutations ─────────────────────────────────────────────────────────────

  type Mutation {
    # Auth
    login(email: String!, password: String!): AuthPayload!
    signup(
      email: String!
      username: String!
      password: String!
      passwordConfirm: String!
      imageUrl: String
    ): User!

    # Products — admin only
    createProduct(
      title: String!
      price: Float!
      description: String
      imageUrl: String
      active: Boolean
    ): Product!

    updateProduct(
      id: ID!
      title: String
      price: Float
      description: String
      imageUrl: String
      active: Boolean
    ): Product!

    deleteProduct(id: ID!, hardDelete: Boolean): Boolean!

    # Orders — authenticated users
    createOrder(items: [CartItemInput!]!): Order!

    # Orders — admin only
    updateOrder(
      id: ID!
      status: String
      email: String
      userId: ID
      items: [CartItemInput!]
    ): Order!

    deleteOrder(id: ID!): Boolean!

    # Users — admin only
    createUser(
      email: String!
      username: String!
      password: String!
      admin: Boolean
      imageUrl: String
    ): User!

    updateUser(
      id: ID!
      email: String
      username: String
      password: String
      admin: Boolean
      imageUrl: String
    ): User!

    deleteUser(id: ID!, hardDelete: Boolean): Boolean!
  }
`;
