const CLOUD_RECORD_ID = "lead-router-shared-workspace";
const ROUTING_STATUSES = ["Available", "On call"];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optionalEnv(name) {
  return process.env[name] || "";
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-lead-router-secret");
}

function handleOptions(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return true;
  }
  return false;
}

function appUrl() {
  return optionalEnv("LEAD_ROUTER_APP_URL") || "https://lead-router-29yb.vercel.app";
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseBody(raw, contentType = "") {
  if (!raw) return {};
  if (contentType.includes("application/json")) return JSON.parse(raw);
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function isGreetingLine(line) {
  return /^(hi|hello|dear|good morning|good afternoon|good evening)\b/i.test(String(line || "").trim());
}

function cleanupLeadName(value) {
  return String(value || "")
    .replace(/^(name|lead name|contact name|customer name|client name|contact|from):?/i, "")
    .replace(/,$/, "")
    .trim();
}

function lineValueAfterLabel(lines, labels) {
  const labelPattern = labels.join("|");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inlineMatch = line.match(new RegExp(`^(${labelPattern})\\s*:?\\s*(.+)$`, "i"));
    if (inlineMatch?.[2]) {
      const value = cleanupLeadName(inlineMatch[2]);
      if (value && !isGreetingLine(value)) return value;
    }
    if (new RegExp(`^(${labelPattern})\\s*:?$`, "i").test(line)) {
      const next = lines.slice(index + 1).find((entry) => entry && !isGreetingLine(entry));
      const value = cleanupLeadName(next);
      if (value) return value;
    }
  }
  return "";
}

function extractLeadName(lines) {
  const labeled = lineValueAfterLabel(lines, ["lead name", "contact name", "customer name", "client name", "name", "contact"]);
  if (labeled) return labeled;
  const fromLine = lines.find((line) => /^from:/i.test(line) && !/@/.test(line));
  const fromName = cleanupLeadName(fromLine);
  if (fromName && !isGreetingLine(fromName)) return fromName;
  const candidate = lines.find((line) => (
    !isGreetingLine(line) &&
    !/@/.test(line) &&
    !/\d{3}/.test(line) &&
    !/^(subject|to|from|sent|date|phone|email|property|address|message|comments|listing|price):/i.test(line) &&
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,3}$/.test(line)
  ));
  return cleanupLeadName(candidate) || "New Lead";
}

function parseLeadEmail(text = "") {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || "";
  const source = /zillow/i.test(text) ? "Zillow" : /realtor\.com/i.test(text) ? "Realtor.com" : /homes\.com/i.test(text) ? "Homes.com" : /reminder media/i.test(text) ? "Reminder Media" : /homesale/i.test(text) ? "HomeSale.com" : "Website";
  const propertyLine = lines.find((line) => /(property|address|home|listing):/i.test(line)) || lines.find((line) => /\d+ .*(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court)/i.test(line)) || "";
  return {
    source,
    type: /sell|seller|valuation|home value/i.test(text) ? "Seller" : "Buyer",
    name: extractLeadName(lines),
    phone,
    email,
    property: propertyLine.replace(/^(property|address|home|listing):/i, "").trim(),
    price: text.match(/\$[\d,]+(?:\s*-\s*\$?[\d,]+)?/)?.[0] || "",
    urgency: /tour|showing|today|asap|pre-approved|preapproved/i.test(text) ? "Hot" : "Warm",
    message: text,
  };
}

function leadFromPayload(payload) {
  const rawText = payload.raw || payload.text || payload.body || payload.message || "";
  const parsed = rawText ? parseLeadEmail(rawText) : {};
  const source = payload.source || payload.provider || parsed.source || "Website";
  const type = payload.type || payload.lead_type || parsed.type || "Buyer";
  const name = payload.name || payload.full_name || payload.client || parsed.name || "New Lead";
  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    source,
    type,
    name,
    phone: payload.phone || payload.mobile || parsed.phone || "",
    email: payload.email || parsed.email || "",
    property: payload.property || payload.address || payload.listing || parsed.property || "",
    price: payload.price || payload.price_range || parsed.price || "",
    urgency: payload.urgency || payload.priority || parsed.urgency || "Warm",
    status: "new",
    assignedTo: "",
    nextFollowUpDate: "",
    firstAttemptedAt: "",
    firstContactedAt: "",
    appointmentSetAt: "",
    consultationCompletedAt: "",
    convertedAt: "",
    lostAt: "",
    outcomeNotes: "",
    message: payload.notes || payload.comments || rawText || parsed.message || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activity: [{ at: new Date().toISOString(), text: `Lead received from ${source} and sent to active team members.` }],
  };
}

async function supabaseRequest(path, options = {}) {
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.msg || text || "Supabase request failed");
  return data;
}

async function verifyUserToken(token) {
  if (!token) throw new Error("Sign in before creating a notified lead.");
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || "Sign in again before creating a notified lead.");
  return data;
}

async function getWorkspace() {
  const rows = await supabaseRequest(`/rest/v1/lead_router_records?id=eq.${encodeURIComponent(CLOUD_RECORD_ID)}&select=data&limit=1`);
  return rows?.[0]?.data || { leads: [], team: [], settings: {}, pushSubscriptions: {} };
}

