import {
  setOutfitVisibilityMutation,
  generateOutfitAnglesMutation,
  queueOutfitAnglesMutation,
  getOutfitDetailsQuery,
  getFavouritedOutfitsQuery,
  toggleOutfitFavouriteMutation,
  deleteOutfitMutation,
  getVisibleOutfitsQuery,
  getOutfitDetailsForMCP,
  generateAccessoriesMutation,
  getOutfitAccessoriesQuery,
  testGenerateOutfitCompositeMutation,
  testAccessoryTryOnMutation,
} from "../services/outfitService";
import { shuffleOutfitMutation } from "../services/shuffleService";

const outfitResolvers = {
  Query: {
    getOutfitDetails: getOutfitDetailsQuery,
    getFavouritedOutfits: getFavouritedOutfitsQuery,
    getVisibleOutfits: getVisibleOutfitsQuery,
    getOutfitDetailsForMCP: getOutfitDetailsForMCP,
    getOutfitAccessories: getOutfitAccessoriesQuery,
  },
  Mutation: {
    setOutfitVisibility: setOutfitVisibilityMutation,
    generateOutfitAngles: generateOutfitAnglesMutation,
    queueOutfitAngles: queueOutfitAnglesMutation,
    toggleOutfitFavourite: toggleOutfitFavouriteMutation,
    deleteOutfit: deleteOutfitMutation,
    generateAccessories: generateAccessoriesMutation,
    shuffleOutfit: shuffleOutfitMutation,
    testGenerateOutfitComposite: testGenerateOutfitCompositeMutation,
    testAccessoryTryOn: testAccessoryTryOnMutation,
  },
};

export default outfitResolvers;
