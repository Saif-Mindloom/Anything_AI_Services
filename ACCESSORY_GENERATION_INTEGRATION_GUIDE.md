# Accessory Generation Integration Guide for React Native

## Overview

This document provides complete details for integrating the accessory generation feature into the React Native app. The feature allows users to generate AI-powered accessory suggestions for their outfits through an "Accessorize" button.

## Feature Workflow

When a user clicks the "Accessorize" button:

1. **Check** if the outfit already has accessories generated
2. **If YES**: Display existing accessories immediately
3. **If NO**: Start the accessory generation job via BullMQ and track progress

---

## Step 1: Check if Outfit Has Accessories

### GraphQL Query: `getOutfitDetails`

First, check the outfit's `hasAccessories` flag to determine if accessories already exist.

**Query:**

```graphql
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
      hasAccessories
    }
  }
}
```

**Variables:**

```json
{
  "outfitId": 123
}
```

**Response:**

```json
{
  "data": {
    "getOutfitDetails": {
      "success": true,
      "message": "Outfit details fetched successfully",
      "outfit": {
        "id": 123,
        "outfitUid": 456,
        "topId": 10,
        "bottomId": 20,
        "shoeId": 30,
        "dressId": 0,
        "primaryImageUrl": "https://storage.googleapis.com/...",
        "rating": 8.5,
        "hasAccessories": false // ← Check this field
      }
    }
  }
}
```

**Key Field:**

- `hasAccessories` (Boolean): `true` if accessories exist, `false` if they need to be generated

---

## Step 2A: If `hasAccessories = true` - Fetch Existing Accessories

### GraphQL Query: `getOutfitAccessories`

**Query:**

```graphql
query GetOutfitAccessories($outfitId: Int!) {
  getOutfitAccessories(outfitId: $outfitId) {
    success
    message
    accessories {
      id
      outfitId
      accessoryType
      description
      imageUrl
      gsUtil
      status
      createdAt
      updatedAt
    }
  }
}
```

**Variables:**

```json
{
  "outfitId": 123
}
```

**Response:**

```json
{
  "data": {
    "getOutfitAccessories": {
      "success": true,
      "message": "Found 3 accessorie(s)",
      "accessories": [
        {
          "id": 1,
          "outfitId": 123,
          "accessoryType": "watch",
          "description": "A sleek silver watch with a minimalist dial...",
          "imageUrl": "https://storage.googleapis.com/anything-ai-assets/accessories/...",
          "gsUtil": "gs://anything-ai-assets/accessories/...",
          "status": "complete",
          "createdAt": "2026-01-28T10:30:00.000Z",
          "updatedAt": "2026-01-28T10:30:00.000Z"
        },
        {
          "id": 2,
          "outfitId": 123,
          "accessoryType": "sunglasses",
          "description": "Classic aviator sunglasses with gold frames...",
          "imageUrl": "https://storage.googleapis.com/...",
          "gsUtil": "gs://...",
          "status": "complete",
          "createdAt": "2026-01-28T10:30:00.000Z",
          "updatedAt": "2026-01-28T10:30:00.000Z"
        },
        {
          "id": 3,
          "outfitId": 123,
          "accessoryType": "belt",
          "description": "Brown leather belt with brass buckle...",
          "imageUrl": "https://storage.googleapis.com/...",
          "gsUtil": "gs://...",
          "status": "complete",
          "createdAt": "2026-01-28T10:30:00.000Z",
          "updatedAt": "2026-01-28T10:30:00.000Z"
        }
      ]
    }
  }
}
```

**Accessory Object Fields:**

- `id` (Int): Unique accessory ID
- `outfitId` (Int): The outfit this accessory belongs to
- `accessoryType` (String): Type of accessory (watch, belt, bag, sunglasses, etc.)
- `description` (String): AI-generated description of the accessory
- `imageUrl` (String): Public URL to the accessory image (use this for display)
- `gsUtil` (String): Google Cloud Storage path
- `status` (String): Status of the accessory (typically "complete")
- `createdAt` (String): ISO timestamp
- `updatedAt` (String): ISO timestamp

