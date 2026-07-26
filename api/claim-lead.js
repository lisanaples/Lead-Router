const {
  claimLead,
  getWorkspace,
  parseBody,
  readBody,
  saveWorkspace,
} = require("./_lead-router-lib");

module.exports = async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.status(405).json({ ok: false, error: "Use GET or POST to claim a lead." });
    return;
  }

  try {
    const url = new URL(request.url, "https://lead-router.local");
    const body = request.method === "POST" ? parseBody(await readBody(request), request.headers["content-type"] || "") : {};
    const leadId = body.leadId || url.searchParams.get("leadId") || url.searchParams.get("claim");
    const owner = body.owner || url.searchParams.get("owner");
    const workspace = await getWorkspace();
    const result = claimLead(workspace, leadId, owner);

    if (!result.ok) {
      response.status(409).json(result);
      return;
    }

    await saveWorkspace(workspace);
    response.status(200).json({ ok: true, lead: result.lead });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
