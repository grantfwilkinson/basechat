import assert from "assert";

import { SlackEvent } from "@slack/types";

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

// Lazy load the CloudTasksClient to avoid issues with missing config files during build
let cloudTasksClient: any = null;

async function getCloudTasksClient() {
  if (!cloudTasksClient) {
    const { CloudTasksClient } = await import("@google-cloud/tasks");
    cloudTasksClient = new CloudTasksClient({
      projectId: GOOGLE_PROJECT_ID,
      // Use service account credentials from environment variable if available
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
        ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        : undefined,
    });
  }
  return cloudTasksClient;
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
