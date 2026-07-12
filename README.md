# TaskCabinet

TaskCabinet is a browser-local assignment planner built for students. It combines assignment tracking, due-date planning, course organization, independent checklists, calendar views, recommendations, workspace widgets, personalization, archive/trash recovery, and optional browser notifications in one React application.

## Run locally

Requirements: a current Node.js release and npm.

```powershell
npm install
npm run dev
```

Useful verification commands:

```powershell
npm run test
npm run lint
npm run build
```

`npm run dev:vercel` is only needed when testing Vercel functions locally.

## Architecture

- `src/App.jsx` contains the shared React state and the main product workflows: local accounts, assignments, courses, settings, widgets, calendar, checklists, imports, attachments, archive, and trash.
- `src/App.css` contains the application theme, responsive layout, widget, modal, calendar, settings, and task-card styles.
- `src/workspaceLayout.js` is the source of truth for widget defaults, sizing, placement, collapse behavior, migration, and desktop/mobile layouts.
- `src/*Utils.js` modules contain pure date, ranking, import, and voice-undo logic. These functions are covered by `tests/workspace.test.js`.
- `public/sw.js` provides the production-only network-first service worker and installable app shell.
- `api/voice-assignments.js` is an optional Vercel audio-processing endpoint. The current UI primarily uses the browser's built-in speech-recognition API.

## Browser-local data

TaskCabinet stores product data in the current browser. Signing in selects a local profile; it does not create a cloud account. Important per-profile data includes:

- assignments and their archive/trash state;
- courses and course colors;
- settings and personalization;
- standalone checklists;
- desktop and mobile widget layouts.

Attachments are stored in IndexedDB. Compatibility-sensitive keys still use the historical `taskacadia_` prefix and should not be renamed without a data migration. Clearing site data removes locally stored TaskCabinet information.

## Major product areas

- **Dashboard:** Recommended Plan of Attack, What Should I Do, reminders, course overview, statistics, mini calendar, and movable widgets.
- **Assignments:** To Do, In Progress, Completed, repeating work, estimates, priorities, notes, links, files, and checklist steps.
- **Calendar:** fixed full-calendar month/week views plus a movable dashboard mini calendar.
- **Checklists:** independent colored lists with optional deadlines and reminders.
- **Settings:** assignment defaults, field visibility, calendar behavior, notifications, school cycles, appearance, custom themes, archive, trash, and workspace guidance.
- **Imports:** pasted assignment lists and local PDF, DOCX, TXT, Markdown, or CSV syllabus extraction.

## Voice assignments

Voice assignment creation appears only in browsers that expose `SpeechRecognition` or `webkitSpeechRecognition`. Recognition happens through the browser and feeds the same local assignment-creation path as manual entry. The manual Add Assignment form remains available in every supported browser.

## Deployment

The application is configured for Vite and Vercel. A production build is created with:

```powershell
npm run build
```

Vercel can deploy the generated application from the connected repository. The service worker is registered only in production builds.

## Optional external reminders

TaskCabinet can use OneSignal Web Push for assignment reminders while the app is closed. Full assignments remain in the browser. Supabase stores only an opaque profile-installation ID, task/occurrence identifiers, OneSignal subscription and message IDs, title, course, deadline, timezone, lead time, revision, and scheduling/cleanup state. Notification text may appear on a device lock screen.

### OneSignal setup

1. Create a OneSignal Web app for the exact production origin. HTTPS and an exact origin match are required.
2. Set the worker path to `/push/onesignal/OneSignalSDKWorker.js` and its scope to `/push/onesignal/`.
3. Keep TaskCabinet's `/sw.js` worker enabled; the narrower OneSignal scope prevents a registration conflict.
4. Put the public App ID in `VITE_ONESIGNAL_APP_ID`. Put the server API key only in `ONESIGNAL_API_KEY`.
5. On iPhone/iPad, install TaskCabinet to the Home Screen and open the installed app before enabling Push Reminders.

### Supabase registry

1. Create or select a Supabase project.
2. Review and run `supabase/migrations/202607120001_create_push_reminder_registry.sql` in that project. Codex does not run it automatically.
3. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` only in the Vercel server environment. `SUPABASE_SECRET_KEY` means the current server secret/service-role credential supplied by Supabase; never expose it through a `VITE_` variable.
4. The migration enables RLS and revokes browser roles. Only Vercel Functions use the registry.

### Environment and cron

Copy `.env.example` for names and placeholders. Public variables are `VITE_EXTERNAL_PUSH_ENABLED` and `VITE_ONESIGNAL_APP_ID`. Server-only variables are `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY`, `PUSH_SIGNING_SECRET`, `PUSH_ALLOWED_ORIGIN`, `EXTERNAL_PUSH_ENABLED`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `CRON_SECRET`.

`vercel.json` invokes `GET /api/reminders/process-horizon` once daily at `17 6 * * *` (06:17 UTC), compatible with Vercel Hobby's daily cron limit. Vercel sends `Authorization: Bearer <CRON_SECRET>`; the endpoint rejects requests without an exact match. Reminders more than 28 days away remain `pending_horizon` until a daily run promotes them.

### Local testing and production review

The React UI can run locally, but real closed-app delivery requires a configured OneSignal origin, Supabase registry, server environment, notification permission, internet access, and compatible browser/OS settings. Before production, test enable/disable, test push, add/edit/complete/delete/restore, repeating occurrences, lead-time changes, offline cleanup retry, subscription refresh, cron promotion, lock-screen wording, and notification clicks on supported desktop browsers, Android PWA, and iOS Home Screen.

### Kill switches and rollback

- `VITE_EXTERNAL_PUSH_ENABLED=false` hides/disables new browser enrollment controls after rebuilding.
- `EXTERNAL_PUSH_ENABLED=false` blocks schedules, replacements, and tests while cancellation, cancel-all, cleanup reconciliation, and cron cleanup remain available.
- To roll back, turn off both switches, leave the existing open-app reminder checker enabled, run/trigger cleanup, and verify the registry contains no remaining scheduled messages before removing OneSignal code.

Never log or expose the OneSignal API key, push signing secret, Supabase secret, full assignments, notes, passwords, visible usernames, arbitrary notification text, or external notification URLs.

Reminder endpoints also enforce exact origin checks, signed installation ownership after enrollment, strict fixed payloads/targets, bounded reconciliation batches, and a best-effort per-instance request limit. For a larger public deployment, add an infrastructure-level distributed rate limiter in front of the Vercel Functions.

## Maintenance rules

- Preserve localStorage and IndexedDB compatibility when changing persistence.
- Add workspace migrations instead of resetting saved widget layouts.
- Keep the full Calendar page fixed; only the mini calendar is a workspace widget.
- Update tests when changing pure helpers, saved-layout behavior, ranking, or date calculations.
- Run test, lint, build, and `git diff --check` before deployment.
