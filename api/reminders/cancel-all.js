import { handleReminderRequest } from "./_service.js";
export default (req, res) => handleReminderRequest("cancelAll", req, res);
