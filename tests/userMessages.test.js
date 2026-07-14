import test from "node:test";
import assert from "node:assert/strict";
import { friendlyAccountError, friendlyCloudSaveError } from "../src/userMessageUtils.js";

test("account errors translate backend details into useful user language", () => {
  assert.match(friendlyAccountError(new Error("Invalid login credentials")), /email or password/i);
  assert.match(friendlyAccountError(new Error("JWT expired")), /sign-in has expired/i);
  assert.doesNotMatch(friendlyAccountError(new Error("Supabase API 503 UUID")), /supabase|api|uuid/i);
});

test("cloud errors reassure users that device data remains safe", () => {
  assert.match(friendlyCloudSaveError(), /stored on this device/i);
  assert.match(friendlyCloudSaveError({ offline: true }), /sync when you reconnect/i);
});
