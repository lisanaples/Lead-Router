const {
  getWorkspace,
  handleOptions,
  leadFromPayload,
  notifyActiveTeam,
  parseBody,
  readBody,
  saveWorkspace,
} = require("./_lead-router-lib");

function isAuthorized(request) {
  const expected = process.env.LEAD_ROUTER_INTAKE_SECRET;
  if (!expected) return false;
  const provided = request.headers["x-lead-router-secret"] || new URL(request.url, "https://lead-router.local").searchParams.get("secret");
  return provided === expected;
}

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

  if (request.method === "GET") {
    response.status(200).json({
      ok: true,
      message: "Lead Router intake is ready. Send POST requests with the x-lead-router-secret header.",
      acceptedFields: ["source", "type", "name", "phone", "email", "property", "price", "urgency", "message", "raw"],
    });
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST for incoming leads." });
    return;
  }

  if (!isAuthorized(request)) {
    response.status(401).json({ ok: false, error: "Missing or incorrect intake secret." });
    return;
  }

  try {
    const raw = await readBody(request);
    const payload = parseBody(raw, request.headers["content-type"] || "");
    const workspace = await getWorkspace();
    workspace.leads = Array.isArray(workspace.leads) ? workspace.leads : [];
    workspace.team = Array.isArray(workspace.team) ? workspace.team : [];
    workspace.settings = workspace.settings || {};

    const lead = leadFromPayload(payload);
    workspace.leads.unshift(lead);
    const notifications = await notifyActiveTeam(workspace, lead);
    lead.activity.unshift({
      at: new Date().toISOString(),
      text: `Email/push notification attempted for ${notifications.length} team member(s).`,
    });

    await saveWorkspace(workspace);
    response.status(200).json({ ok: true, leadId: lead.id, notifications });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
