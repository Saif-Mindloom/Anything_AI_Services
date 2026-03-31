import "graphql-import-node";
import root from "./root.graphql";
import core from "./core.graphql";
import auth from "./auth.graphql";
import user from "./user.graphql";
import apparel from "./apparel.graphql";
import calendar from "./calendar.graphql";
import content from "./content.graphql";
import home from "./home.graphql";
import virtualTryOn from "./virtualTryOn.graphql";
import outfit from "./outfit.graphql";
import outfitChat from "./outfitChat.graphql";
import langgraphChat from "./langgraphChat.graphql";

import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLSchema } from "graphql";
import resolvers from "../resolvers";

// Export the type definitions array for backward compatibility
export const typeDefs = [
  root,
  core,
  auth,
  user,
  apparel,
  calendar,
  content,
  home,
  virtualTryOn,
  outfit,
  outfitChat,
  langgraphChat,
];

// Export the executable schema
const schema: GraphQLSchema = makeExecutableSchema({
  typeDefs,
  resolvers: resolvers,
});

export default schema;
