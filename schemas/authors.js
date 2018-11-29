const gql = require("graphql-tag");
const { makeExecutableSchema } = require("graphql-tools");
const { find, filter, includes } = require("lodash");

const authors = [
  { id: "Author/uuid-1", uuid: "uuid-1", name: "Author one" },
  { id: "Author/uuid-2", uuid: "uuid-2", name: "Author two" },
  { id: "Author/uuid-3", uuid: "uuid-3", name: "Author three" },
  { id: "Author/uuid-4", uuid: "uuid-4", name: "Author four" }
];

module.exports = function() {
  const typeDefs = gql`
    interface Node {
      id: ID!
    }

    type Author implements Node {
      id: ID!
      name: String!
    }

    type Query {
      authorsByUuids(uuids: [String!]!): [Author!]!
      node(id: ID!): Node
    }
  `;

  const resolvers = {
    Query: {
      node: (parent, args) => find(authors, author => author.id === args.id),
      authorsByUuids: (parent, args) =>
        filter(authors, author => includes(args.uuids, author.uuid))
    },
    Node: { __resolveType: (obj, context, info) => "Author" }
  };

  return makeExecutableSchema({ typeDefs, resolvers });
};
