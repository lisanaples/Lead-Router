const {
  getWorkspace,
  parseBody,
  readBody,
  saveWorkspace,
} = require("./_lead-router-lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to save a push subscription." });
    return;
  }

  try {
    const raw = await readBody(request);
    const payload = parseBody(raw, request.headers["content-type"] || "");
    const owner = String(payload.owner || "").trim();
    const subscription = typeof payload.subscription === "string" ? JSON.parse(payload.subscription) : payload.subscription;

    if (!owner || !subscription?.endpoint) {
      response.status(400).json({ ok: false, error: "Missing owner or push subscription." });
      return;
    }

    const workspace = await getWorkspace();
    workspace.pushSubscriptions = workspace.pushSubscriptions || {};
    const existing = workspace.pushSubscriptions[owner] || [];
    workspace.pushSubscriptions[owner] = [
      subscription,
      ...existing.filter((entry) => entry.endpoint !== subscription.endpoint),
    ].slice(0, 5);

    await saveWorkspace(workspace);
    response.status(200).json({ ok: true });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
