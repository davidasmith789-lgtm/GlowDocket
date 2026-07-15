import { handleReminderRequest } from "../../server/services/reminderService.js";
export default (req, res) => handleReminderRequest("schedule", req, res);
