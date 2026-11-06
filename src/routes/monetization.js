import {
  getMonetizationOverview,
  listAdProviders,
  saveAdProvider,
  setAdProviderStatus,
  listAdProviderZones,
  saveAdProviderZone,
  verifyAdProviderZone,
  setAdProviderZoneStatus,
  listAdPlacements,
  saveAdPlacement,
  listFrequencyPolicies,
  saveFrequencyPolicy,
  listAdCampaigns,
  saveAdCampaign,
  setCampaignStatus,
  addCampaignPlacement,
  removeCampaignPlacement,
  listRevenueEvents,
  recordManualRevenue,
  createRevenueAdjustment,
  listUserExclusions,
  listExclusionCandidates,
  saveUserExclusion,
  deleteUserExclusion
} from "../lib/monetization.js";
import { recordAdminEvent, recordAdminFailure } from "../lib/admin-audit.js";

const PERMISSIONS = {
  view: "monetization.view",
  providers: "monetization.providers.manage",
  providerVerify: "monetization.providers.verify",
  placements: "monetization.placements.manage",
  campaigns: "monetization.campaigns.manage",
  transactionsView: "monetization.transactions.view",
  transactionsManage: "monetization.transactions.manage",
  users: "monetization.users.manage"
};

function routeParts(url) {
  return url.pathname.split("/").filter(Boolean).slice(2);
}

function send(helpers, request, data) {
  return helpers.withCors(helpers.success(data), request);
}

function sendFailure(helpers, request, error) {
  const status = error?.code === "23505"
    ? 409
    : error?.code === "PGRST116"
      ? 404
      : Number(error?.status) || (error?.code ? 500 : 400);
  const message = status >= 500
    ? "Monetization operation failed. Check the server log reference."
    : error?.message || "Invalid monetization request";
  console.error("FINDLY_MONETIZATION_API_ERROR", {
    code: error?.code || null,
    status,
    message: status >= 500 ? "Monetization operation failed" : message
  });
  return helpers.withCors(
    helpers.failure(
      status === 409 ? "CONFLICT" : status === 404 ? "NOT_FOUND" : status >= 500 ? "MONETIZATION_ERROR" : "BAD_REQUEST",
      message,
      status
    ),
    request
  );
}

async function authorize(env, request, permission, helpers) {
  const auth = await helpers.requirePermission(env, request, permission);
  if (auth.response) return { response: helpers.withCors(auth.response, request) };
  return { auth };
}

async function audited(env, auth, event, operation) {
  try {
    const result = await operation();
    await recordAdminEvent(env, auth, {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId || result?.id || result?.user_id || null,
      details: event.details || {}
    });
    return result;
  } catch (error) {
    await recordAdminFailure(env, auth, {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId || null,
      failureCode: error?.code || "MONETIZATION_OPERATION_FAILED",
      failureType: error?.name || "Error"
    });
    throw error;
  }
}

