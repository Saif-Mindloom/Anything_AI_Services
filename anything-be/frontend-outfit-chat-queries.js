/**
 * Frontend GraphQL Queries for Outfit Chat
 * 
 * Copy this file to your frontend project or copy individual queries as needed.
 * 
 * Compatible with:
 * - Apollo Client
 * - urql
 * - graphql-request
 * - Any GraphQL client
 */

import { gql } from '@apollo/client'; // or your GraphQL client

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new chat session for an outfit
 * 
 * Use this when:
 * - User opens chat for the first time
 * - Previous session expired
 * 
 * @param outfitId - The ID of the outfit to chat about
 * @param includeRating - Whether to include rating in AI context (requires outfit to have rating)
 * 
 * Returns:
 * - sessionId: Store this to use in subsequent messages
 */
export const CREATE_CHAT_SESSION = gql`
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
 * 
 * Use this when:
 * - User sends a message in the chat
 * 
 * @param sessionId - The session ID from createChatSession
 * @param chatInput - User's message/question
 * 
 * Returns:
 * - response: AI's response to display in chat
 */
export const SEND_CHAT_MESSAGE = gql`
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
 * End a chat session (optional)
 * 
 * Sessions auto-expire after 1 hour, but you can manually end them when:
 * - User closes the chat
 * - User navigates away
 * 
 * @param sessionId - The session ID to end
 */
export const END_CHAT_SESSION = gql`
  mutation EndChatSession($sessionId: String!) {
    endChatSession(sessionId: $sessionId)
  }
`;

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a chat session (for debugging/verification)
 * 
 * Use this when:
 * - Verifying a session is still active
 * - Debugging session issues
 * 
 * @param sessionId - The session ID to retrieve
 */
