import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("calendar and telemetry features are lazy-loaded outside the application entry", async () => {
  const app = await read("../src/App.jsx");
  const calendarFeature = await read("../src/CalendarFeature.jsx");
  const deferredCalendar = await read("../src/components/DeferredCalendar.jsx");
  const telemetry = await read("../src/Telemetry.jsx");

  assert.match(app, /import DeferredCalendar from "\.\/components\/DeferredCalendar\.jsx"/);
  assert.match(deferredCalendar, /lazy\(\(\) => import\("\.\.\/CalendarFeature\.jsx"\)\)/);
  assert.match(app, /lazy\(\(\) => import\("\.\/Telemetry\.jsx"\)\)/);
  assert.doesNotMatch(app, /from "react-calendar"/);
  assert.doesNotMatch(app, /from "@vercel\/(analytics|speed-insights)/);
  assert.match(calendarFeature, /from "react-calendar"/);
  assert.match(telemetry, /from "@vercel\/analytics\/react"/);
  assert.match(telemetry, /from "@vercel\/speed-insights\/react"/);
});

test("external push SDK loads only when push initialization is requested", async () => {
  const reminders = await read("../src/externalReminderClient.js");

  assert.doesNotMatch(reminders, /^import OneSignal from "react-onesignal"/m);
  assert.match(reminders, /import\("react-onesignal"\)/);
  assert.match(reminders, /const OneSignal = await loadOneSignal\(\)/);
});

test("cloud sync SDK is split from the startup bundle", async () => {
  const client = await read("../src/supabaseClient.js");
  const app = await read("../src/App.jsx");

  assert.doesNotMatch(client, /^import .*from "@supabase\/supabase-js"/m);
  assert.match(client, /import\("@supabase\/supabase-js"\)/);
  assert.match(client, /export async function getSupabaseBrowserClient/);
  assert.doesNotMatch(app, /(?<!await )getSupabaseBrowserClient\(\)\.auth/);
});
