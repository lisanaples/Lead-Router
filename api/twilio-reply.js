const {
  dateKey,
  getWorkspace,
  normalizePhone,
  parseBody,
  readBody,
  saveWorkspace,
  twiml,
} = require("./_lead-router-lib");

function xml(response, message, status = 200) {
  response.setHeader("Content-Type", "text/xml");
  response.status(status).send(twiml(message));
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    xml(response, "Lead Router is ready for text replies.", 200);
    return;
  }

  try {
    const raw = await readBody(request);
    const payload = parseBody(raw, request.headers["content-type"] || "");
    const from = normalizePhone(payload.From);
    const body = String(payload.Body || "").trim();
    const claimId = body.match(/^claim\s+(\d+)/i)?.[1];

    if (!claimId) {
      xml(response, "Reply CLAIM plus the lead number to claim a lead. Example: CLAIM 12345");
      return;
    }

    const workspace = await getWorkspace();
    const team = Array.isArray(workspace.team) ? workspace.team : [];
    const leads = Array.isArray(workspace.leads) ? workspace.leads : [];
    const member = team.find((entry) => normalizePhone(entry.phone) === from);
    const lead = leads.find((entry) => String(entry.id) === String(claimId));

    if (!member) {
      xml(response, "This phone number is not listed as an active team member in Lead Router.");
      return;
    }

    if (!lead) {
      xml(response, "That lead number was not found.");
      return;
    }

    if (lead.status !== "new") {
      xml(response, `${lead.name} has already been claimed by ${lead.assignedTo || "another team member"}.`);
      return;
    }

    lead.status = "claimed";
    lead.assignedTo = member.name;
    lead.firstAttemptedAt = lead.firstAttemptedAt || dateKey();
    lead.updatedAt = new Date().toISOString();
    lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
    lead.activity.unshift({ at: new Date().toISOString(), text: `${member.name} claimed the lead by text reply.` });
    member.claims = (member.claims || 0) + 1;

    await saveWorkspace(workspace);
    xml(response, `You claimed ${lead.name}. Open Lead Router to update follow-up and notes.`);
  } catch (error) {
    xml(response, `Lead Router could not process that reply: ${error.message}`, 500);
  }
};