---

## Step 2B: If `hasAccessories = false` - Generate Accessories

### GraphQL Mutation: `generateAccessories`

**Mutation:**

```graphql
mutation GenerateAccessories($outfitId: Int!) {
  generateAccessories(outfitId: $outfitId) {
    success
    message
    jobId
  }
}
```

**Variables:**

```json
{
  "outfitId": 123
}
```

**Response:**

```json
{
  "data": {
    "generateAccessories": {
      "success": true,
      "message": "Accessory generation job started. Use jobId to track progress.",
      "jobId": "12345" // ← Use this to track progress
    }
  }
}
```

**Error Cases:**

```json
{
  "data": {
    "generateAccessories": {
      "success": false,
      "message": "Accessories already exist for outfit 123. Cannot regenerate.",
      "jobId": null
    }
  }
}
```

---

## Step 3: Track Job Progress

Once you have a `jobId`, you need to poll the REST API endpoint to check job status.

### REST Endpoint: GET Job Status

**Endpoint:**

```
GET https://your-backend-url/api/job-status/:jobId
```

**Headers:**

```
Authorization: Bearer <user_jwt_token>
```

**Example Request:**

```bash
curl -X GET \
  "https://your-backend-url/api/job-status/12345" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (Job Pending/Processing):**

```json
{
  "success": true,
  "job": {
    "jobId": "12345",
    "status": "processing", // States: "pending" | "processing" | "completed" | "failed"
    "progress": {
      "current": 45,
      "total": 100
    },
    "createdAt": "2026-01-28T10:30:00.000Z",
    "updatedAt": "2026-01-28T10:30:15.000Z"
  }
}
```

**Response (Job Completed):**

```json
{
  "success": true,
  "job": {
    "jobId": "12345",
    "status": "completed",
    "progress": {
      "current": 100,
      "total": 100
    },
    "createdAt": "2026-01-28T10:30:00.000Z",
    "updatedAt": "2026-01-28T10:32:45.000Z",
    "durationSeconds": "165.30",
    "result": {
      "success": true,
      "message": "Successfully generated 3 accessories",
      "durationSeconds": 165.3,
      "accessories": [
        {
          "id": 1,
          "outfitId": 123,
          "accessoryType": "watch",
          "description": "A sleek silver watch...",
          "imageUrl": "https://storage.googleapis.com/...",
          "gsUtil": "gs://...",
          "status": "complete"
        },
        {
          "id": 2,
          "outfitId": 123,
          "accessoryType": "sunglasses",
          "description": "Classic aviator sunglasses...",
          "imageUrl": "https://storage.googleapis.com/...",
          "gsUtil": "gs://...",
          "status": "complete"
        },
        {
          "id": 3,
          "outfitId": 123,
          "accessoryType": "belt",
          "description": "Brown leather belt...",
          "imageUrl": "https://storage.googleapis.com/...",
          "gsUtil": "gs://...",
          "status": "complete"
        }
      ]
    }
  }
}
```

**Response (Job Failed):**

```json
{
  "success": true,
  "job": {
    "jobId": "12345",
    "status": "failed",
    "progress": {
      "current": 0,
      "total": 100
    },
    "createdAt": "2026-01-28T10:30:00.000Z",
    "updatedAt": "2026-01-28T10:31:00.000Z",
    "error": "Outfit 123 not found"
  }
}
```

**Polling Strategy:**

- Poll every 2-3 seconds while `status` is "pending" or "processing"
- Stop polling when `status` is "completed" or "failed"
- Show progress indicator using `progress.current / progress.total`
- Typical generation time: 2-3 minutes

---

## Implementation Example (React Native)

```typescript
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { gql, useLazyQuery, useMutation } from '@apollo/client';

