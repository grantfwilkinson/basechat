import assert from "assert";

import { openai } from "@ai-sdk/openai";
import { WebClient } from "@slack/web-api";
import { generateObject } from "ai";
import Handlebars from "handlebars";
import { z } from "zod";

import { getPublicRagieSourcePath } from "@/lib/paths";
import { ConversationMessageResponse, ReplyContext } from "@/lib/server/conversation-context";
import * as schema from "@/lib/server/db/schema";
import {
  createProfile,
  createSlackUser,
  findProfileByTenantIdAndUserId,
  findUserBySlackUserId,
  getTenantBySlackTeamId,
} from "@/lib/server/service";
import { BASE_URL } from "@/lib/server/settings";

export function createSlackClient(tenant: typeof schema.tenants.$inferSelect) {
  assert(tenant.slackBotToken, "Slack bot token is required");
  return new WebClient(tenant.slackBotToken);
}

type Tenant = typeof schema.tenants.$inferSelect;

export interface SlackSignInOptions {
  slackClientFactory?: (tenant: Tenant) => WebClient;
}

export async function slackSignIn(teamId: string, slackUserId: string, options: SlackSignInOptions = {}) {
  const tenant = await getTenantBySlackTeamId(teamId);

  let user = await findUserBySlackUserId(slackUserId);
  if (!user) {
    const factory = options.slackClientFactory ?? createSlackClient;
    const client = factory(tenant);
    const userInfo = await client.users.info({ user: slackUserId });
    assert(userInfo.user, "User info is required");
    user = await createSlackUser(slackUserId, userInfo.user);
  }

  let profile = await findProfileByTenantIdAndUserId(tenant.id, user.id);
  if (!profile) {
    profile = await createProfile(tenant.id, user.id, "guest");
  }
  return { tenant, profile };
}

export async function shouldReplyToMessage(question?: string) {
  if (!question) {
    console.log(`Skipping message with no text`);
    return false;
  }
  return await isQuestion(question);
}

const IS_QUESTION_PROMPT = Handlebars.compile(`Is the follow text a question?

<text>{{text}}</text>

Answer in the form of a json object.  If the text is a question, answer with:
{"isQuestion": true}

If the text is NOT a question, answer with:
{"isQuestion:" false}`);

const isQuestionSchema = z.object({ isQuestion: z.boolean() });

async function isQuestion(text: string) {
  const { object } = await generateObject({
    model: openai("gpt-4.1-nano-2025-04-14"),
    prompt: IS_QUESTION_PROMPT({ text }),
    schema: isQuestionSchema,
  });
  return object.isQuestion;
}

const IS_ANSWERED_PROMPT =
  Handlebars.compile(`Is the reply to the prompt an insightful answer?  Only answer yes if the reply gives better than general information.

<prompt>{{prompt}}</prompt>
<reply>{{reply}}</reply>

Answer in the form of a json object.  If the text is an insightful answer to the prompt, answer with:
{"isAnswered": true}

If the text is NOT an insightful answer to the prompt, answer with:
{"isAnswered": false}`);

const isAnsweredSchema = z.object({ isAnswered: z.boolean() });

export async function isAnswered(message: string, reply: string) {
  const prompt = IS_ANSWERED_PROMPT({ prompt: message, reply });
  const { object } = await generateObject({
    model: openai("gpt-4.1-nano-2025-04-14"),
    prompt,
    schema: isAnsweredSchema,
  });
  return object.isAnswered;
}

/**
 * Converts markdown formatting to Slack's mrkdwn format
 */
export function convertMarkdownToSlack(text: string): string {
  return (
    text
      // Convert **bold** to *bold*
      .replace(/\*\*(.*?)\*\*/g, "*$1*")
      // Convert __bold__ to *bold*
      .replace(/__(.*?)__/g, "*$1*")
      // Strikethrough: ~~text~~ to ~text~
      .replace(/~~(.*?)~~/g, "~$1~")
  );
  // Keep _italic_ as is (Slack uses this too)
  // Keep `code` as is (Slack uses this too)
  // Keep code blocks as is for now
}

export function formatMessageWithSources(
  object: ConversationMessageResponse,
  replyContext: ReplyContext,
  tenantSlug?: string,
): string {
  // Convert markdown formatting to Slack's mrkdwn format
  let messageText = convertMarkdownToSlack(object.message);

  console.log("Formatting message with sources:", {
    usedSourceIndexes: object.usedSourceIndexes,
    sourcesLength: replyContext.sources?.length || 0,
    sources: replyContext.sources?.slice(0, 3), // Log first 3 sources for debugging
  });

  if (
    object.usedSourceIndexes &&
    object.usedSourceIndexes.length > 0 &&
    replyContext.sources &&
    replyContext.sources.length > 0
  ) {
    messageText += "\n\n:books: *Sources:*";
    let sourcesAdded = 0;

    // Check if any of the usedSourceIndexes are out of bounds
    const validIndexes = object.usedSourceIndexes.filter((index) => index < replyContext.sources.length);
    const hasInvalidIndexes = validIndexes.length !== object.usedSourceIndexes.length;

    if (hasInvalidIndexes) {
      console.warn(
        "Some source indexes are out of bounds. This indicates a mismatch between AI response and deduplicated sources.",
      );
      console.warn(
        `AI referenced indexes: [${object.usedSourceIndexes.join(", ")}], but sources array only has ${replyContext.sources.length} items`,
      );

      // Fallback: show all available sources since the AI referenced content from them
      replyContext.sources.forEach((source, index) => {
        const documentName = source.documentName || source.source_url?.split("/").pop() || "Document";

        // Use public proxy URL for ragieSourceUrl, direct URL for source_url
        let sourceUrl = source.source_url;
        if (!sourceUrl && source.ragieSourceUrl && tenantSlug) {
          const relativePath = getPublicRagieSourcePath(tenantSlug, source.ragieSourceUrl); // Public access, no auth required
          sourceUrl = `${BASE_URL}${relativePath}`;
        } else if (!sourceUrl) {
          sourceUrl = "#";
        }

        messageText += `\n• <${sourceUrl}|${documentName}>`;
        sourcesAdded++;

        console.log(`Added fallback source ${index}:`, { documentName, sourceUrl });
      });
    } else {
      // Normal case: use the specific indexes
      validIndexes.forEach((index) => {
        const source = replyContext.sources[index];
        if (source) {
          const documentName = source.documentName || source.source_url?.split("/").pop() || "Document";

          // Use public proxy URL for ragieSourceUrl, direct URL for source_url
          let sourceUrl = source.source_url;
          if (!sourceUrl && source.ragieSourceUrl && tenantSlug) {
            const relativePath = getPublicRagieSourcePath(tenantSlug, source.ragieSourceUrl); // Public access, no auth required
            sourceUrl = `${BASE_URL}${relativePath}`;
          } else if (!sourceUrl) {
            sourceUrl = "#";
          }

          messageText += `\n• <${sourceUrl}|${documentName}>`;
          sourcesAdded++;

          console.log(`Added source ${index}:`, { documentName, sourceUrl });
        }
      });
    }

    if (sourcesAdded === 0) {
      messageText += "\n• _No sources available_";
      console.warn("No sources were added despite having usedSourceIndexes");
    }
  } else {
    console.log("No used source indexes found or no sources available");
  }

  return messageText;
}
