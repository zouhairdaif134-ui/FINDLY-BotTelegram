import test from "node:test";
import assert from "node:assert/strict";

const service = await import("../src/lib/monetization.js").catch(() => ({}));
const UUID = "7f0a2b4d-9d1a-4f6a-9b5a-3a4e5f6b7c8d";

function requireFunction(name) {
  assert.equal(
    typeof service[name],
    "function",
    "src/lib/monetization.js must export " + name
  );
  return service[name];
}

test("validates known provider identities and defaults providers to disabled", () => {
  const validateProviderInput = requireFunction("validateProviderInput");
  const provider = validateProviderInput({
    slug: "monetag",
    name: "Monetag",
    provider_type: "external",
    settings: { site_domain: "findly.example" }
  });
  assert.equal(provider.slug, "monetag");
  assert.equal(provider.is_active, false);
  assert.throws(
    () => validateProviderInput({ slug: "unknown-network", name: "Other" }),
    /provider/i
  );
  assert.throws(
    () => validateProviderInput({
      slug: "monetag",
      name: "Monetag",
      settings: { script: "<script>alert(1)</script>" }
    }),
    /unsupported|script|unsafe/i
  );
});

test("rejects placements whose channel and format are incompatible", () => {
  const validatePlacementInput = requireFunction("validatePlacementInput");
  const placement = validatePlacementInput({
    channel: "website",
    page_key: "home",
    slot_key: "home-top",
    position: "top",
    format: "banner"
  });
  assert.equal(placement.is_enabled, false);
  assert.equal(placement.channel, "website");
  assert.throws(
    () => validatePlacementInput({
      channel: "website",
      page_key: "home",
      slot_key: "home-telegram",
      position: "top",
      format: "telegram_card"
    }),
    /format|channel/i
  );
  assert.throws(
    () => validatePlacementInput({
      channel: "website",
      page_key: "home",
      slot_key: "home-top",
      position: "top",
      format: "banner",
      html: "<script>alert(1)</script>"
    }),
    /unsupported|html|unsafe/i
  );
});

test("campaigns start as drafts and require safe HTTPS destinations", () => {
  const validateCampaignInput = requireFunction("validateCampaignInput");
  const campaign = validateCampaignInput({
    bot_id: UUID,
    provider_id: UUID,
    name: "Telegram partner campaign",
    channel: "telegram",
    format: "telegram_text",
    target_url: "https://ads.example/campaign",
    creative: { body: "Discover this offer", cta_label: "Open offer" }
  });
  assert.equal(campaign.status, "draft");
  assert.throws(
    () => validateCampaignInput({
      bot_id: UUID,
      provider_id: UUID,
      name: "Unsafe campaign",
      channel: "telegram",
      format: "telegram_text",
      status: "active",
      target_url: "https://ads.example/campaign",
      creative: { body: "Offer" }
    }),
    /draft|status/i
  );
  assert.throws(
    () => validateCampaignInput({
      bot_id: UUID,
      provider_id: UUID,
      name: "Unsafe destination",
      channel: "telegram",
      format: "telegram_text",
      target_url: "javascript:alert(1)",
      creative: { body: "Offer" }
    }),
    /https|url|destination/i
  );
});

test("validates revenue as positive decimal values with explicit provenance", () => {
  const validateRevenueInput = requireFunction("validateRevenueInput");
  const revenue = validateRevenueInput({
    amount: "125.50",
    currency: "MAD",
    revenue_source: "external_ad",
    provenance: "manual",
    event_type: "publisher_revenue"
  });
  assert.equal(revenue.amount, "125.50");
  assert.equal(revenue.provenance, "manual");
  assert.throws(
    () => validateRevenueInput({
      amount: "-1",
      currency: "MAD",
      revenue_source: "external_ad",
      provenance: "manual",
      event_type: "publisher_revenue"
    }),
    /amount/i
  );
  assert.throws(
    () => validateRevenueInput({
      amount: "1.999",
      currency: "MAD",
      revenue_source: "external_ad",
      provenance: "manual",
      event_type: "publisher_revenue"
    }),
    /amount|decimal/i
  );
  assert.throws(
    () => validateRevenueInput({
      amount: "10",
      currency: "MAD",
      revenue_source: "subscription",
      provenance: "manual",
      event_type: "subscription_payment"
    }),
    /phase|source|subscription/i
  );
});

