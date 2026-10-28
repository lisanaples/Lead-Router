const {
  getWorkspace,
  handleOptions,
  parseBody,
  readBody,
  saveWorkspace,
  verifyUserToken,
} = require("./_lead-router-lib");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to archive a lead." });
    return;
  }
  try {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    await verifyUserToken(token);
    const body = parseBody(await readBody(request), request.headers["content-type"] || "");
    const workspace = await getWorkspace();
    const lead = (workspace.leads || []).find((entry) => String(entry.id) === String(body.leadId));
    if (!lead) {
      response.status(404).json({ ok: false, error: "That lead was not found in the shared workspace." });
      return;
    }
    const now = new Date().toISOString();
    lead.status = "archived";
    lead.lostAt = lead.lostAt || now.slice(0, 10);
    lead.updatedAt = now;
    lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
    lead.activity.unshift({ at: now, text: "Lead archived in the shared workspace." });
    await saveWorkspace(workspace);
    response.status(200).json({ ok: true, lead });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
