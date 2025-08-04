import assert from "assert";

import {
  AllMessageEvents,
  AppMentionEvent,
  GenericMessageEvent,
  MemberJoinedChannelEvent,
  MemberLeftChannelEvent,
  ReactionAddedEvent,
  ReactionRemovedEvent,
  SlackEvent,
  WebClient,
} from "@slack/web-api";

import { DEFAULT_MODEL } from "@/lib/llm/types";
import {
  ConversationContext,
  generatorFactory,
  MessageDAO,
  ReplyGenerator,
  Retriever,
} from "@/lib/server/conversation-context";

import { formatMessageWithSources, isAnswered, shouldReplyToMessage, slackSignIn } from "./utils";

// Handle different types of Slack events
export async function handleSlackEvent(event: SlackEvent | undefined): Promise<void> {
  if (!event) {
    console.log("No event provided to handleSlackEvent");
    return;
  }

  console.log(`Processing Slack event in task handler: ${event.type}`);

  switch (event.type) {
    case "message":
      console.log(`Calling handleMessage for message event`);
      try {
        await handleMessage(event as AllMessageEvents);
        console.log(`handleMessage completed successfully`);
      } catch (error) {
        console.error(`Error in handleMessage:`, error);
        console.error(`Error stack:`, error instanceof Error ? error.stack : "No stack trace");
        throw error; // Re-throw to maintain existing error behavior
      }
      break;

    case "app_mention":
      await handleAppMention(event);
      break;

    case "member_joined_channel":
      await handleMemberJoinedChannel(event);
      break;

    case "member_left_channel":
      await handleMemberLeftChannel(event);
      break;

    case "reaction_added":
      await handleReactionAdded(event);
      break;

    case "reaction_removed":
      await handleReactionRemoved(event);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

async function handleMessage(event: AllMessageEvents): Promise<void> {
  console.log(`handleMessage called with event type: ${event.type}`);
  console.log(`Event subtype: ${event.subtype || "none"}`);
  console.log(`Event text: "${(event as any).text || "no text"}"`);

  if (event.subtype && event.subtype !== undefined) {
    console.log(`Skipping message with subtype: ${event.subtype}`);
    return;
  }
  console.log(`No subtype, calling _handleMessage...`);
  return _handleMessage(event);
}

async function handleAppMention(event: AppMentionEvent): Promise<void> {
  return _handleMessage(event);
}

async function _handleMessage(event: AppMentionEvent | GenericMessageEvent) {
  console.log(`_handleMessage called with event:`, JSON.stringify(event, null, 2));

  if (!event.team) {
    console.error("No team ID found in event");
    throw new Error("No team ID found in app mention event");
  }
  console.log(`Team ID: ${event.team}`);

  if (!event.user) {
    console.error("No user ID found in event");
    throw new Error("No user ID found in app mention event");
  }
  console.log(`User ID: ${event.user}`);

  if (event.bot_id) {
    console.log(`Skipping message from bot: ${event.bot_id}`);
    return;
  }
  console.log(`Not a bot message, proceeding...`);

  console.log(`Calling slackSignIn with team: ${event.team}, user: ${event.user}`);
  const { tenant, profile } = await slackSignIn(event.team, event.user);
  console.log(`slackSignIn completed, tenant ID: ${tenant.id}, profile ID: ${profile.id}`);

  if (!tenant.slackBotToken) {
    console.error("No slack bot token found for tenant");
    throw new Error("expected slack bot token");
  }
  console.log(`Tenant has slack bot token`);

  console.log(`Tenant response mode: ${tenant.slackResponseMode}, Event type: ${event.type}`);
  if (tenant.slackResponseMode === "mentions" && event.type !== "app_mention") {
    console.log(`Skipping message - mentions only mode`);
    return;
  }

  const userMessage = event.text;
  console.log(`Processing message: "${userMessage}"`);

  // For debugging - temporarily bypass question detection
  const DEBUG_BYPASS_CHECKS = true;

  if (!DEBUG_BYPASS_CHECKS) {
    const shouldReply = await shouldReplyToMessage(userMessage);
    if (!shouldReply) {
      console.log(`Skipping message that did not meet the criteria for a reply - not detected as a question`);
      return;
    }
    console.log(`Message passed question detection, proceeding with response generation`);
  } else {
    console.log(`DEBUG: Bypassing question detection, proceeding with response generation`);
  }

  const slack = new WebClient(tenant.slackBotToken);

  await slack.reactions.add({
    channel: event.channel,
    timestamp: event.ts,
    name: "thinking_face",
  });

  try {
    const retriever = new Retriever(tenant, {
      isBreadth: tenant.isBreadth ?? false,
      rerankEnabled: tenant.rerankEnabled ?? true,
      prioritizeRecent: tenant.prioritizeRecent ?? false,
    });
    const context = await ConversationContext.fromMessageEvent(tenant, profile, event, retriever);
    const replyContext = await context.promptSlackMessage(profile, event);
    const generator = new ReplyGenerator(
      new MessageDAO(tenant.id),
      generatorFactory(tenant.defaultModel ?? DEFAULT_MODEL),
    );
    const object = await generator.generateObject(replyContext);
    console.log(`Generated response: "${object.message}"`);
    console.log(`Used source indexes: [${object.usedSourceIndexes.join(", ")}]`);
    console.log(`Available sources count: ${replyContext.sources.length}`);

    if (DEBUG_BYPASS_CHECKS) {
      // DEBUG: Send response regardless of sources or quality
      const text =
        object.usedSourceIndexes.length > 0 ? formatMessageWithSources(object, replyContext) : object.message;
      console.log(`DEBUG: Sending response to Slack regardless of checks: "${text}"`);

      await slack.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text,
      });
      console.log(`DEBUG: Successfully sent message to Slack`);
    } else if (object.usedSourceIndexes.length > 0) {
      console.log(`Response uses sources, checking if answer is insightful...`);
      const answered = await isAnswered(userMessage ?? "", object.message);
      console.log(`Is answer insightful: ${answered}`);
      if (answered) {
        const text = formatMessageWithSources(object, replyContext);
        console.log(`Sending response to Slack: "${text}"`);

        await slack.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text,
        });
        console.log(`Successfully sent message to Slack`);
      } else {
        console.log(`Reply was not an adequate response because it did not give an insightful answer, skipping`);
      }
    } else {
      console.log(`Reply was not an adequate response because it did not use any sources, skipping`);
    }
  } catch (error) {
    console.error("Error processing message:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace available");
    // Don't rethrow - we want to remove the thinking face even if processing fails
  } finally {
    await slack.reactions.remove({
      channel: event.channel,
      timestamp: event.ts,
      name: "thinking_face",
    });
  }
}

async function handleMemberJoinedChannel(event: MemberJoinedChannelEvent): Promise<void> {
  console.log("Member joined channel:", {
    channel: event.channel,
    user: event.user,
  });

  // Add your member joined logic here
  // For example: send welcome message, notify admins, etc.
}

async function handleMemberLeftChannel(event: MemberLeftChannelEvent): Promise<void> {
  console.log("Member left channel:", {
    channel: event.channel,
    user: event.user,
  });

  // Add your member left logic here
}

async function handleReactionAdded(event: ReactionAddedEvent): Promise<void> {
  console.log("Reaction added:", {
    user: event.user,
    reaction: event.reaction,
    item: event.item,
  });

  // Add your reaction added logic here
}

async function handleReactionRemoved(event: ReactionRemovedEvent): Promise<void> {
  console.log("Reaction removed:", {
    user: event.user,
    reaction: event.reaction,
    item: event.item,
  });

  // Add your reaction removed logic here
}
