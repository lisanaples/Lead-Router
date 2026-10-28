const {
  getWorkspace,
  handleOptions,
  parseBody,
  readBody,
  saveWorkspace,
  verifyUserToken,
} = require("./_lead-router-lib");

function newestDate(values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to merge leads." });
    return;
  }
  try {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    await verifyUserToken(token);
    const body = parseBody(await readBody(request), request.headers["content-type"] || "");
    const workspace = await getWorkspace();
    const leads = Array.isArray(workspace.leads) ? workspace.leads : [];
    const primary = leads.find((entry) => String(entry.id) === String(body.primaryId));
    const duplicate = leads.find((entry) => String(entry.id) === String(body.duplicateId));
    if (!primary || !duplicate || String(primary.id) === String(duplicate.id)) {
      response.status(404).json({ ok: false, error: "Both lead records must exist in the shared workspace." });
      return;
    }
    if (String(duplicate.mergedIntoLeadId || "") === String(primary.id)) {
      response.status(200).json({ ok: true, primary, duplicate, alreadyMerged: true });
      return;
    }
    if (duplicate.mergedIntoLeadId) {
      response.status(409).json({ ok: false, error: "That duplicate was already merged into a different lead." });
      return;
    }

    ["phone", "email", "property", "price", "source", "type", "nextFollowUpDate", "firstAttemptedAt", "claimedAt", "firstContactedAt", "appointmentSetAt", "consultationCompletedAt", "convertedAt", "lostAt", "outcomeNotes"].forEach((key) => {
      if (!primary[key] && duplicate[key]) primary[key] = duplicate[key];
    });
    if (!primary.assignedTo && duplicate.assignedTo) primary.assignedTo = duplicate.assignedTo;
    if (["new", "claimed"].includes(primary.status) && !["new", "claimed"].includes(duplicate.status)) primary.status = duplicate.status;
    if (primary.status === "new" && duplicate.status === "claimed") primary.status = "claimed";
    if (duplicate.urgency === "Hot" || (duplicate.urgency === "Warm" && primary.urgency === "Nurture")) primary.urgency = duplicate.urgency;
    if (duplicate.message && !String(primary.message || "").includes(duplicate.message)) {
      primary.message = [primary.message, duplicate.message].filter(Boolean).join("\n\n--- Merged duplicate message ---\n");
    }
    primary.notes = [...(primary.notes || []), ...(duplicate.notes || [])].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    primary.activity = [...(primary.activity || []), ...(duplicate.activity || [])].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    primary.notificationHistory = [...(primary.notificationHistory || []), ...(duplicate.notificationHistory || [])].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    primary.contactAttempts = Number(primary.contactAttempts || 0) + Number(duplicate.contactAttempts || 0);
    primary.lastContactAttemptAt = newestDate([primary.lastContactAttemptAt, duplicate.lastContactAttemptAt]);
    primary.createdAt = [primary.createdAt, duplicate.createdAt].filter(Boolean).sort()[0] || primary.createdAt;
    primary.mergedLeadIds = [...new Set([...(primary.mergedLeadIds || []), duplicate.id, ...(duplicate.mergedLeadIds || [])])];

    const now = new Date().toISOString();
    primary.updatedAt = now;
    primary.activity.unshift({ at: now, text: `Duplicate lead ${duplicate.name} merged into this record.` });
    duplicate.status = "archived";
    duplicate.mergedIntoLeadId = primary.id;
    duplicate.updatedAt = now;
    duplicate.activity = Array.isArray(duplicate.activity) ? duplicate.activity : [];
    duplicate.activity.unshift({ at: now, text: `Merged into ${primary.name} (${primary.id}) and archived.` });

    await saveWorkspace(workspace);
    response.status(200).json({ ok: true, primary, duplicate });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
