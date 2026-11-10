import test from "node:test";
import assert from "node:assert/strict";
import { buildAdminFailureAlert } from "../src/routes/security-alerts.js";

test("security alerts remain clear when no audited failures exist", () => {
  assert.equal(buildAdminFailureAlert(0).level, "clear");
});

test("security alerts notify on a small number of audited failures", () => {
  assert.equal(buildAdminFailureAlert(2).level, "notice");
});

test("security alerts warn at five or more audited failures", () => {
  assert.equal(buildAdminFailureAlert(5).level, "warning");
  assert.equal(buildAdminFailureAlert(8).level, "warning");
});
