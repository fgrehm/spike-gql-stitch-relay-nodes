const gql = require("graphql-tag");

const { addMiddleware } = require("graphql-add-middleware");

const { includes, forEach, map } = require("lodash");

const {
  mergeSchemas,
  transformSchema,
  RenameTypes,
  FilterRootFields,
  RenameRootFields
} = require("graphql-tools");

const makeAuthorsSchema = require("./authors");
const makeBooksSchema = require("./books");

/*****************************************************************************
 * Transformations
 * 1. Remove top level `nodes` field
 * 2. Prefix `node` field so we can reuse internally & also avoid conflicts
 * 3. Prefix types to avoid potential conflicts
 *****************************************************************************/

function transformSchemaForStitching(schema, prefixNode, prefixTypes) {
  return transformSchema(schema, [
    new FilterRootFields((operation, rootField) => rootField != "nodes"),
    new RenameRootFields((operation, rootFieldName) =>
      rootFieldName == "node" ? `${prefixNode}Node` : rootFieldName
    ),
    new RenameTypes(name =>
      includes(["ID", "Node"], name) ? name : `${prefixTypes}_${name}`
    )
  ]);
}

/*****************************************************************************
 * Merge schemas together and apply extensions
 *****************************************************************************/

function stitchSchemas({
  transformedAuthorsSchema,
  transformedBooksSchema,
  extensions
}) {
  return mergeSchemas({
    schemas: [transformedAuthorsSchema, transformedBooksSchema, extensions],
    resolvers: {
      Query: {
        // Our hand made node lookup, using an urn scheme
        node: {
          resolve: (parent, args, context, info) => {
            const matches = args.id.match(/^urn:ORG_NAMESPACE:(\w+)\/(.+)$/);
            if (matches == null)
              throw new Error(`Invalid ID provided: ${args.id}`);

            const [, schemaName, id] = matches;

            // I tried delegating to the original schema instead of delegating to
            // the merged schema itself but things get really messed up and
            // queries might not work depending on context (`Query.node` vs
            // `Query.books` for example).
            // Best / most robust solution I could come up with was to alias
            // `node` fields and delegate back to the stitched schema, that way
            // transforms are always applied correctly and all the queries I
            // tested worked fine.
            let fieldName;
            switch (schemaName) {
              case "books":
              case "authors":
                fieldName = `${schemaName}Node`;
                break;
              default:
                throw new Error(`Invalid schema provided ${schemaName}`);
            }

            return info.mergeInfo.delegateToSchema({
              schema: info.schema,
              fieldName,
              args: { id },
              context,
              info
            });
          }
        },
        nodes: {
          resolve: (parent, args, context, info) => {
            return Promise.all(
              map(args.ids, id => {
                // Delegates to "self" in order to reuse the logic above
                return info.mergeInfo.delegateToSchema({
                  schema: info.schema,
                  fieldName: "node",
                  args: { id },
                  context,
                  info
                });
              })
            );
          }
        }
      },
      Books_Book: {
        authors: {
          fragment: "... on Books_Book { authorUuids }",
          resolve: (parent, args, context, info) => {
            return info.mergeInfo.delegateToSchema({
              schema: transformedAuthorsSchema,
              fieldName: "authorsByUuids",
              args: { uuids: parent.authorUuids },
              context,
              info,
              transforms: transformedAuthorsSchema.transforms
            });
          }
        }
      }
    }
  });
}

/*****************************************************************************
 * Make the `urn:` scheme transparent to child schemas
 *****************************************************************************/

function prefixNodeIds(originalSchema, mergedSchema, prefix) {
  const nodeImplementations = originalSchema.getPossibleTypes(
    originalSchema.getTypeMap().Node
  );
  forEach(nodeImplementations, type => {
    addMiddleware(mergedSchema, `${type.name}.id`, async function(
      root,
      args,
      context,
      info,
      next
    ) {
      let nodeId = await next();
      if (nodeId.match(/^urn/)) return nodeId;
      return `urn:ORG_NAMESPACE:${prefix}/${nodeId}`;
    });
  });
}

/*****************************************************************************
 * Unify everything
 *****************************************************************************/

module.exports = function() {
  const booksSchema = makeBooksSchema();
  const transformedBooksSchema = transformSchemaForStitching(
    booksSchema,
    "books",
    "Books"
  );

  const authorsSchema = makeAuthorsSchema();
  const transformedAuthorsSchema = transformSchemaForStitching(
    authorsSchema,
    "authors",
    "Authors"
  );

  const extensions = gql`
    extend type Books_Book {
      # Join data from books schema with the data in authors
      authors: [Authors_Author!]!
    }
    extend type Query {
      # "Generic" nodes interface
      node(id: ID!): Node
      nodes(ids: [ID!]!): [Node]!
    }
  `;

  const stitchedSchema = stitchSchemas({
    transformedAuthorsSchema,
    transformedBooksSchema,
    extensions
  });

  // Hide `booksNode` and `authorsNode` fields from clients since it's an
  // internal implementation detail
  const finalSchema = transformSchema(stitchedSchema, [
    new FilterRootFields(
      (operation, rootField) => rootField.match(/\w+Node$/) == null
    )
  ]);

  prefixNodeIds(transformedBooksSchema, finalSchema, "books");
  prefixNodeIds(transformedAuthorsSchema, finalSchema, "authors");

  return finalSchema;
};
