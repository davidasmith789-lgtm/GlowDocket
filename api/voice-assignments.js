import process from "node:process";

/*
 * Optional Vercel server endpoint for recorded-audio transcription and parsing.
 * The current client primarily uses browser SpeechRecognition, but this module
 * remains isolated so a hosted audio workflow can be enabled without exposing
 * an API key to the browser.
 */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_ASSIGNMENTS = 10;

function getConfiguredApiKey() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const isPlaceholder = /^(your_|replace|placeholder|example)/i.test(apiKey);
  return apiKey && !isPlaceholder ? apiKey : null;
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

const assignmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "category", "course", "dueYear", "dueMonth", "dueDay",
    "dueHour", "dueAmPm", "estimatedMinutes", "priority", "repeat",
    "notes", "subtasks", "assumptions",
  ],
  properties: {
    title: nullableString,
    category: { anyOf: [{ type: "string", enum: ["School", "Work", "Personal"] }, { type: "null" }] },
    course: nullableString,
    dueYear: nullableNumber,
    dueMonth: nullableNumber,
    dueDay: nullableNumber,
    dueHour: nullableString,
    dueAmPm: { anyOf: [{ type: "string", enum: ["AM", "PM"] }, { type: "null" }] },
    estimatedMinutes: nullableNumber,
    priority: { anyOf: [{ type: "string", enum: ["LOW", "MED", "HIGH"] }, { type: "null" }] },
    repeat: { anyOf: [{ type: "string", enum: ["NONE", "DAILY", "EVERY_OTHER_WEEKDAY", "WEEKLY", "MONTHLY"] }, { type: "null" }] },
    notes: nullableString,
    subtasks: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: { type: "string" } },
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
  },
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assignments", "assumptions", "skipped"],
  properties: {
    assignments: { type: "array", maxItems: MAX_ASSIGNMENTS, items: assignmentSchema },
    assumptions: { type: "array", items: { type: "string" } },
    skipped: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reason"],
        properties: { reason: { type: "string" } },
      },
    },
  },
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function readOpenAIError(response) {
  const payload = await response.json().catch(() => ({}));
  return payload?.error?.message || `OpenAI request failed with status ${response.status}.`;
}

function extractResponseText(payload) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

async function transcribeAudio(audio, apiKey, courseNames) {
  const body = new FormData();
  body.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  body.append("file", audio, audio.name || "glowdocket-voice.webm");
  if (courseNames.length > 0) {
    body.append("prompt", `Likely course names: ${courseNames.join(", ")}`);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body,
    signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw new Error(await readOpenAIError(response));
  const payload = await response.json();
  return String(payload.text || "").trim();
}

async function parseAssignments(transcript, context, apiKey) {
  const currentDate = String(context.currentDate || new Date().toISOString());
  const timeZone = String(context.timeZone || "America/New_York");
  const courses = Array.isArray(context.courses)
    ? context.courses.slice(0, 100).map(String)
    : [];
  const defaults = context.defaults && typeof context.defaults === "object"
    ? context.defaults
    : {};

  const instructions = [
    "Extract one or more student assignments from the transcript.",
    `Return at most ${MAX_ASSIGNMENTS} assignments in the order spoken.`,
    "Never invent a title. Put speech that is not an assignment in skipped.",
    "Use null for details that were not spoken; the client applies user defaults.",
    "Resolve relative dates using the supplied current date and timezone, and include dueYear.",
    "Use 12-hour dueHour values such as 3:00 or 11:45 with a separate AM/PM.",
    "Match known course names case-insensitively when possible. Preserve a clearly spoken new course name.",
    "Checklist steps belong in subtasks. Do not extract files or spoken URLs.",
    "List every interpretation or default-worthy uncertainty in assumptions, both globally and per assignment.",
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PARSE_MODEL || "gpt-5.4-mini",
      instructions,
      input: JSON.stringify({ transcript, currentDate, timeZone, courses, defaults }),
      text: {
        format: {
          type: "json_schema",
          name: "glowdocket_voice_assignments",
          strict: true,
          schema: responseSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw new Error(await readOpenAIError(response));
  const payload = await response.json();
  const outputText = extractResponseText(payload);
  if (!outputText) throw new Error("The AI response did not include assignment data.");
  return JSON.parse(outputText);
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return json({ error: "Only POST requests are accepted." }, 405);
    }

    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && origin !== requestUrl.origin) {
      return json({ error: "Cross-origin requests are not accepted." }, 403);
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (contentLength && contentLength > MAX_AUDIO_BYTES + 100000) {
      return json({ error: "The recording is too large." }, 413);
    }

    const apiKey = getConfiguredApiKey();
    if (!apiKey) {
      return json({
        error: "Voice creation needs a real OPENAI_API_KEY in the Vercel environment. Add the key, restart vercel dev, and try again.",
        code: "missing_openai_api_key",
      }, 503);
    }

    try {
      const formData = await request.formData();
      const audio = formData.get("audio");
      if (!(audio instanceof File) || !audio.type.startsWith("audio/")) {
        return json({ error: "A supported audio recording is required." }, 400);
      }
      if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
        return json({ error: "Recordings must be between 1 byte and 4 MB." }, 413);
      }

      let context = {};
      try {
        context = JSON.parse(String(formData.get("context") || "{}"));
      } catch {
        return json({ error: "The assignment context was invalid." }, 400);
      }

      const courseNames = Array.isArray(context.courses)
        ? context.courses.slice(0, 100).map(String)
        : [];
      const transcript = await transcribeAudio(audio, apiKey, courseNames);
      if (!transcript) {
        return json({ error: "No speech was understood. Please try again." }, 422);
      }

      const parsed = await parseAssignments(transcript, context, apiKey);
      return json({ transcript, ...parsed });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      const upstreamMessage = String(error?.message || "");
      const quotaUnavailable = /insufficient_quota|exceeded your current quota|billing/i.test(upstreamMessage);
      const invalidKey = /invalid_api_key|incorrect api key|invalid authentication/i.test(upstreamMessage);
      return json({
        error: timedOut
          ? "Voice processing took too long. Please try a shorter recording."
          : quotaUnavailable
            ? "OpenAI API billing or credits are not active for this project. Add billing in the OpenAI platform, then try again."
            : invalidKey
              ? "OpenAI rejected the configured API key. Create a new project key and update the Vercel environment."
          : "The recording could not be processed right now. Please try again.",
        code: timedOut
          ? "openai_timeout"
          : quotaUnavailable
            ? "openai_quota_unavailable"
            : invalidKey
              ? "invalid_openai_api_key"
              : "voice_processing_failed",
      }, timedOut ? 504 : quotaUnavailable ? 503 : 502);
    }
  },
};
