import { virtualTryOnMutation } from "../services/virtualTryOnService";

const virtualTryOnResolvers = {
  Mutation: {
    virtualTryOn: virtualTryOnMutation,
  },
};

export default virtualTryOnResolvers;
