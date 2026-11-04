const {
  getWorkspace,
  handleOptions,
  parseBody,
  readBody,
  saveWorkspace,
  sendTestPush,
  verifyUserToken,
} = require("./_lead-router-lib");

const MASTER_EMAILS = ["lisanaplesrealtor@gmail.com"];

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to send a test push." });
    return;
  }

  try {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = await verifyUserToken(token);
    const payload = parseBody(await readBody(request), request.headers["content-type"] || "");
    let owner = String(payload.owner || "").trim();
    if (!owner) {
      response.status(400).json({ ok: false, error: "Choose a team member first." });
      return;
    }

    const workspace = await getWorkspace();
    const signedInEmail = String(user.email || "").trim().toLowerCase();
    if (!MASTER_EMAILS.includes(signedInEmail)) {
      const member = (workspace.team || []).find((entry) => String(entry.email || "").trim().toLowerCase() === signedInEmail);
      if (!member) {
        response.status(403).json({ ok: false, error: "Your login email is not connected to a Lead Relay team member." });
        return;
      }
      owner = member.name;
    }
    const result = await sendTestPush(owner, workspace);
    await saveWorkspace(workspace);
    if (!result.sent) {
      response.status(400).json({ ok: false, error: result.error || result.skipped || "No push subscription found." });
      return;
    }

    response.status(200).json({ ok: true, owner, result });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
