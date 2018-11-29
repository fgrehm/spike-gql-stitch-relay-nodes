const { ApolloServer } = require("apollo-server");
const makeUnifiedSchema = require("./schemas/unified");

const schema = makeUnifiedSchema();
const server = new ApolloServer({ schema });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
