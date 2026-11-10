import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkerErrorEvent } from "../src/lib/worker-error-log.js";
import { buildAdminFailureAlert } from "../src/routes/security-alerts.js";

test("Worker error events only accept server-side 5xx statuses", () => {
  assert.equal(normalizeWorkerErrorEvent({ path: "/api/catalog", method: "GET", status: 401 }), null);
  assert.equal(normalizeWorkerErrorEvent({ path: "/api/catalog", method: "GET", status: 500 }).response_status, 500);
});

test("Worker error event fields are sanitized and bounded", () => {
  assert.deepEqual(normalizeWorkerErrorEvent({
    path: "/api/catalog?token=secret",
    method: "post",
    status: 502,
    code: "TELEGRAM_API_ERROR",
    type: "TypeError"
  }), {
    request_path: "/api/catalog",
    request_method: "POST",
    response_status: 502,
    error_code: "TELEGRAM_API_ERROR",
    error_type: "TypeError"
  });
  const invalid = normalizeWorkerErrorEvent({
    path: "/api/a".repeat(200),
    method: "TRACE",
    status: 503,
    code: "secret token",
    type: "Bad Type!"
  });
  assert.equal(invalid.request_path.length, 180);
  assert.equal(invalid.request_method, "OTHER");
  assert.equal(invalid.error_code, null);
  assert.equal(invalid.error_type, "Error");
});

test("Admin failure alert thresholds remain deterministic", () => {
  assert.equal(buildAdminFailureAlert(0).level, "clear");
  assert.equal(buildAdminFailureAlert(1).level, "notice");
  assert.equal(buildAdminFailureAlert(5).level, "warning");
});
