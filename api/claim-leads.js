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
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to claim multiple leads." });
    return;
  }

  try {
    const body = parseBody(await readBody(request), request.headers["content-type"] || "");
    const owner = String(body.owner || "").trim();
    const leadIds = [...new Set((Array.isArray(body.leadIds) ? body.leadIds : []).map(String))].slice(0, 100);
    if (!owner || !leadIds.length) {
      response.status(400).json({ ok: false, error: "Choose at least one lead and a team member." });
      return;
    }

    const workspace = await getWorkspace();
    const claimed = [];
    const failed = [];
    for (const leadId of leadIds) {
      const result = claimLead(workspace, leadId, owner);
      if (result.ok) claimed.push(result.lead);
      else failed.push({ leadId, error: result.error });
    }

    // Save every successful claim together so rapid claims cannot overwrite one another.
    if (claimed.length) await saveWorkspace(workspace);

    const confirmations = await Promise.all(claimed.map(async (lead) => {
      const confirmation = await notifyClaimingMember(workspace, lead, owner);
      recordNotificationDelivery(lead, [confirmation], "Batch claim confirmation sent");
      lead.activity.unshift({ at: new Date().toISOString(), text: `Batch claim confirmation sent to ${owner}.` });
      return { leadId: lead.id, ...confirmation };
    }));
    let historyError = "";
    if (claimed.length) {
      try {
        await saveWorkspace(workspace);
      } catch (error) {
        // The claims were already saved before notifications started.
        historyError = error.message;
      }
    }

    response.status(200).json({ ok: claimed.length > 0, claimed, failed, confirmations, historyError });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
