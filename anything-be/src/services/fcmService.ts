import { GoogleAuth } from "google-auth-library";

interface FCMDataEntryInput {
  key: string;
  value: string;
}

interface FCMNotificationInput {
  title: string;
  body: string;
}

type FCMNotificationMode = "SILENT" | "DISPLAY" | "HYBRID";

interface SendFCMNotificationInput {
  token: string;
  mode: FCMNotificationMode;
  notification?: FCMNotificationInput | null;
  data?: FCMDataEntryInput[] | null;
  androidPriority?: string | null;
}

interface FCMHttpV1Response {
  name?: string;
  error?: {
    message?: string;
  };
}

const FIREBASE_MESSAGING_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";

const auth = new GoogleAuth({
  scopes: [FIREBASE_MESSAGING_SCOPE],
});

const buildDataObject = (
  data: FCMDataEntryInput[] | null | undefined,
): Record<string, string> | undefined => {
  if (!data || data.length === 0) {
    return undefined;
  }

  const dataObject: Record<string, string> = {};
  for (const entry of data) {
    dataObject[entry.key] = entry.value;
  }

  return dataObject;
};

export const sendFCMNotificationMutation = async (
  _: unknown,
  args: { input: SendFCMNotificationInput },
) => {
  try {
    const { token, mode, notification, data, androidPriority = "high" } =
      args.input;

    const resolvedProjectId =
      process.env.FCM_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

    if (!resolvedProjectId) {
      throw new Error(
        "FCM project id is not configured. Set FCM_PROJECT_ID (preferred) or GOOGLE_CLOUD_PROJECT.",
      );
    }

    if ((mode === "DISPLAY" || mode === "HYBRID") && !notification) {
      throw new Error(
        "notification is required when mode is DISPLAY or HYBRID.",
      );
    }

    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const accessToken = accessTokenResponse?.token || accessTokenResponse;

    if (!accessToken) {
      throw new Error(
        "Unable to obtain Google access token. Ensure ADC is configured.",
      );
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${resolvedProjectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          message: {
            token,
            ...(mode === "DISPLAY" || mode === "HYBRID"
              ? {
                  notification: {
                    title: notification!.title,
                    body: notification!.body,
                  },
                }
              : {}),
            ...(mode === "SILENT" || mode === "HYBRID"
              ? { data: buildDataObject(data) }
              : {}),
            android: {
              priority: androidPriority,
            },
          },
        }),
      },
    );

    const json = (await response.json()) as FCMHttpV1Response;

    if (!response.ok) {
      const errorMessage =
        json?.error?.message ||
        `FCM request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return {
      success: true,
      message: "FCM notification sent successfully.",
      name: json?.name || null,
    };
  } catch (error) {
    console.error("Error sending FCM notification:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to send notification.",
      name: null,
    };
  }
};
