import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAdminEmail, isAssignableAdminRole } from "../src/routes/admins.js";

test("normalizes administrator email addresses", () => {
  assert.equal(normalizeAdminEmail("  ADMIN@Example.COM "), "admin@example.com");
});

test("only least-privilege operational roles can be assigned", () => {
  assert.equal(isAssignableAdminRole({ name: "manager" }), true);
  assert.equal(isAssignableAdminRole({ name: "content_manager" }), true);
  assert.equal(isAssignableAdminRole({ name: "owner" }), false);
  assert.equal(isAssignableAdminRole({ name: "custom_admin" }), false);
  assert.equal(isAssignableAdminRole(null), false);
});