export const GET_CHAT_SESSION = gql`
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

// ============================================================================
// EXAMPLE USAGE - React with Apollo Client
// ============================================================================

/*
import { useMutation, useQuery } from '@apollo/client';
import {
  CREATE_CHAT_SESSION,
  SEND_CHAT_MESSAGE,
  END_CHAT_SESSION,
  GET_CHAT_SESSION
} from './frontend-outfit-chat-queries';

function OutfitChatComponent({ outfitId, hasRating }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');

  // Create session mutation
  const [createSession, { loading: creatingSession }] = useMutation(CREATE_CHAT_SESSION, {
    onCompleted: (data) => {
      if (data.createChatSession.success) {
        setSessionId(data.createChatSession.session.sessionId);
      }
    },
    onError: (error) => {
      console.error('Failed to create session:', error);
      // If outfit has no rating, try without rating
      if (error.message.includes('does not have a rating')) {
        createSession({
          variables: {
            input: { outfitId, includeRating: false }
          }
        });
      }
    }
  });

  // Send message mutation
  const [sendMessage, { loading: sendingMessage }] = useMutation(SEND_CHAT_MESSAGE, {
    onCompleted: (data) => {
      if (data.sendChatMessage.success) {
        // Add AI response to messages
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.sendChatMessage.response
        }]);
      }
    },
    onError: (error) => {
      console.error('Failed to send message:', error);
      // If session expired, create new one
      if (error.message.includes('expired') || error.message.includes('not found')) {
        handleCreateSession();
      }
    }
  });

  // End session mutation
  const [endSession] = useMutation(END_CHAT_SESSION);

  // Create session on mount
  useEffect(() => {
    handleCreateSession();
    
    // Cleanup on unmount
    return () => {
      if (sessionId) {
        endSession({ variables: { sessionId } });
      }
    };
  }, []);

  const handleCreateSession = () => {
    createSession({
      variables: {
        input: {
          outfitId,
          includeRating: hasRating
        }
      }
    });
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !sessionId) return;

    // Add user message to UI
    const userMessage = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    // Send to backend
    await sendMessage({
      variables: {
        input: {
          sessionId,
          chatInput: inputValue
        }
      }
    });
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {sendingMessage && <div className="message assistant">Thinking...</div>}
      </div>
      
      <div className="input-area">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask about this outfit..."
          disabled={!sessionId || sendingMessage}
        />
        <button 
          onClick={handleSendMessage}
          disabled={!sessionId || sendingMessage || !inputValue.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
*/

// ============================================================================
// EXAMPLE USAGE - Vue 3 Composition API
// ============================================================================

/*
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useMutation } from '@vue/apollo-composable';
import {
  CREATE_CHAT_SESSION,
  SEND_CHAT_MESSAGE,
  END_CHAT_SESSION
} from './frontend-outfit-chat-queries';

const props = defineProps({
  outfitId: Number,
  hasRating: Boolean
});

const sessionId = ref(null);
const messages = ref([]);
const inputValue = ref('');

const { mutate: createSession, loading: creatingSession } = useMutation(CREATE_CHAT_SESSION);
const { mutate: sendMessage, loading: sendingMessage } = useMutation(SEND_CHAT_MESSAGE);
const { mutate: endSession } = useMutation(END_CHAT_SESSION);

const handleCreateSession = async () => {
  try {
    const result = await createSession({
      input: {
        outfitId: props.outfitId,
        includeRating: props.hasRating
      }
    });
    
    if (result.data.createChatSession.success) {
      sessionId.value = result.data.createChatSession.session.sessionId;
    }
  } catch (error) {
    console.error('Failed to create session:', error);
    // Try without rating if needed
    if (error.message.includes('does not have a rating')) {
      await createSession({
        input: {
          outfitId: props.outfitId,
          includeRating: false
        }
      });
    }
  }
};

const handleSendMessage = async () => {
  if (!inputValue.value.trim() || !sessionId.value) return;

  // Add user message
  messages.value.push({ role: 'user', content: inputValue.value });
  const userInput = inputValue.value;
  inputValue.value = '';

  try {
    const result = await sendMessage({
      input: {
        sessionId: sessionId.value,
        chatInput: userInput
      }
    });

    if (result.data.sendChatMessage.success) {
      messages.value.push({
        role: 'assistant',
        content: result.data.sendChatMessage.response
      });
    }
  } catch (error) {
    console.error('Failed to send message:', error);
    // Recreate session if expired
    if (error.message.includes('expired') || error.message.includes('not found')) {
      await handleCreateSession();
    }
  }
};

onMounted(() => {
  handleCreateSession();
});

onUnmounted(() => {
  if (sessionId.value) {
    endSession({ sessionId: sessionId.value });
  }
});
</script>

<template>
  <div class="chat-container">
    <div class="messages">
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        :class="['message', msg.role]"
      >
        {{ msg.content }}
      </div>
      <div v-if="sendingMessage" class="message assistant">Thinking...</div>
    </div>
    
    <div class="input-area">
      <input
        v-model="inputValue"
        type="text"
        placeholder="Ask about this outfit..."
        @keypress.enter="handleSendMessage"
        :disabled="!sessionId || sendingMessage"
      />
      <button
        @click="handleSendMessage"
        :disabled="!sessionId || sendingMessage || !inputValue.trim()"
      >
        Send
      </button>
    </div>
  </div>
</template>
*/

// ============================================================================
// EXAMPLE USAGE - Plain JavaScript with Fetch
// ============================================================================

/*
class OutfitChatClient {
  constructor(graphqlEndpoint, authToken) {
    this.endpoint = graphqlEndpoint;
    this.token = authToken;
    this.sessionId = null;
  }

  async graphqlRequest(query, variables) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }
    
    return result.data;
  }

  async createSession(outfitId, includeRating) {
    const query = `
      mutation CreateChatSession($input: CreateChatSessionInput!) {
        createChatSession(input: $input) {
          success
          message
          session {
            sessionId
            outfitId
            includeRating
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      input: { outfitId, includeRating }
    });

    if (data.createChatSession.success) {
      this.sessionId = data.createChatSession.session.sessionId;
      return this.sessionId;
    }
    
    throw new Error(data.createChatSession.message);
  }

  async sendMessage(message) {
    if (!this.sessionId) {
      throw new Error('No active session. Create a session first.');
    }

    const query = `
      mutation SendChatMessage($input: SendChatMessageInput!) {
        sendChatMessage(input: $input) {
          success
          message
          response
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      input: {
        sessionId: this.sessionId,
        chatInput: message
      }
    });

    if (data.sendChatMessage.success) {
      return data.sendChatMessage.response;
    }
    
    throw new Error(data.sendChatMessage.message);
  }

  async endSession() {
    if (!this.sessionId) return;

    const query = `
      mutation EndChatSession($sessionId: String!) {
        endChatSession(sessionId: $sessionId)
      }
    `;

    await this.graphqlRequest(query, { sessionId: this.sessionId });
    this.sessionId = null;
  }
}

// Usage:
const chat = new OutfitChatClient('http://localhost:4000/graphql', 'your-jwt-token');
await chat.createSession(123, true);
const response = await chat.sendMessage('Is this good for a date?');
console.log(response);
await chat.endSession();
*/

// ============================================================================
// ERROR HANDLING EXAMPLES
// ============================================================================

/*
// Handle session expiration
try {
  await sendMessage({ ... });
} catch (error) {
  if (error.message.includes('expired') || error.message.includes('not found')) {
    // Session expired, create new one
    await createSession({ ... });
    // Retry sending message
    await sendMessage({ ... });
  }
}

// Handle outfit without rating
try {
  await createSession({
    variables: {
      input: { outfitId: 123, includeRating: true }
    }
  });
} catch (error) {
  if (error.message.includes('does not have a rating')) {
    // Fallback to chat without rating
    await createSession({
      variables: {
        input: { outfitId: 123, includeRating: false }
      }
    });
  }
}

// Handle N8N webhook timeout
try {
  await sendMessage({ ... });
} catch (error) {
  if (error.message.includes('timeout')) {
    // Show user-friendly message
    showError('The AI is taking longer than usual. Please try again.');
  }
}
*/

// ============================================================================
// TYPESCRIPT TYPES (Optional)
// ============================================================================

/*
export interface ChatSession {
  sessionId: string;
  outfitId: number;
  userId: string;
  includeRating: boolean;
  createdAt: string;
}

export interface CreateChatSessionInput {
  outfitId: number;
  includeRating: boolean;
}

export interface SendChatMessageInput {
  sessionId: string;
  chatInput: string;
}

export interface CreateChatSessionResponse {
  success: boolean;
  message: string;
  session: ChatSession | null;
}

export interface SendChatMessageResponse {
  success: boolean;
  message: string;
  response: string | null;
  sessionId: string | null;
}
*/

