import { handleReminderCron } from "../../server/services/reminderService.js";
export default (req, res) => handleReminderCron(req, res);
