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

    const notifications = await notifyActiveTeam(workspace, lead);
    recordNotificationDelivery(lead, notifications, "Notifications resent");
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
      text: `Notifications resent to ${summary.eligible} eligible team member(s): ${summary.emailsSent} email(s), ${summary.pushesSent} phone push(es).`,
    });
    lead.updatedAt = new Date().toISOString();
    await saveWorkspace(workspace);

    response.status(200).json({ ok: true, leadId: lead.id, notifications, summary });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