async function saveWorkspace(workspace) {
  await supabaseRequest("/rest/v1/lead_router_records?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id: CLOUD_RECORD_ID,
      record_type: "workspace",
      data: workspace,
    }),
  });
}

function activeRecipients(workspace) {
  return (workspace.team || []).filter((member) => ROUTING_STATUSES.includes(member.status || "Available"));
}

function claimUrl(lead, member) {
  const url = new URL(appUrl());
  url.searchParams.set("claim", lead.id);
  url.searchParams.set("owner", member.name);
  return url.toString();
}

function notificationText(lead, member) {
  return [
    `New ${lead.source} ${lead.type} lead: ${lead.name}`,
    lead.property ? `Property/area: ${lead.property}` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    `Claim: ${claimUrl(lead, member)}`,
  ].filter(Boolean).join("\n");
}

async function sendEmail(member, lead) {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("EMAIL_FROM");
  if (!apiKey || !from || !member.email) return { sent: false, skipped: "Email is not configured." };
  const claim = claimUrl(lead, member);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: member.email,
      subject: `New ${lead.source} lead: ${lead.name}`,
      text: notificationText(lead, member),
      html: `
        <h2>New ${lead.source} ${lead.type} lead</h2>
        <p><strong>${lead.name}</strong></p>
        ${lead.property ? `<p>Property/area: ${lead.property}</p>` : ""}
        ${lead.phone ? `<p>Phone: ${lead.phone}</p>` : ""}
        ${lead.email ? `<p>Email: ${lead.email}</p>` : ""}
        <p><a href="${claim}">Claim this lead</a></p>
      `,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Email send failed");
  return { sent: true };
}

async function sendPush(member, lead, workspace) {
  const publicKey = optionalEnv("VAPID_PUBLIC_KEY");
  const privateKey = optionalEnv("VAPID_PRIVATE_KEY");
  const subject = optionalEnv("VAPID_SUBJECT") || "mailto:lead-router@example.com";
  const subscriptions = workspace.pushSubscriptions?.[member.name] || [];
  if (!publicKey || !privateKey || !subscriptions.length) return { sent: false, skipped: "Push is not configured for this member." };
  const webPush = require("web-push");
  webPush.setVapidDetails(subject, publicKey, privateKey);
  let sent = 0;
  for (const subscription of subscriptions) {
    await webPush.sendNotification(subscription, JSON.stringify({
      title: `New ${lead.source} lead`,
      body: `${lead.name}${lead.property ? ` - ${lead.property}` : ""}`,
      url: claimUrl(lead, member),
    }));
    sent += 1;
  }
  return { sent: sent > 0, count: sent };
}

async function sendTestPush(owner, workspace) {
  const member = (workspace.team || []).find((entry) => entry.name === owner);
  if (!member) return { sent: false, error: "That team member was not found." };
  const lead = {
    id: "test",
    source: "Lead Router",
    type: "Test",
    name: "Push notification test",
    property: "Your device is connected",
  };
  return sendPush(member, lead, workspace);
}

async function notifyActiveTeam(workspace, lead) {
  const results = [];
  for (const member of activeRecipients(workspace)) {
    const memberResult = { member: member.name, email: false, push: false };
    try {
      const emailResult = await sendEmail(member, lead);
      memberResult.email = Boolean(emailResult.sent);
      if (emailResult.skipped) memberResult.emailSkipped = emailResult.skipped;
    } catch (error) {
      memberResult.emailError = error.message;
    }
    try {
      const pushResult = await sendPush(member, lead, workspace);
      memberResult.push = Boolean(pushResult.sent);
      if (pushResult.count) memberResult.pushCount = pushResult.count;
      if (pushResult.skipped) memberResult.pushSkipped = pushResult.skipped;
    } catch (error) {
      memberResult.pushError = error.message;
    }
    results.push(memberResult);
  }
  return results;
}

function claimLead(workspace, leadId, owner) {
  const leads = Array.isArray(workspace.leads) ? workspace.leads : [];
  const team = Array.isArray(workspace.team) ? workspace.team : [];
  const member = team.find((entry) => entry.name === owner);
  const lead = leads.find((entry) => String(entry.id) === String(leadId));
  if (!member) return { ok: false, error: "That team member was not found." };
  if (!lead) return { ok: false, error: "That lead was not found." };
  if (lead.status !== "new") return { ok: false, error: `${lead.name} has already been claimed by ${lead.assignedTo || "another team member"}.` };
  lead.status = "claimed";
  lead.assignedTo = member.name;
  lead.firstAttemptedAt = lead.firstAttemptedAt || dateKey();
  lead.updatedAt = new Date().toISOString();
  lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
  lead.activity.unshift({ at: new Date().toISOString(), text: `${member.name} claimed the lead from a notification link.` });
  member.claims = (member.claims || 0) + 1;
  return { ok: true, lead };
}

module.exports = {
  claimLead,
  getWorkspace,
  handleOptions,
  leadFromPayload,
  notifyActiveTeam,
  optionalEnv,
  parseBody,
  readBody,
  sendTestPush,
  saveWorkspace,
  verifyUserToken,
};
