const crypto = require("crypto");
const { getWorkspace, optionalEnv, saveWorkspace } = require("./_lead-router-lib");

function expectedToken(leadId) {
  const secret = optionalEnv("FUNNEL_SIGNING_SECRET") || optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  return crypto.createHmac("sha256", secret).update(String(leadId)).digest("hex");
}

function page(response, status, title, message) {
  response.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<main style="max-width:620px;margin:70px auto;padding:30px;font-family:Arial,sans-serif;color:#183b4a;"><h1>${title}</h1><p style="font-size:18px;line-height:1.6;">${message}</p></main>`);
}

module.exports = async function handler(request, response) {
  const leadId = String(request.query?.lead || "");
  const token = String(request.query?.token || "");
  const expected = expectedToken(leadId);
  if (!leadId || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return page(response, 400, "This link could not be verified", "Please contact the agent who emailed you if you would like to stop receiving messages.");
  }
  const workspace = await getWorkspace();
  const lead = (workspace.leads || []).find((entry) => String(entry.id) === leadId);
  if (!lead) return page(response, 404, "Lead not found", "No email preferences were changed.");
  lead.emailOptOut = true;
  lead.funnelPaused = true;
  lead.nextAutomatedEmailAt = "";
  lead.updatedAt = new Date().toISOString();
  lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
  lead.activity.unshift({ at: lead.updatedAt, text: "Lead unsubscribed from automated email follow-up." });
  await saveWorkspace(workspace);
  return page(response, 200, "You have been unsubscribed", "You will not receive any more automated Lead Relay follow-up emails.");
};
