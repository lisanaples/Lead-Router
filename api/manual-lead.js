const {
  getWorkspace,
  handleOptions,
  leadFromPayload,
  routeRepeatLead,
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
    response.status(405).json({ ok: false, error: "Use POST to create a lead." });
    return;
  }

  try {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    await verifyUserToken(token);
    const payload = parseBody(await readBody(request), request.headers["content-type"] || "");
    const workspace = await getWorkspace();
    workspace.leads = Array.isArray(workspace.leads) ? workspace.leads : [];
    workspace.team = Array.isArray(workspace.team) ? workspace.team : [];
    workspace.settings = workspace.settings || {};

    const lead = leadFromPayload(payload);
    const recentDuplicate = workspace.leads.find((entry) => {
      const age = Date.now() - Date.parse(entry.createdAt || 0);
      if (!Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000) return false;
      const sameEmail = lead.email && String(entry.email || "").trim().toLowerCase() === String(lead.email).trim().toLowerCase();
      const samePhone = lead.phone && String(entry.phone || "").replace(/\D/g, "") === String(lead.phone).replace(/\D/g, "");
      const normalizedName = String(lead.name || "").trim().toLowerCase();
      const sameName = normalizedName && !/^(new lead|new buyer|new seller|unknown)$/.test(normalizedName)
        && String(entry.name || "").trim().toLowerCase() === normalizedName;
      const sameProperty = String(entry.property || "").trim().toLowerCase() === String(lead.property || "").trim().toLowerCase();
      const sameMessage = String(entry.message || "").trim() && String(entry.message || "").trim() === String(lead.message || "").trim();
      return sameMessage || ((sameEmail || samePhone || sameName) && sameProperty);
    });
    if (recentDuplicate) {
      response.status(200).json({ ok: true, leadId: recentDuplicate.id, lead: recentDuplicate, duplicateSubmission: true, repeatLead: Boolean(recentDuplicate.isRepeat), notifications: [] });
      return;
    }
    const previousLead = routeRepeatLead(workspace, lead);
    lead.activity.unshift({
      at: new Date().toISOString(),
      text: "Lead created from pasted email inside Lead Relay.",
    });
    workspace.leads.unshift(lead);
    const notifications = await notifyActiveTeam(workspace, lead);
    recordNotificationDelivery(lead, notifications, "Initial lead notification");
    lead.activity.unshift({
      at: new Date().toISOString(),
      text: previousLead
        ? `Repeat-lead notification attempted only for ${lead.assignedTo}.`
        : `Email/push notification attempted for ${notifications.length} team member(s).`,
    });

    await saveWorkspace(workspace);
    response.status(200).json({ ok: true, leadId: lead.id, lead, repeatLead: Boolean(previousLead), notifications });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
