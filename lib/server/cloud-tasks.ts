import assert from "assert";

import { SlackEvent } from "@slack/types";

import {
  BASE_URL,
  GOOGLE_TASKS_SERVICE_ACCOUNT,
  GOOGLE_PROJECT_ID,
  GOOGLE_TASKS_LOCATION,
  GOOGLE_TASKS_QUEUE,
  GOOGLE_APPLICATION_CREDENTIALS,
} from "./settings";

// Initialize Cloud Tasks client with explicit credentials for Vercel
async function createCloudTasksClient() {
  // Dynamically import CloudTasksClient to avoid module-level initialization
  const { CloudTasksClient } = await import("@google-cloud/tasks");

  if (GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS);
      return new CloudTasksClient({
        credentials,
        projectId: GOOGLE_PROJECT_ID,
      });
    } catch (error) {
      console.error("Error parsing Google credentials JSON:", error);
      throw new Error("Invalid Google credentials JSON");
    }
  }
  // Fallback to default credentials (for local development)
  return new CloudTasksClient();
}

// Lazy initialization - create client only when needed
let cloudTasksClient: any = null;
async function getCloudTasksClient() {
  if (!cloudTasksClient) {
    cloudTasksClient = await createCloudTasksClient();
  }
  return cloudTasksClient;
}

interface SlackEventTask {
  event: SlackEvent;
}

export async function enqueueSlackEventTask(taskData: SlackEventTask): Promise<void> {
  assert(GOOGLE_PROJECT_ID, "GOOGLE_PROJECT_ID environment variable is required");
  assert(GOOGLE_TASKS_LOCATION, "GOOGLE_TASKS_LOCATION environment variable is required");
  assert(GOOGLE_TASKS_QUEUE, "GOOGLE_TASKS_QUEUE environment variable is required");

  const client = await getCloudTasksClient();
  const queuePath = client.queuePath(GOOGLE_PROJECT_ID, GOOGLE_TASKS_LOCATION, GOOGLE_TASKS_QUEUE);

  const url = `${BASE_URL}/api/slack/tasks`;
  const payload = JSON.stringify(taskData);

  console.log("Enqueuing Cloud Tasks task:", {
    queue: queuePath,
    url,
    eventType: taskData.event?.type,
  });

  assert(GOOGLE_TASKS_SERVICE_ACCOUNT, "GOOGLE_TASKS_SERVICE_ACCOUNT environment variable is required");

  const [response] = await client.createTask({
    parent: queuePath,
    task: {
      httpRequest: {
        httpMethod: "POST" as const,
        url,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(payload).toString("base64"),
        oauthToken: null,
        oidcToken: { serviceAccountEmail: GOOGLE_TASKS_SERVICE_ACCOUNT },
      },
    },
  });

  console.log("Cloud Tasks task created:", response.name);
}