export async function handleMonetizationRoute(env, request, url, helpers) {
  if (!url.pathname.startsWith("/api/monetization")) return null;
  const parts = routeParts(url);
  const [resource, id, action, childId] = parts;

  try {
    if (resource === "overview" && parts.length === 1 && request.method === "GET") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      return send(helpers, request, await getMonetizationOverview(env));
    }

    if (resource === "providers" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      return send(helpers, request, await listAdProviders(env));
    }
    if (resource === "providers" && parts.length === 1 && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.providers, helpers);
      if (response) return response;
      const body = await helpers.readJson(request);
      const result = await audited(env, auth, {
        action: "monetization.provider.save",
        entityType: "ad_provider"
      }, () => saveAdProvider(env, body));
      return send(helpers, request, result);
    }
    if (resource === "providers" && parts.length === 3 && action === "status" && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.providers, helpers);
      if (response) return response;
      const body = await helpers.readJson(request);
      if (typeof body.enabled !== "boolean") throw new Error("enabled must be a boolean");
      const result = await audited(env, auth, {
        action: body.enabled ? "monetization.provider.enable" : "monetization.provider.disable",
        entityType: "ad_provider",
        entityId: id,
        details: { enabled: body.enabled }
      }, () => setAdProviderStatus(env, id, body.enabled));
      return send(helpers, request, result);
    }

    if (resource === "provider-zones" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      return send(helpers, request, await listAdProviderZones(env, {
        provider_id: url.searchParams.get("provider_id"),
        channel: url.searchParams.get("channel")
      }));
    }
    if (resource === "provider-zones" && parts.length === 1 && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.providers, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.provider_zone.create",
        entityType: "ad_provider_zone"
      }, async () => saveAdProviderZone(env, await helpers.readJson(request)));
      return send(helpers, request, result);
    }
    if (resource === "provider-zones" && parts.length === 3 && action === "verify" && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.providerVerify, helpers);
      if (response) return response;
      const body = await helpers.readJson(request);
      const result = await audited(env, auth, {
        action: "monetization.provider_zone.verify",
        entityType: "ad_provider_zone",
        entityId: id,
        details: { method: "owner_test_confirmation" }
      }, () => verifyAdProviderZone(env, id, auth, body.confirmation === true));
      return send(helpers, request, result);
    }
    if (resource === "provider-zones" && parts.length === 3 && action === "status" && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.providers, helpers);
      if (response) return response;
      const body = await helpers.readJson(request);
      if (typeof body.enabled !== "boolean") throw new Error("enabled must be a boolean");
      const result = await audited(env, auth, {
        action: body.enabled ? "monetization.provider_zone.enable" : "monetization.provider_zone.disable",
        entityType: "ad_provider_zone",
        entityId: id,
        details: { enabled: body.enabled }
      }, () => setAdProviderZoneStatus(env, id, body.enabled));
      return send(helpers, request, result);
    }

    if (resource === "placements" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      return send(helpers, request, await listAdPlacements(env, {
        channel: url.searchParams.get("channel"),
        page_key: url.searchParams.get("page_key")
      }));
    }
    if (resource === "placements" && parts.length === 1 && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.placements, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.placement.create",
        entityType: "ad_placement"
      }, async () => saveAdPlacement(env, await helpers.readJson(request)));
      return send(helpers, request, result);
    }
    if (resource === "placements" && parts.length === 2 && request.method === "PUT") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.placements, helpers);
      if (response) return response;
      const body = { ...(await helpers.readJson(request)), id };
      const result = await audited(env, auth, {
        action: "monetization.placement.update",
        entityType: "ad_placement",
        entityId: id
      }, () => saveAdPlacement(env, body));
      return send(helpers, request, result);
    }

    if (resource === "frequency-policies" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      return send(helpers, request, await listFrequencyPolicies(env, {
        channel: url.searchParams.get("channel")
      }));
    }
    if (resource === "frequency-policies" && parts.length === 1 && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.placements, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.frequency_policy.update",
        entityType: "ad_frequency_policy"
      }, async () => saveFrequencyPolicy(env, await helpers.readJson(request)));
      return send(helpers, request, result);
    }

    if (resource === "campaigns" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      return send(helpers, request, await listAdCampaigns(env, {
        channel: url.searchParams.get("channel"),
        status: url.searchParams.get("status")
      }));
    }
    if (resource === "campaigns" && parts.length === 1 && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.campaigns, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.campaign.create",
        entityType: "ad_campaign"
      }, async () => saveAdCampaign(env, await helpers.readJson(request)));
      return send(helpers, request, result);
    }
    if (resource === "campaigns" && parts.length === 2 && request.method === "PUT") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.campaigns, helpers);
      if (response) return response;
      const body = { ...(await helpers.readJson(request)), id };
      const result = await audited(env, auth, {
        action: "monetization.campaign.update",
        entityType: "ad_campaign",
        entityId: id
      }, () => saveAdCampaign(env, body));
      return send(helpers, request, result);
    }
    if (resource === "campaigns" && parts.length === 3 && action === "status" && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.campaigns, helpers);
      if (response) return response;
      const body = await helpers.readJson(request);
      const result = await audited(env, auth, {
        action: ["scheduled", "active", "paused", "cancelled"].includes(body.status)\n          ? "monetization.campaign." + body.status\n          : "monetization.campaign.status_invalid",
        entityType: "ad_campaign",
        entityId: id,
        details: { status: body.status || null }
      }, () => setCampaignStatus(env, id, body.status));
      return send(helpers, request, result);
    }
    if (resource === "campaigns" && parts.length === 3 && action === "placements" && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.campaigns, helpers);
      if (response) return response;
      const body = await helpers.readJson(request);
      const result = await audited(env, auth, {
        action: "monetization.campaign.placement.add",
        entityType: "ad_campaign",
        entityId: id,
        details: { placement_id: body.placement_id || null }
      }, () => addCampaignPlacement(env, id, body.placement_id));
      return send(helpers, request, result);
    }
    if (resource === "campaigns" && parts.length === 4 && action === "placements" && request.method === "DELETE") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.campaigns, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.campaign.placement.remove",
        entityType: "ad_campaign",
        entityId: id,
        details: { placement_id: childId }
      }, () => removeCampaignPlacement(env, id, childId));
      return send(helpers, request, result);
    }

    if (resource === "transactions" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.transactionsView, helpers);
      if (response) return response;
      return send(helpers, request, await listRevenueEvents(env, {
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
        revenue_source: url.searchParams.get("revenue_source"),
        currency: url.searchParams.get("currency"),
        provenance: url.searchParams.get("provenance"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        campaign_id: url.searchParams.get("campaign_id")
      }));
    }
    if (resource === "transactions" && parts.length === 1 && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.transactionsManage, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.transaction.manual_entry",
        entityType: "monetization_event"
      }, async () => recordManualRevenue(env, await helpers.readJson(request)));
      return send(helpers, request, result);
    }
    if (resource === "transactions" && parts.length === 3 && action === "reversal" && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.transactionsManage, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.transaction.reversal",
        entityType: "monetization_event",
        entityId: id
      }, async () => createRevenueAdjustment(env, {
        original_event_id: id,
        ...(await helpers.readJson(request))
      }));
      return send(helpers, request, result);
    }

    if (resource === "exclusions" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      return send(helpers, request, await listUserExclusions(env));
    }
    if (resource === "exclusions" && parts.length === 2 && id === "candidates" && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.users, helpers);
      if (response) return response;
      return send(helpers, request, await listExclusionCandidates(env, {
        limit: url.searchParams.get("limit"),
        search: url.searchParams.get("search")
      }));
    }
    if (resource === "exclusions" && parts.length === 1 && request.method === "POST") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.users, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.user.exclude",
        entityType: "telegram_user"
      }, async () => saveUserExclusion(env, await helpers.readJson(request), auth));
      return send(helpers, request, result);
    }
    if (resource === "exclusions" && parts.length === 2 && request.method === "DELETE") {
      const { auth, response } = await authorize(env, request, PERMISSIONS.users, helpers);
      if (response) return response;
      const result = await audited(env, auth, {
        action: "monetization.user.include",
        entityType: "telegram_user",
        entityId: id
      }, () => deleteUserExclusion(env, id));
      return send(helpers, request, result);
    }

    if (resource === "compatibility" && parts.length === 1 && request.method === "GET") {
      const { response } = await authorize(env, request, PERMISSIONS.view, helpers);
      if (response) return response;
      const [providers, zones] = await Promise.all([
        listAdProviders(env),
        listAdProviderZones(env)
      ]);
      return send(helpers, request, {
        channels: {
          website: ["banner", "native", "popup", "video"],
          telegram: ["telegram_text", "telegram_card"]
        },
        providers,
        zones,
        notes: {
          popup_default_enabled: false,
          video_requires_verified_provider_support: true,
          direct_advertiser_billing_locked: true
        }
      });
    }
  } catch (error) {
    return sendFailure(helpers, request, error);
  }

  return helpers.withCors(
    helpers.failure("NOT_FOUND", "Monetization endpoint not found", 404),
    request
  );
}