test("bounds frequency controls and rejects zero or excessive limits", () => {
  const validateFrequencyPolicyInput = requireFunction("validateFrequencyPolicyInput");
  const policy = validateFrequencyPolicyInput({
    channel: "telegram",
    max_per_user: 2,
    cooldown_seconds: 3600,
    max_per_session: 1,
    rolling_window_minutes: 1440
  });
  assert.equal(policy.max_per_user, 2);
  assert.throws(
    () => validateFrequencyPolicyInput({
      channel: "telegram",
      max_per_user: 0,
      cooldown_seconds: 3600,
      max_per_session: 1,
      rolling_window_minutes: 1440
    }),
    /max_per_user|frequency/i
  );
});

test("builds a safe Telegram text ad with a validated HTTPS CTA", () => {
  const build = requireFunction("buildTelegramAdPayload");
  const payload = build({
    format: "telegram_text",
    target_url: "https://ads.example/offer",
    creative: { title: "<Offer>", body: "Save & enjoy", cta_label: "Open offer" }
  });
  assert.equal(payload.method, "message");
  assert.match(payload.text, /&lt;Offer&gt;/);
  assert.match(payload.text, /Save &amp; enjoy/);
  assert.equal(payload.reply_markup.inline_keyboard[0][0].url, "https://ads.example/offer");
  assert.throws(() => build({
    format: "telegram_text",
    target_url: "javascript:alert(1)",
    creative: { body: "Offer", cta_label: "Open" }
  }), /HTTPS|safe/i);
});

test("builds Telegram image cards without accepting unsafe media URLs", () => {
  const build = requireFunction("buildTelegramAdPayload");
  const payload = build({
    format: "telegram_card",
    target_url: "https://ads.example/offer",
    creative: {
      title: "Partner offer",
      body: "Details",
      cta_label: "View",
      image_url: "https://cdn.example/ad.jpg"
    }
  });
  assert.equal(payload.method, "photo");
  assert.equal(payload.photo, "https://cdn.example/ad.jpg");
  assert.equal(payload.caption, "Partner offer\n\nDetails");
  assert.throws(() => build({
    format: "telegram_card",
    target_url: "https://ads.example/offer",
    creative: {
      title: "Unsafe",
      body: "Details",
      cta_label: "View",
      image_url: "http://cdn.example/ad.jpg"
    }
  }), /HTTPS|safe/i);
});

test("validates the public website placement page allow-list", () => {
  const validate = requireFunction("validatePublicPlacementQuery");
  assert.deepEqual(validate({
    page_key: "movie_details", slot_key: "details-top", origin_host: "www.findly.example",
    visitor_key: UUID, view_id: "223e4567-e89b-42d3-a456-426614174000"
  }), {
    page_key: "movie_details", slot_key: "details-top", origin_host: "www.findly.example",
    visitor_key: UUID, view_id: "223e4567-e89b-42d3-a456-426614174000"
  });
  assert.throws(() => validate({
    page_key: "all_interactions", origin_host: "www.findly.example", visitor_key: UUID, view_id: UUID
  }), /page_key/i);
  assert.throws(() => validate({
    page_key: "home", slot_key: "bad slot", origin_host: "www.findly.example", visitor_key: UUID, view_id: UUID
  }), /slot_key/i);
  assert.throws(() => validate({
    page_key: "home", origin_host: "www.findly.example", visitor_key: "not-a-uuid", view_id: UUID
  }), /visitor_key/i);
});

test("requires a source reference for provider-reported revenue and rejects estimates", () => {
  const validate = requireFunction("validateRevenueLedgerInput");
  const base = {
    amount: "12.50", currency: "MAD", revenue_source: "external_ad",
    event_type: "publisher_revenue"
  };
  assert.equal(validate({ ...base, provenance: "manual" }).provenance, "manual");
  assert.throws(() => validate({ ...base, provenance: "provider_reported" }), /reference/i);
  assert.equal(validate({
    ...base, provenance: "provider_reported", external_reference: "monthly-report-2026-11"
  }).provenance, "provider_reported");
  assert.throws(() => validate({ ...base, provenance: "estimated" }), /estimates/i);
});

