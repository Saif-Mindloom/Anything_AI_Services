import {
  deleteApparelMutation,
  getUserApparelByIdQuery,
  getUserApparelsQuery,
  updateApparelMutation,
  searchApparelsQuery,
  getFilteredUserApparelsQuery,
  getUserWardrobeColorsQuery,
} from "../services/apparelService";

const apparelResolvers = {
  Query: {
    getUserApparels: getUserApparelsQuery,
    getUserApparelById: getUserApparelByIdQuery,
    searchApparels: searchApparelsQuery,
    getFilteredUserApparels: getFilteredUserApparelsQuery,
    getUserWardrobeColors: getUserWardrobeColorsQuery,
  },

  Mutation: {
    updateApparel: updateApparelMutation,
    deleteApparel: deleteApparelMutation,
  },
};

export default apparelResolvers;
