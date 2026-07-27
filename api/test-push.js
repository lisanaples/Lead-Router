const {
  getWorkspace,
  handleOptions,
  parseBody,
  readBody,
  sendTestPush,
} = require("./_lead-router-lib");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to send a test push." });
    return;
  }

  try {
    const payload = parseBody(await readBody(request), request.headers["content-type"] || "");
    const owner = String(payload.owner || "").trim();
    if (!owner) {
      response.status(400).json({ ok: false, error: "Choose a team member first." });
      return;
    }

    const workspace = await getWorkspace();
    const result = await sendTestPush(owner, workspace);
    if (!result.sent) {
      response.status(400).json({ ok: false, error: result.error || result.skipped || "No push subscription found." });
      return;
    }

    response.status(200).json({ ok: true, result });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
};
