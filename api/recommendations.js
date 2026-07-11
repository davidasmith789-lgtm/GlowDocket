import { google } from "googleapis";

const MAX_USERNAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 2000;
const DAILY_RECOMMENDATION_LIMIT = 10;

// Normalize common attempts to disguise profanity with symbols, punctuation,
// or spaces before checking the message. Keep this server-side so the rule
// cannot be bypassed by calling the endpoint directly.
const PROFANITY_PATTERNS = [
  /\bass(?:hole|hat)?s?\b/,
  /\bbastards?\b/,
  /\bbitch(?:es|y|ing)?\b/,
  /\bbollocks?\b/,
  /\bbullshit(?:ting)?\b/,
  /\bcock(?:s|sucker(?:s)?)?\b/,
  /\bcrap(?:py)?\b/,
  /\bcunts?\b/,
  /\bdamn(?:ed|it)?\b/,
  /\bdicks?\b/,
  /\bdouche(?:bag)?s?\b/,
  /\bfuck(?:s|ed|er|ers|ing|off)?\b/,
  /\bgoddamn(?:ed)?\b/,
  /\bhell\b/,
  /\bmotherfuck(?:er|ers|ing)?\b/,
  /\bpiss(?:ed|ing|es)?\b/,
  /\bpricks?\b/,
  /\bpuss(?:y|ies)\b/,
  /\bsh[i1]t(?:s|ty|ting|head(?:s)?)?\b/,
  /\bsluts?\b/,
  /\bwhores?\b/,
  /\bwtf\b/,
];

function normalizeForProfanityCheck(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[8]/g, "b")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[7+]/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsProfanity(message) {
  const normalized = normalizeForProfanityCheck(message);
  const joined = normalized.replace(/\s+/g, "");
  return PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(joined));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDocumentText(document) {
  return (document.body?.content || [])
    .flatMap((element) => element.paragraph?.elements || [])
    .map((element) => element.textRun?.content || "")
    .join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const rawUsername = body?.username;
    const rawMessage = body?.message;

    if (
      typeof rawUsername !== "string" ||
      typeof rawMessage !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: "Username and message are required.",
      });
    }

    const username = rawUsername
      .trim()
      .replace(/[\r\n:]+/g, " ")
      .slice(0, MAX_USERNAME_LENGTH);

    const message = rawMessage.trim().slice(0, MAX_MESSAGE_LENGTH);

    if (!username || !message) {
      return res.status(400).json({
        success: false,
        error: "Username and message cannot be empty.",
      });
    }

    if (containsProfanity(message)) {
      return res.status(400).json({
        success: false,
        error: "Your recommendation cannot be sent because it contains profanity. Please revise it and try again.",
      });
    }

    const environment = globalThis.process?.env || {};
    const documentId = environment.GOOGLE_DOC_ID;
    const clientEmail = environment.GOOGLE_CLIENT_EMAIL;
    const privateKey = environment.GOOGLE_PRIVATE_KEY;

    if (!documentId || !clientEmail || !privateKey) {
      console.error("Missing Google recommendations environment variables.");

      return res.status(500).json({
        success: false,
        error: "Recommendations are not configured correctly.",
      });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/documents"],
    });

    const docs = google.docs({
      version: "v1",
      auth,
    });

    const dateKey = new Date().toISOString().slice(0, 10);
    const document = await docs.documents.get({ documentId });
    const documentText = getDocumentText(document.data);
    const dailyEntryPattern = new RegExp(
      `^\\[${escapeRegExp(dateKey)}\\] ${escapeRegExp(username)}:`,
      "gim",
    );
    const messagesToday = documentText.match(dailyEntryPattern)?.length || 0;

    if (messagesToday >= DAILY_RECOMMENDATION_LIMIT) {
      return res.status(429).json({
        success: false,
        error: "You have reached the limit of 10 recommendations per day. Please try again tomorrow.",
      });
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              endOfSegmentLocation: {},
              text: `[${dateKey}] ${username}: ${message}\n\n`,
            },
          },
        ],
      },
    });

    return res.status(200).json({
      success: true,
      remainingToday: DAILY_RECOMMENDATION_LIMIT - messagesToday - 1,
    });
  } catch (error) {
    console.error("Recommendation submission failed:", error);

    return res.status(500).json({
      success: false,
      error: "Your recommendation could not be submitted.",
    });
  }
}