// GraphQL Queries & Mutations
const GET_OUTFIT_DETAILS = gql`
  query GetOutfitDetails($outfitId: Int!) {
    getOutfitDetails(outfitId: $outfitId) {
      success
      message
      outfit {
        id
        hasAccessories
      }
    }
  }
`;

const GET_OUTFIT_ACCESSORIES = gql`
  query GetOutfitAccessories($outfitId: Int!) {
    getOutfitAccessories(outfitId: $outfitId) {
      success
      message
      accessories {
        id
        accessoryType
        description
        imageUrl
        status
      }
    }
  }
`;

const GENERATE_ACCESSORIES = gql`
  mutation GenerateAccessories($outfitId: Int!) {
    generateAccessories(outfitId: $outfitId) {
      success
      message
      jobId
    }
  }
`;

// Component
export const AccessorizeButton = ({ outfitId, authToken }) => {
  const [accessories, setAccessories] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState(null);

  const [getOutfitDetails] = useLazyQuery(GET_OUTFIT_DETAILS);
  const [getAccessories] = useLazyQuery(GET_OUTFIT_ACCESSORIES);
  const [generateAccessories] = useMutation(GENERATE_ACCESSORIES);

  // Poll job status
  const pollJobStatus = async (id) => {
    const response = await fetch(`https://your-backend-url/api/job-status/${id}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error('Failed to fetch job status');
    }

    const { status, progress: jobProgress, result } = data.job;

    // Update progress
    if (jobProgress) {
      setProgress((jobProgress.current / jobProgress.total) * 100);
    }

    // Check if completed
    if (status === 'completed') {
      setIsGenerating(false);
      setAccessories(result.accessories);
      setJobId(null);
      return true; // Done
    } else if (status === 'failed') {
      setIsGenerating(false);
      setJobId(null);
      alert('Accessory generation failed. Please try again.');
      return true; // Done (with error)
    }

    return false; // Still processing
  };

  // Start polling when we have a jobId
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      const isDone = await pollJobStatus(jobId);
      if (isDone) {
        clearInterval(interval);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [jobId]);

  // Handle Accessorize button click
  const handleAccessorize = async () => {
    try {
      setIsGenerating(true);

      // Step 1: Check if accessories already exist
      const { data: outfitData } = await getOutfitDetails({
        variables: { outfitId }
      });

      if (!outfitData?.getOutfitDetails?.success) {
        throw new Error('Failed to fetch outfit details');
      }

      const hasAccessories = outfitData.getOutfitDetails.outfit.hasAccessories;

      if (hasAccessories) {
        // Step 2A: Accessories exist - fetch them
        const { data: accessoriesData } = await getAccessories({
          variables: { outfitId }
        });

        if (accessoriesData?.getOutfitAccessories?.success) {
          setAccessories(accessoriesData.getOutfitAccessories.accessories);
          setIsGenerating(false);
        }
      } else {
        // Step 2B: No accessories - generate them
        const { data: generateData } = await generateAccessories({
          variables: { outfitId }
        });

        if (generateData?.generateAccessories?.success) {
          const newJobId = generateData.generateAccessories.jobId;
          setJobId(newJobId);
          setProgress(0);
          // Polling will start automatically via useEffect
        } else {
          throw new Error(generateData?.generateAccessories?.message || 'Failed to start generation');
        }
      }
    } catch (error) {
      console.error('Error in accessorize:', error);
      alert('Failed to accessorize outfit');
      setIsGenerating(false);
    }
  };

  return (
    <View>
      {/* Accessorize Button */}
      <TouchableOpacity
        onPress={handleAccessorize}
        disabled={isGenerating}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {isGenerating ? 'Generating...' : 'Accessorize'}
        </Text>
      </TouchableOpacity>

      {/* Progress Indicator */}
      {isGenerating && (
        <View style={styles.progressContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.progressText}>
            {progress > 0 ? `${Math.round(progress)}%` : 'Starting...'}
          </Text>
        </View>
      )}

      {/* Display Accessories */}
      {accessories.length > 0 && (
        <View style={styles.accessoriesContainer}>
          <Text style={styles.title}>Suggested Accessories</Text>
          {accessories.map((accessory) => (
            <View key={accessory.id} style={styles.accessoryCard}>
              <Image
                source={{ uri: accessory.imageUrl }}
                style={styles.accessoryImage}
              />
              <View style={styles.accessoryInfo}>
                <Text style={styles.accessoryType}>
                  {accessory.accessoryType.toUpperCase()}
                </Text>
                <Text style={styles.accessoryDescription}>
                  {accessory.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = {
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  progressText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  accessoriesContainer: {
    marginTop: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  accessoryCard: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  accessoryImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 10,
  },
  accessoryInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  accessoryType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  accessoryDescription: {
    fontSize: 12,
    color: '#666',
  },
};
```

---

## Backend Processing Details

### What Happens Behind the Scenes

1. **Job Queued**: When `generateAccessories` mutation is called, a BullMQ job is created
2. **Worker Processes Job**:
   - Fetches outfit image from database
   - Randomly selects 3 accessory types from: headwear, eyewear, necklace, chain, scarf, ring, bracelet, watch, belt, bag
   - Uses LangGraph (RAG + Vision AI) to analyze the outfit and generate descriptions
   - Uses Gemini AI to generate a single image with all 3 accessories
   - Processes and splits the image into individual accessories
   - Removes background from each accessory
   - Uploads to Google Cloud Storage
   - Saves to database with `status: 'complete'`
   - Updates outfit `hasAccessories` flag to `true`
3. **Job Complete**: Result is returned with all accessory details

**Average Processing Time**: 2-3 minutes per outfit

**Concurrency**: 3 accessory generation jobs can run simultaneously

---

## Important Notes

### Error Handling

1. **Authentication Errors**: Ensure JWT token is valid and included in headers
2. **Already Generated**: Cannot regenerate accessories once they exist (will return error)
3. **Job Failures**: Monitor job status and show appropriate error messages
4. **Network Errors**: Handle timeouts and connection issues gracefully

### Best Practices

1. **Show Loading State**: Always display a loading indicator during generation
2. **Progress Updates**: Use the progress percentage to show visual feedback
3. **Cache Results**: Store accessories in local state to avoid refetching
4. **Offline Handling**: Gracefully handle cases where network is unavailable
5. **Timeout**: Consider implementing a timeout (e.g., 5 minutes) for job polling

### Rate Limiting

- Each outfit can only have accessories generated **once**
- To regenerate, accessories must be manually deleted from backend first
- Generation is resource-intensive, so avoid spamming the button

---

## Testing Checklist

- [ ] Test with outfit that has `hasAccessories: true`
- [ ] Test with outfit that has `hasAccessories: false`
- [ ] Test job polling (pending → processing → completed)
- [ ] Test job failure scenarios
- [ ] Test progress indicator updates
- [ ] Test network error handling
- [ ] Test authentication errors
- [ ] Test UI with 3 accessories displayed
- [ ] Test image loading and error states
- [ ] Test button disabled state during generation

---

## API Summary Table

| Operation            | Type             | Endpoint/Query           | Purpose                         |
| -------------------- | ---------------- | ------------------------ | ------------------------------- |
| Check Accessories    | GraphQL Query    | `getOutfitDetails`       | Check if outfit has accessories |
| Get Accessories      | GraphQL Query    | `getOutfitAccessories`   | Fetch existing accessories      |
| Generate Accessories | GraphQL Mutation | `generateAccessories`    | Start generation job            |
| Poll Job Status      | REST GET         | `/api/job-status/:jobId` | Track generation progress       |

---

## Support

For questions or issues, contact the backend team or check:

- GraphQL Playground: `http://localhost:4000/graphql`
- Job Status Endpoint: `http://localhost:4000/api/job-status/:jobId`
- API Documentation: See README.md in the backend repository

---

**Last Updated**: January 28, 2026  
**Backend Version**: v2.0  
**Author**: Backend Team
