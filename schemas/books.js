const gql = require("graphql-tag");
const { makeExecutableSchema } = require("graphql-tools");
const { find } = require("lodash");

const books = [
  {
    id: "Book/uuid-1",
    title: "First book",
    authorUuids: ["uuid-1", "uuid-2", "uuid-4"]
  },
  {
    id: "Book/uuid-2",
    title: "Second book",
    authorUuids: ["uuid-3", "uuid-4"]
  }
];

module.exports = function() {
  const typeDefs = gql`
    interface Node {
      id: ID!
    }

    type Book implements Node {
      id: ID!
      title: String!
      authorUuids: [String!]!
    }

    type Query {
      books: [Book!]!
      node(id: ID!): Node
    }
  `;

  const resolvers = {
    Query: {
      books: () => books,
      node: (parent, args) => find(books, book => book.id === args.id)
    },
    Node: { __resolveType: (obj, context, info) => "Book" }
  };

  return makeExecutableSchema({ typeDefs, resolvers });
};
