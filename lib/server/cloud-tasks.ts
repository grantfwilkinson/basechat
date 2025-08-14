import assert from "assert";

import { SlackEvent } from "@slack/web-api";
import { GoogleAuth } from "google-auth-library";

import {
  BASE_URL,
  GOOGLE_TASKS_SERVICE_ACCOUNT,
  GOOGLE_PROJECT_ID,
  GOOGLE_TASKS_LOCATION,
  GOOGLE_TASKS_QUEUE,
} from "./settings";

interface SlackEventTask {
  event: SlackEvent;
}

// Google Cloud Tasks REST API endpoint
const TASKS_API_BASE = "https://cloudtasks.googleapis.com/v2";

// Initialize Google Auth client
let googleAuth: GoogleAuth | null = null;

async function getGoogleAuth() {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-tasks"],
      projectId: GOOGLE_PROJECT_ID,
      // Use service account credentials from environment variable if available
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
        ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        : undefined,
    });
  }
  return googleAuth;
}

export async function enqueueSlackEventTask(taskData: SlackEventTask): Promise<void> {
  assert(GOOGLE_PROJECT_ID, "GOOGLE_PROJECT_ID environment variable is required");
  assert(GOOGLE_TASKS_LOCATION, "GOOGLE_TASKS_LOCATION environment variable is required");
  assert(GOOGLE_TASKS_QUEUE, "GOOGLE_TASKS_QUEUE environment variable is required");
  assert(GOOGLE_TASKS_SERVICE_ACCOUNT, "GOOGLE_TASKS_SERVICE_ACCOUNT environment variable is required");

  const queuePath = `projects/${GOOGLE_PROJECT_ID}/locations/${GOOGLE_TASKS_LOCATION}/queues/${GOOGLE_TASKS_QUEUE}`;
  const url = `${BASE_URL}/api/slack/tasks`;
  const payload = JSON.stringify(taskData);

  console.log("Enqueuing Cloud Tasks task:", {
    queue: queuePath,
    url,
    eventType: taskData.event?.type,
  });

  // Get authenticated client
  const auth = await getGoogleAuth();
  const accessToken = await auth.getAccessToken();

  // Create the task using REST API
  const taskPayload = {
    task: {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: {
          "Content-Type": "application/json",
        },
        body: Buffer.from(payload).toString("base64"),
        oidcToken: {
          serviceAccountEmail: GOOGLE_TASKS_SERVICE_ACCOUNT,
        },
      },
    },
  };

  const response = await fetch(`${TASKS_API_BASE}/${queuePath}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(taskPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Cloud Tasks task: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  console.log("Cloud Tasks task created:", result.name);
}
