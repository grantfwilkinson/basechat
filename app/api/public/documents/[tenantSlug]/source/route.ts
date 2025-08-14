import { NextRequest } from "next/server";
import { z } from "zod";

import { getRagieApiKey } from "@/lib/server/ragie";
import { findTenantBySlug } from "@/lib/server/service";
import { RAGIE_API_BASE_URL } from "@/lib/server/settings";

const paramsSchema = z.object({
  url: z.string(),
});

interface RouteParams {
  params: Promise<{ tenantSlug: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { tenantSlug } = await params;

  const parsedParams = paramsSchema.safeParse({
    url: request.nextUrl.searchParams.get("url"),
  });

  if (!parsedParams.success) {
    return new Response("Invalid URL params", { status: 422 });
  }

  const { url } = parsedParams.data;

  // Find tenant by slug (no authentication required)
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) {
    return new Response("Tenant not found", { status: 404 });
  }

  // Validate URL is from Ragie
  if (!url.startsWith(RAGIE_API_BASE_URL)) {
    return new Response("Invalid URL", { status: 400 });
  }

  try {
    const ragieApiKey = await getRagieApiKey(tenant);

    const upstreamResponse = await fetch(url, {
      headers: {
        authorization: `Bearer ${ragieApiKey}`,
        partition: tenant.ragiePartition || tenant.id,
      },
    });

    // If there's no body, bail out:
    if (!upstreamResponse.body) {
      console.error("No body in upstream response");
      return new Response("No body in upstream response", { status: 500 });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers,
    });
  } catch (error) {
    console.error("Error in public source route:", error);
    return new Response("Error fetching document source", { status: 500 });
  }
}
