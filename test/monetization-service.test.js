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
