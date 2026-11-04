const {
  getWorkspace,
  handleOptions,
  parseBody,
  readBody,
  saveWorkspace,
  verifyUserToken,
} = require("./_lead-router-lib");

const MASTER_EMAILS = ["lisanaplesrealtor@gmail.com"];

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to save a push subscription." });
    return;
  }

  try {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = await verifyUserToken(token);
    const raw = await readBody(request);
    const payload = parseBody(raw, request.headers["content-type"] || "");
    let owner = String(payload.owner || "").trim();
    const subscription = typeof payload.subscription === "string" ? JSON.parse(payload.subscription) : payload.subscription;

    if (!owner || !subscription?.endpoint) {
      response.status(400).json({ ok: false, error: "Missing owner or push subscription." });
      return;
    }

    const workspace = await getWorkspace();
    const signedInEmail = String(user.email || "").trim().toLowerCase();
    if (!MASTER_EMAILS.includes(signedInEmail)) {
      const signedInMember = (workspace.team || []).find((member) => String(member.email || "").trim().toLowerCase() === signedInEmail);
      if (!signedInMember) {
        response.status(403).json({ ok: false, error: "Your login email is not connected to a Lead Relay team member." });
        return;
      }
      owner = signedInMember.name;
    }
    workspace.pushSubscriptions = workspace.pushSubscriptions || {};
    const existing = workspace.pushSubscriptions[owner] || [];
    workspace.pushSubscriptions[owner] = [
      subscription,
      ...existing.filter((entry) => entry.endpoint !== subscription.endpoint),
    ].slice(0, 5);

    await saveWorkspace(workspace);
    response.status(200).json({ ok: true, owner, devices: workspace.pushSubscriptions[owner].length });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