test("rejects HTML markup in campaign creative instead of accepting executable snippets", () => {
  const validate = requireFunction("validateCampaignInput");
  assert.throws(() => validate({
    bot_id: UUID,
    provider_id: UUID,
    name: "Markup injection",
    channel: "telegram",
    format: "telegram_text",
    target_url: "https://ads.example/offer",
    creative: {
      body: '<img src=x onerror="alert(1)">',
      cta_label: "Open"
    }
  }), /HTML|executable/i);
});

test("maps Telegram updates to explicit ad interaction triggers", () => {
  const getTrigger = requireFunction("getTelegramAdTrigger");
  assert.equal(getTrigger({ message: { text: "/start movie_123" } }), "start");
  assert.equal(getTrigger({ message: { text: "/search" } }), "search");
  assert.equal(getTrigger({ callback_query: { data: "menu:abc" } }), "callback");
  assert.equal(getTrigger({ message: { text: "hello" } }), "message");
});

test("evaluates campaign and placement schedules at the supplied clock", () => {
  const isActiveSchedule = requireFunction("isActiveSchedule");
  const now = Date.parse("2026-11-06T12:00:00.000Z");
  assert.equal(isActiveSchedule({}, now), true);
  assert.equal(isActiveSchedule({ starts_at: "2026-11-06T13:00:00.000Z" }, now), false);
  assert.equal(isActiveSchedule({ ends_at: "2026-11-06T11:59:59.000Z" }, now), false);
  assert.equal(isActiveSchedule({
    starts_at: "2026-11-06T12:00:00.000Z",
    ends_at: "2026-11-06T12:05:00.000Z"
  }, now), true);
});

test("requires an approved site domain for website provider zones", () => {
  const validate = requireFunction("validateProviderZoneInput");
  const base = {
    provider_id: UUID, channel: "website", format: "banner",
    external_zone_id: "zone-123"
  };
  assert.throws(() => validate(base), /site_domain/i);
  assert.equal(validate({ ...base, site_domain: "www.findly.example" }).site_domain, "www.findly.example");
  assert.equal(validate({
    provider_id: UUID, channel: "telegram", format: "telegram_text",
    external_zone_id: "smartlink-123"
  }).site_domain, null);
});

test("rejects HTML and URL values where a plain provider zone identifier is required", () => {
  const validate = requireFunction("validateProviderZoneInput");
  const base = {
    provider_id: UUID, channel: "website", format: "banner",
    site_domain: "www.findly.example"
  };
  assert.throws(() => validate({ ...base, external_zone_id: "<script>alert(1)</script>" }), /plain provider identifier/i);
  assert.throws(() => validate({ ...base, external_zone_id: "https://ads.example/zone" }), /plain provider identifier/i);
});

test("allows only the registered website host and its true subdomains", () => {
  const isAllowed = requireFunction("isAllowedAdOrigin");
  assert.equal(isAllowed("findly.example", "findly.example"), true);
  assert.equal(isAllowed("www.findly.example", "findly.example"), true);
  assert.equal(isAllowed("ads.findly.example", "findly.example"), true);
  assert.equal(isAllowed("evilfindly.example", "findly.example"), false);
  assert.equal(isAllowed("findly.example.evil.test", "findly.example"), false);
  assert.equal(isAllowed(null, "findly.example"), false);
});

test("keeps website video ads unavailable until a supported player is verified", () => {
  const validateZone = requireFunction("validateProviderZoneInput");
  const validatePlacement = requireFunction("validatePlacementInput");
  const validateCampaign = requireFunction("validateCampaignInput");
  assert.throws(() => validateZone({
    provider_id: UUID, channel: "website", format: "video",
    external_zone_id: "video-zone", site_domain: "www.findly.example"
  }), /video.*not available|player.*verified/i);
  assert.throws(() => validatePlacement({
    channel: "website", page_key: "home", slot_key: "video-slot",
    position: "top", format: "video"
  }), /video.*not available|player.*verified/i);
  assert.throws(() => validateCampaign({
    bot_id: UUID, provider_id: UUID, name: "Video campaign",
    channel: "website", format: "video", target_url: "https://advertiser.example",
    creative: { title: "Video", body: "Video ad" }
  }), /video.*not available|player.*verified/i);
});
