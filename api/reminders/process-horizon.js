import { handleReminderCron } from "../../server/services/reminderService.js";
import { renewExpiringWebhookChannels } from "../../server/services/googleCalendarService.js";
import process from "node:process";

export default async function handler(req, res) {
  if (req.method === "GET" && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
    await renewExpiringWebhookChannels().catch((error) => console.error("[google-calendar] channel renewal failed", { message: error.message }));
  }
  return handleReminderCron(req, res);
}
