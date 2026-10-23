const {
  getWorkspace,
  handleOptions,
  notifyActiveTeam,
  recordNotificationDelivery,
  parseBody,
  readBody,
  saveWorkspace,
  verifyUserToken,
} = require("./_lead-router-lib");

function noticeLabel(number) {
  const words = { 2: "Second notice", 3: "Third notice", 4: "Fourth notice", 5: "Fifth notice" };
  if (words[number]) return words[number];
  const remainder = number % 100;
  const suffix = remainder >= 11 && remainder <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
  return `${number}${suffix} notice`;
}

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to resend lead notifications." });
    return;
  }

  try {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    await verifyUserToken(token);
    const payload = parseBody(await readBody(request), request.headers["content-type"] || "");
    const workspace = await getWorkspace();
    const lead = (workspace.leads || []).find((entry) => String(entry.id) === String(payload.leadId));
    if (!lead) {
      response.status(404).json({ ok: false, error: "That lead was not found." });
      return;
    }
    if (lead.status !== "new" || String(lead.assignedTo || "").trim()) {
      response.status(409).json({ ok: false, error: `${lead.name} is already claimed. No reminder was sent.` });
      return;
    }

    const reminderNumber = Number(lead.reminderNoticeCount || 0) + 1;
    const label = noticeLabel(reminderNumber + 1);
    const notifications = await notifyActiveTeam(workspace, lead, { noticeLabel: label });
    lead.reminderNoticeCount = reminderNumber;
    recordNotificationDelivery(lead, notifications, label);
    const summary = {
      eligible: notifications.length,
      emailsSent: notifications.filter((entry) => entry.email).length,
      pushesSent: notifications.reduce((total, entry) => total + Number(entry.pushCount || (entry.push ? 1 : 0)), 0),
      pushNotEnabled: notifications
        .filter((entry) => entry.pushSkipped)
        .map((entry) => entry.member),
    };

    lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
    lead.activity.unshift({
      at: new Date().toISOString(),
      text: `${label} sent to ${summary.eligible} eligible team member(s): ${summary.emailsSent} email(s), ${summary.pushesSent} phone push(es).`,
    });
    lead.updatedAt = new Date().toISOString();
    await saveWorkspace(workspace);

    response.status(200).json({ ok: true, leadId: lead.id, noticeLabel: label, notifications, summary });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
