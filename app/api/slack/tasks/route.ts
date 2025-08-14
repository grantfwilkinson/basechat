import { GoogleAuth } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";

import { GOOGLE_PROJECT_ID } from "@/lib/server/settings";

import { handleSlackEvent } from "../handlers";

// Verify that the request comes from Google Cloud Tasks
async function verifyCloudTasksRequest(request: NextRequest): Promise<boolean> {
  try {
    // Verify Cloud Tasks headers are present
    const queueName = request.headers.get("X-CloudTasks-QueueName");
    const taskName = request.headers.get("X-CloudTasks-TaskName");

    if (!queueName || !taskName) {
      console.log("Missing required Cloud Tasks headers");
      return false;
    }

    // For internal Cloud Tasks requests, we can trust the headers
    // Additional verification could be added here if needed
    console.log("Verified Cloud Tasks request:", { queueName, taskName });
    return true;
  } catch (error) {
    console.error("Error verifying Cloud Tasks request:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const isVerified = await verifyCloudTasksRequest(request);

    if (!isVerified) {
      console.error("Unauthorized request - not from Cloud Tasks");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { event } = body;

    if (!event) {
      console.error("No event data in request body");
      return NextResponse.json({ error: "Missing event data" }, { status: 400 });
    }

    await handleSlackEvent(event);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing Slack event in Cloud Tasks:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
