import { mergeResolvers } from "@graphql-tools/merge";
import apparelResolvers from "./apparel";
import authResolvers from "./auth";
import calendarResolvers from "./calendar";
import contentResolvers from "./content";
import coreResolvers from "./core";
import homeResolvers from "./home";
import userResolvers from "./user";
import virtualTryOnResolvers from "./virtualTryOn";
import outfitResolvers from "./outfit";
import { outfitChatResolvers } from "./outfitChat";
import langgraphChatResolvers from "./langgraphChat";
import notificationResolvers from "./notification";

// Combine all resolver objects
const allResolvers = [
  coreResolvers,
  authResolvers,
  userResolvers,
  apparelResolvers,
  calendarResolvers,
  contentResolvers,
  homeResolvers,
  virtualTryOnResolvers,
  outfitResolvers,
  outfitChatResolvers,
  langgraphChatResolvers,
  notificationResolvers,
];

// Merge all resolvers into a single resolver object
const resolvers = mergeResolvers(allResolvers);

export { allResolvers, resolvers };
export default resolvers;
