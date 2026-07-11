import { google } from "googleapis";

const MAX_USERNAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 2000;

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

    const documentId = process.env.GOOGLE_DOC_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

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

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              endOfSegmentLocation: {},
              text: `${username}: ${message}\n\n`,
            },
          },
        ],
      },
    });

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("Recommendation submission failed:", error);

    return res.status(500).json({
      success: false,
      error: "Your recommendation could not be submitted.",
    });
  }
}