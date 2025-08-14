import { jest } from "@jest/globals";
import { eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/lib/server/db/schema";
import {
  createTestUser,
  createTestTenant,
  initTestDb,
  closeTestDb,
  cleanupTestTenant,
  randomTestString,
  cleanupTestUser,
} from "@/lib/test";

import { slackSignIn, SlackSignInOptions, convertMarkdownToSlack } from "./utils";

let db: NodePgDatabase<typeof schema>;

beforeAll(async () => {
  const testDbSetup = await initTestDb();
  db = testDbSetup.db;
});

afterAll(async () => {
  await closeTestDb();
});

describe("slackSignIn", () => {
  let options: SlackSignInOptions;

  beforeEach(() => {
    options = {
      slackClientFactory: jest.fn(() => {
        return {
          users: {
            info: jest.fn<() => Promise<any>>().mockResolvedValue({
              user: {
                id: "mock-user-id",
                name: "mock-user",
                real_name: "Mock User",
              },
            }),
          },
        } as any;
      }),
    };
  });

  describe("when the team does NOT exist", () => {
    const slackTeamId = "does-not-exist";

    beforeEach(async () => {
      const tenant = await db.query.tenants.findFirst({
        where: eq(schema.tenants.slackTeamId, slackTeamId),
      });
      expect(tenant).toBeUndefined();
    });

    it("should throw an error", async () => {
      await expect(slackSignIn(slackTeamId, "slack-user-123")).rejects.toThrow("expected single record");
    });
  });

  describe("when the team exists", () => {
    const slackTeamId = randomTestString();
    let tenant: typeof schema.tenants.$inferSelect;

    beforeEach(async () => {
      tenant = await createTestTenant({ slackTeamId });
    });

    afterEach(async () => {
      await cleanupTestTenant(tenant.id);
    });

    describe("when the user does NOT exist", () => {
      const slackUserId = randomTestString();

      beforeEach(async () => {
        await expect(
          db.query.users.findFirst({ where: eq(schema.users.slackUserId, slackUserId) }),
        ).resolves.toBeUndefined();
      });

      it("should create a new user", async () => {
        const result = await slackSignIn(slackTeamId, slackUserId, options);

        await expect(db.query.users.findFirst({ where: eq(schema.users.slackUserId, slackUserId) })).resolves.toEqual(
          expect.objectContaining({
            slackUserId,
          }),
        );

        expect(result).toEqual({
          tenant,
          profile: expect.objectContaining({
            userId: expect.any(String),
            tenantId: tenant.id,
            role: "guest",
          }),
        });
      });
    });

    describe("when the user exists", () => {
      let slackUserId = randomTestString();
      let user: typeof schema.users.$inferSelect;

      beforeEach(async () => {
        user = await createTestUser({ slackUserId: slackUserId });
      });

      afterEach(async () => {
        await cleanupTestUser(user.id);
      });

      it("should return the user", async () => {
        const result = await slackSignIn(slackTeamId, slackUserId, options);

        expect(result).toEqual({
          tenant,
          profile: expect.objectContaining({
            userId: user.id,
            tenantId: tenant.id,
            role: "guest",
          }),
        });
      });
    });
  });
});

describe("convertMarkdownToSlack", () => {
  it("should convert **bold** to *bold*", () => {
    const input = "This is **bold text** and **another bold**.";
    const expected = "This is *bold text* and *another bold*.";
    expect(convertMarkdownToSlack(input)).toBe(expected);
  });

  it("should convert __bold__ to *bold*", () => {
    const input = "This is __bold text__ and __another bold__.";
    const expected = "This is *bold text* and *another bold*.";
    expect(convertMarkdownToSlack(input)).toBe(expected);
  });

  it("should convert ~~strikethrough~~ to ~strikethrough~", () => {
    const input = "This is ~~strikethrough~~ text.";
    const expected = "This is ~strikethrough~ text.";
    expect(convertMarkdownToSlack(input)).toBe(expected);
  });

  it("should keep _italic_ unchanged", () => {
    const input = "This is _italic_ text.";
    const expected = "This is _italic_ text.";
    expect(convertMarkdownToSlack(input)).toBe(expected);
  });

  it("should keep `code` unchanged", () => {
    const input = "This is `code` text.";
    const expected = "This is `code` text.";
    expect(convertMarkdownToSlack(input)).toBe(expected);
  });

  it("should handle complex mixed formatting", () => {
    const input = "**Sick Days Coverage:** This is __important__ and ~~crossed out~~ with `code`.";
    const expected = "*Sick Days Coverage:* This is *important* and ~crossed out~ with `code`.";
    expect(convertMarkdownToSlack(input)).toBe(expected);
  });
});
