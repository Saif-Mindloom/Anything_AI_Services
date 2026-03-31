/**
 * Frontend GraphQL Queries and Mutations
 * 
 * Copy this file to your frontend project and import the queries you need.
 * Works with Apollo Client, urql, or any GraphQL client.
 * 
 * Installation:
 * npm install @apollo/client graphql
 * 
 * or
 * 
 * npm install urql graphql
 */

import { gql } from '@apollo/client'; // or from 'graphql-tag'

// ============================================
// OUTFIT QUERIES
// ============================================

/**
 * Get detailed information about a specific outfit including rating
 */
export const GET_OUTFIT_DETAILS = gql`
  query GetOutfitDetails($outfitId: Int!) {
    getOutfitDetails(outfitId: $outfitId) {
      success
      message
      outfit {
        id
        outfitUid
        topId
        bottomId
        shoeId
        dressId
        primaryImageUrl
        gsUtil
        imageList
        rating
        poseLeft
        poseRight
      }
    }
  }
`;

/**
 * Get all visible outfits for the current user
 */
export const GET_VISIBLE_OUTFITS = gql`
  query GetVisibleOutfits {
    getVisibleOutfits {
      success
      message
      outfits {
        id
        outfitUid
        url
      }
    }
  }
`;

/**
 * Get all favorited outfits for the current user
 */
export const GET_FAVOURITED_OUTFITS = gql`
  query GetFavouritedOutfits {
    getFavouritedOutfits {
      success
      message
      outfits {
        id
        outfitUid
        primaryImageUrl
      }
    }
  }
`;

// ============================================
// OUTFIT MUTATIONS
// ============================================

/**
 * Generate multiple angle views for an outfit
 * This also triggers the n8n rating webhook automatically
 * 
 * Note: This operation takes 1-2 minutes to complete
 */
export const GENERATE_OUTFIT_ANGLES = gql`
  mutation GenerateOutfitAngles($outfitId: Int!) {
    generateOutfitAngles(outfitId: $outfitId) {
      success
      message
      anglesGenerated
    }
  }
`;

/**
 * Toggle the visibility of an outfit
 */
export const SET_OUTFIT_VISIBILITY = gql`
  mutation SetOutfitVisibility($outfitId: Int!) {
    setOutfitVisibility(outfitId: $outfitId) {
      success
      message
    }
  }
`;

/**
 * Toggle favorite status of an outfit
 */
export const TOGGLE_OUTFIT_FAVOURITE = gql`
  mutation ToggleOutfitFavourite($outfitId: Int!) {
    toggleOutfitFavourite(outfitId: $outfitId) {
      success
      message
      isFavourite
    }
  }
`;

// ============================================
// USAGE EXAMPLES
// ============================================

/*

// Example 1: React with Apollo Client
// ------------------------------------

import { useQuery, useMutation } from '@apollo/client';
import { GET_OUTFIT_DETAILS, GENERATE_OUTFIT_ANGLES } from './graphql-queries';

function OutfitComponent({ outfitId }) {
  const { data, loading, refetch } = useQuery(GET_OUTFIT_DETAILS, {
    variables: { outfitId }
  });

  const [generateAngles, { loading: generating }] = useMutation(
    GENERATE_OUTFIT_ANGLES,
    {
      onCompleted: () => refetch() // Refresh to get new rating
    }
  );

  if (loading) return <div>Loading...</div>;

  const outfit = data?.getOutfitDetails?.outfit;

  return (
    <div>
      <img src={outfit?.primaryImageUrl} alt="Outfit" />
      
      {outfit?.rating ? (
        <div>⭐ Rating: {outfit.rating.toFixed(1)}/10</div>
      ) : (
        <button 
          onClick={() => generateAngles({ variables: { outfitId }})}
          disabled={generating}
        >
          {generating ? 'Generating...' : 'Generate Rating'}
        </button>
      )}
    </div>
  );
}

// Example 2: Vue with @vue/apollo-composable
// -------------------------------------------

import { useQuery, useMutation } from '@vue/apollo-composable';
import { GET_OUTFIT_DETAILS, GENERATE_OUTFIT_ANGLES } from './graphql-queries';

export default {
  setup() {
    const outfitId = ref(123);

    const { result, loading, refetch } = useQuery(
      GET_OUTFIT_DETAILS,
      { outfitId }
    );

    const { mutate: generateAngles, loading: generating } = useMutation(
      GENERATE_OUTFIT_ANGLES
    );

    const handleGenerate = async () => {
      await generateAngles({ outfitId: outfitId.value });
      refetch();
    };

    return {
      outfit: computed(() => result.value?.getOutfitDetails?.outfit),
      loading,
      generating,
      handleGenerate
    };
  }
};

// Example 3: Plain JavaScript with Fetch
// ---------------------------------------

async function getOutfitRating(outfitId, authToken) {
  const query = `
    query GetOutfitDetails($outfitId: Int!) {
      getOutfitDetails(outfitId: $outfitId) {
        success
        outfit {
          rating
          primaryImageUrl
        }
      }
    }
  `;

  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      query,
      variables: { outfitId }
    })
  });

  const result = await response.json();
  return result.data.getOutfitDetails.outfit.rating;
}

async function generateAnglesAndRating(outfitId, authToken) {
  const mutation = `
    mutation GenerateOutfitAngles($outfitId: Int!) {
      generateOutfitAngles(outfitId: $outfitId) {
        success
        message
        anglesGenerated
      }
    }
  `;

  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      query: mutation,
      variables: { outfitId }
    })
  });

  const result = await response.json();
  return result.data.generateOutfitAngles;
}

// Example 4: Using urql
// ----------------------

import { useQuery, useMutation } from 'urql';
import { GET_OUTFIT_DETAILS, GENERATE_OUTFIT_ANGLES } from './graphql-queries';

function OutfitRating({ outfitId }) {
  const [{ data, fetching }, refetch] = useQuery({
    query: GET_OUTFIT_DETAILS,
    variables: { outfitId }
  });

  const [generateResult, generateAngles] = useMutation(GENERATE_OUTFIT_ANGLES);

  const handleGenerate = async () => {
    const result = await generateAngles({ outfitId });
    if (result.data?.generateOutfitAngles?.success) {
      // Wait a bit then refetch to get the rating
      setTimeout(() => refetch({ requestPolicy: 'network-only' }), 2000);
    }
  };

  const outfit = data?.getOutfitDetails?.outfit;

  return (
    <div>
      {outfit?.rating && <p>Rating: {outfit.rating}/10</p>}
      <button onClick={handleGenerate} disabled={generateResult.fetching}>
        Generate
      </button>
    </div>
  );
}

*/

