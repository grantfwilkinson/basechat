import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { updateTenantSchema } from "@/lib/api";
import { modelArraySchema } from "@/lib/llm/types";
import db from "@/lib/server/db";
import * as schema from "@/lib/server/db/schema";
import { invalidateAuthContextCache } from "@/lib/server/service";
import { requireAdminContextFromRequest } from "@/lib/server/utils";

export async function PATCH(request: NextRequest) {
  const { tenant } = await requireAdminContextFromRequest(request);

  const json = await request.json();
  const update = updateTenantSchema.partial().parse(json);

  // Additional validation for enabledModels if it's being updated
  if (update.enabledModels !== undefined) {
    const modelParseResult = modelArraySchema.safeParse(update.enabledModels);
    if (!modelParseResult.success) {
      return Response.json({ error: "Invalid model array" }, { status: 400 });
    }
  }

  try {
    await db.update(schema.tenants).set(update).where(eq(schema.tenants.id, tenant.id));

    // Invalidate auth context cache so the UI reflects the updated tenant settings
    try {
      await invalidateAuthContextCache(""); // Empty string since we're using revalidateTag internally
    } catch (cacheError) {
      console.warn("Failed to invalidate auth context cache after tenant update:", cacheError);
      // Don't fail the request if cache invalidation fails
    }
  } catch (error) {
    console.error("Failed to update tenant:", error);
    return Response.json({ error: "Failed to update tenant settings" }, { status: 500 });
  }

  return new Response();
}
