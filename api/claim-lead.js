const {
  claimLead,
  getWorkspace,
  handleOptions,
  notifyClaimingMember,
  parseBody,
  recordNotificationDelivery,
  readBody,
  saveWorkspace,
} = require("./_lead-router-lib");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

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
    const confirmation = await notifyClaimingMember(workspace, result.lead, owner);
    recordNotificationDelivery(result.lead, [confirmation], "Claim confirmation sent");
    result.lead.activity.unshift({
      at: new Date().toISOString(),
      text: `Claim confirmation sent to ${owner}: ${confirmation.email ? "email delivered" : "email not delivered"}; ${confirmation.push ? "push delivered" : "push not delivered"}.`,
    });
    try {
      await saveWorkspace(workspace);
    } catch (historyError) {
      confirmation.historyError = historyError.message;
    }
    response.status(200).json({ ok: true, lead: result.lead, confirmation });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
