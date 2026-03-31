/**
 * Frontend GraphQL Queries for Outfit Chat with LangGraph AI
 * Updated to support both outfit-specific and general fashion chat
 */

import { gql } from "@apollo/client";

/**
 * Create a new chat session
 *
 * TWO USE CASES:
 *
 * 1. OUTFIT-SPECIFIC CHAT (with outfitId):
 *    - Visual analysis of a specific outfit
 *    - Access to outfit rating and details
 *    - Image-based recommendations
 *
 * 2. GENERAL FASHION CHAT (without outfitId):
 *    - Fashion advice and styling tips
 *    - Wardrobe suggestions based on weather/occasions
 *    - General outfit recommendations from user's wardrobe
 */
export const CREATE_CHAT_SESSION_MUTATION = gql`
  mutation CreateChatSession($input: CreateChatSessionInput!) {
    createChatSession(input: $input) {
      success
      message
      session {
        sessionId
        outfitId
        userId
        includeRating
        createdAt
      }
    }
  }
`;

/**
 * Send a message in an existing chat session
 */
export const SEND_CHAT_MESSAGE_MUTATION = gql`
  mutation SendChatMessage($input: SendChatMessageInput!) {
    sendChatMessage(input: $input) {
      success
      message
      response
      sessionId
    }
  }
`;

/**
 * End a chat session (optional - auto-expires after 1 hour)
 */
export const END_CHAT_SESSION_MUTATION = gql`
  mutation EndChatSession($sessionId: String!) {
    endChatSession(sessionId: $sessionId)
  }
`;

/**
 * Get chat session details
 */
export const GET_CHAT_SESSION_QUERY = gql`
  query GetChatSession($sessionId: String!) {
    getChatSession(sessionId: $sessionId) {
      sessionId
      outfitId
      userId
      includeRating
      createdAt
    }
  }
`;

// ==========================================
// EXAMPLE USAGE IN REACT COMPONENT
// ==========================================

/**
 * Example 1: Outfit-Specific Chat
 * User wants to chat about a specific outfit they're viewing
 */
export const exampleOutfitChat = async (apolloClient, outfitId) => {
  // Step 1: Create session with outfitId
  const { data } = await apolloClient.mutate({
    mutation: CREATE_CHAT_SESSION_MUTATION,
    variables: {
      input: {
        outfitId: outfitId, // Required for outfit-specific chat
        includeRating: true, // Include AI rating in responses
      },
    },
  });

  const sessionId = data.createChatSession.session.sessionId;

  // Step 2: Send messages
  await apolloClient.mutate({
    mutation: SEND_CHAT_MESSAGE_MUTATION,
    variables: {
      input: {
        sessionId: sessionId,
        chatInput: "How does this outfit look? Any suggestions?",
      },
    },
  });

  return sessionId;
};

/**
 * Example 2: General Fashion Chat
 * User wants fashion advice without a specific outfit
 */
export const exampleGeneralChat = async (apolloClient) => {
  // Step 1: Create session WITHOUT outfitId
  const { data } = await apolloClient.mutate({
    mutation: CREATE_CHAT_SESSION_MUTATION,
    variables: {
      input: {
        // outfitId: NOT PROVIDED - for general chat
        includeRating: false, // No rating needed for general chat
      },
    },
  });

  const sessionId = data.createChatSession.session.sessionId;

  // Step 2: Send messages about general fashion topics
  await apolloClient.mutate({
    mutation: SEND_CHAT_MESSAGE_MUTATION,
    variables: {
      input: {
        sessionId: sessionId,
        chatInput: "What should I wear for a business meeting tomorrow?",
      },
    },
  });

  // Step 3: Continue conversation
  await apolloClient.mutate({
    mutation: SEND_CHAT_MESSAGE_MUTATION,
    variables: {
      input: {
        sessionId: sessionId,
        chatInput: "What if it rains?",
      },
    },
  });

  return sessionId;
};

/**
 * Example 3: React Hook for Chat
 */
export const useChatSession = () => {
  const [sessionId, setSessionId] = React.useState(null);
  const [messages, setMessages] = React.useState([]);

  const startChat = async (outfitId = null) => {
    const { data } = await apolloClient.mutate({
      mutation: CREATE_CHAT_SESSION_MUTATION,
      variables: {
        input: {
          ...(outfitId && { outfitId }), // Only include if provided
          includeRating: !!outfitId, // Rating only relevant for outfit chat
        },
      },
    });

    setSessionId(data.createChatSession.session.sessionId);
    setMessages([]);
    return data.createChatSession.session.sessionId;
  };

  const sendMessage = async (message) => {
    const { data } = await apolloClient.mutate({
      mutation: SEND_CHAT_MESSAGE_MUTATION,
      variables: {
        input: {
          sessionId,
          chatInput: message,
        },
      },
    });

    setMessages([
      ...messages,
      { role: "user", content: message },
      { role: "assistant", content: data.sendChatMessage.response },
    ]);

    return data.sendChatMessage.response;
  };

  const endChat = async () => {
    if (sessionId) {
      await apolloClient.mutate({
        mutation: END_CHAT_SESSION_MUTATION,
        variables: { sessionId },
      });
      setSessionId(null);
      setMessages([]);
    }
  };

  return { sessionId, messages, startChat, sendMessage, endChat };
};
