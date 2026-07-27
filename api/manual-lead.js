const {
  getWorkspace,
  handleOptions,
  leadFromPayload,
  notifyActiveTeam,
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
    lead.activity.unshift({
      at: new Date().toISOString(),
      text: "Lead created from pasted email inside Lead Router.",
    });
    workspace.leads.unshift(lead);
    const notifications = await notifyActiveTeam(workspace, lead);
    lead.activity.unshift({
      at: new Date().toISOString(),
      text: `Email/push notification attempted for ${notifications.length} team member(s).`,
    });

    await saveWorkspace(workspace);
    response.status(200).json({ ok: true, leadId: lead.id, lead, notifications });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
