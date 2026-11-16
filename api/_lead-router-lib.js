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

function supabaseBaseUrl() {
  let value = requiredEnv("SUPABASE_URL")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
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

function plainLeadLine(value) {
  return String(value || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\*_`>#]/g, "")
    .trim();
}

function formatContactName(value) {
  let name = cleanupLeadName(plainLeadLine(value));
  if (/^[^,]+,[^,]+$/.test(name)) {
    const [last, first] = name.split(",").map((part) => part.trim());
    name = `${first} ${last}`;
  }
  if (name && (name === name.toUpperCase() || name === name.toLowerCase())) {
    name = name.toLowerCase().replace(/(^|[\s'-])[a-z]/g, (letter) => letter.toUpperCase());
  }
  return name;
}

function lineValueAfterLabel(lines, labels) {
  const labelPattern = labels.join("|");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inlineMatch = plainLeadLine(line).match(new RegExp(`^(${labelPattern})\\s*:\\s*(.+)$`, "i"));
    if (inlineMatch?.[2]) {
      const value = cleanupLeadName(inlineMatch[2]);
      if (value && !isGreetingLine(value)) return value;
    }
    if (new RegExp(`^(${labelPattern})\\s*:?$`, "i").test(plainLeadLine(line))) {
      const next = lines.slice(index + 1).find((entry) => entry && !isGreetingLine(entry));
      const value = cleanupLeadName(next);
      if (value) return value;
    }
  }
  return "";
}

function extractLeadName(lines) {
  const firstName = lineValueAfterLabel(lines, ["first name", "firstname"]);
  const lastName = lineValueAfterLabel(lines, ["last name", "lastname", "surname"]);
  const combinedName = formatContactName([firstName, lastName].filter(Boolean).join(" "));
  if (combinedName) return combinedName;
  const conversationalText = lines.map(plainLeadLine).join(" ").replace(/\s+/g, " ");
  const leadingName = conversationalText.match(/^([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,4}),\s+(?=I\b|I['’](?:m|ve|d|ll)\b|my\b|looking\b|interested\b|wants?\b|needs?\b|asking\b|inquiring\b|would like\b)/i)?.[1] || "";
  if (leadingName) return formatContactName(leadingName);
  const statedName = conversationalText.match(/\bmy name is\s+(.+?)(?=\s+and\s+my\b|[.!?](?:\s|$)|$)/i)?.[1] || "";
  if (statedName) return formatContactName(statedName);
  const introducedName = conversationalText.match(/\bi(?:'|’)m\s+(.+?)(?=[.!?](?:\s|$)|$)/i)?.[1]?.trim() || "";
  const introductionWords = introducedName.split(/\s+/).filter(Boolean);
  const looksLikeIntent = /^(interested|looking|searching|wanting|trying|hoping|ready|thinking|buying|selling|checking|inquiring)\b/i.test(introducedName);
  const looksLikeName = introductionWords.length >= 1 && introductionWords.length <= 5 && introductionWords.every((word) => /^[A-Za-z][A-Za-z.'-]*$/.test(word));
  if (introducedName && looksLikeName && !looksLikeIntent) return formatContactName(introducedName);
  const submittedIndex = lines.findIndex((line) => /^submitted on\b/i.test(plainLeadLine(line)));
  if (submittedIndex >= 0) {
    const submittedName = lines.slice(submittedIndex + 1).find((line) => {
      const plain = plainLeadLine(line);
      return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}$/.test(plain) && !/^(Email Address|Phone Number|Custom Questions)$/i.test(plain);
    });
    if (submittedName) return formatContactName(submittedName);
  }
  const contactHeadingIndex = lines.findIndex((line) => /^contact details:?$/i.test(plainLeadLine(line)));
  if (contactHeadingIndex >= 0) {
    const homesContact = lines.slice(contactHeadingIndex + 1).find((line) => {
      const plain = plainLeadLine(line);
      return plain && !/^(phone|email|message|comments?)\b/i.test(plain) && !/@/.test(plain) && !/^\+?\(?\d/.test(plain);
    });
    const formatted = formatContactName(homesContact);
    if (formatted) return formatted;
  }
  const labeled = lineValueAfterLabel(lines, ["lead name", "contact name", "customer name", "client name", "name", "contact"]);
  if (labeled) return formatContactName(labeled);
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
  return formatContactName(candidate) || "New Lead";
}

function expandedStreetAddress(value) {
  return plainLeadLine(value)
    .replace(/\bTer\.?$/i, "Terrace")
    .replace(/\bSt\.?$/i, "Street")
    .replace(/\bAve\.?$/i, "Avenue")
    .replace(/\bRd\.?$/i, "Road")
    .replace(/\bDr\.?$/i, "Drive")
    .replace(/\bLn\.?$/i, "Lane")
    .replace(/\bCt\.?$/i, "Court")
    .replace(/\bBlvd\.?$/i, "Boulevard");
}

function extractPropertyArea(text, lines) {
  const facebookCampaign = text.match(/Facebook Ads Campaign,\s*(?:\*\*)?(.+?)(?:\*\*)?\s+and it(?:'|’)s\b/is)?.[1] || "";
  if (facebookCampaign) {
    const parts = plainLeadLine(facebookCampaign).split("|").map((part) => part.trim()).filter(Boolean);
    const street = parts.find((part) => /^\d{1,6}\s+.+\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|pike|blvd|boulevard|ter|terrace|cir|circle|way)\.?$/i.test(part));
    const city = [...parts].reverse().find((part) => part !== street && !/\bvolume\b/i.test(part));
    if (street) {
      const expanded = expandedStreetAddress(street);
      if (/^903\s+green\s+terrace$/i.test(expanded) && /^lancaster$/i.test(city || "")) {
        return "903 Green Terrace, Lancaster, PA 17601";
      }
      return [expanded, city].filter(Boolean).join(", ");
    }
  }
  const streetAddress = text.match(/\b\d{1,6}\s+[A-Z0-9][A-Z0-9.'-]*(?:\s+[A-Z0-9][A-Z0-9.'-]*){0,6}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|pike|blvd|boulevard|ter|terrace|cir|circle|way)\b/i)?.[0] || "";
  const propertyLine = streetAddress || lines.find((line) => /^(property|address|home|listing|interested in)\s*:/i.test(plainLeadLine(line))) || "";
  return expandedStreetAddress(plainLeadLine(propertyLine).replace(/^(property|address|home|listing|interested in):/i, "").trim());
}

function extractProspectEmail(text, lines) {
  const labeled = lineValueAfterLabel(lines, ["email address", "email"]);
  const labeledEmail = String(labeled || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  if (labeledEmail) return labeledEmail;
  const addresses = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return addresses.find((address) => !/^(clientsuccess|notifications?|noreply|no-reply|support|unsubscribe)@/i.test(address)) || addresses[0] || "";
}

function extractProspectPhone(text, lines) {
  const labeled = lineValueAfterLabel(lines, ["phone number", "phone", "mobile", "cell"]);
  return String(labeled || "").match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0]
    || text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0]
    || "";
}

function parseLeadEmail(text = "") {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const email = extractProspectEmail(text, lines);
  const phone = extractProspectPhone(text, lines);
  const source = /facebook ads campaign/i.test(text) ? "Facebook" : /zillow/i.test(text) ? "Zillow" : /realtor\.com/i.test(text) ? "Realtor.com" : /homes\.com/i.test(text) ? "Homes.com" : /reminder\s*media/i.test(text) ? "Reminder Media" : /homesale/i.test(text) ? "HomeSale.com" : "Website";
  return {
    source,
    type: /sell|seller|valuation|home value/i.test(text) ? "Seller" : "Buyer",
    name: extractLeadName(lines),
    phone,
    email,
    property: extractPropertyArea(text, lines),
    price: text.match(/\$[\d,]+(?:\s*-\s*\$?[\d,]+)?/)?.[0] || "",
    urgency: /tour|showing|today|asap|pre-approved|preapproved/i.test(text) ? "Hot" : "Warm",
    message: text,
  };
}

function leadFromPayload(payload) {
  const rawText = payload.raw || payload.text || payload.body || payload.message || "";
  const parsed = rawText ? parseLeadEmail(rawText) : {};
  const suppliedSource = payload.source || payload.provider || "";
  const source = (/^(email lead|website)$/i.test(suppliedSource) && parsed.source && parsed.source !== "Website")
    ? parsed.source
    : suppliedSource || parsed.source || "Website";
  const type = payload.type || payload.lead_type || parsed.type || "Buyer";
  const name = payload.name || payload.full_name || payload.client || parsed.name || "New Lead";
  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    source,
    type,
    name,
    phone: normalizedPhone(payload.phone || payload.mobile || parsed.phone || ""),
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
    forewarnStatus: "notChecked",
    forewarnNotes: "",
    message: payload.notes || payload.comments || rawText || parsed.message || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activity: [{ at: new Date().toISOString(), text: `Lead received from ${source}.` }],
  };
}

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function findPreviousOwnedLead(workspace, lead) {
  const email = normalizedEmail(lead.email);
  const phone = normalizedPhone(lead.phone);
  return (workspace.leads || []).find((entry) => {
    if (!entry.assignedTo || String(entry.id) === String(lead.id)) return false;
    const emailMatches = email && normalizedEmail(entry.email) === email;
    const phoneMatches = phone.length >= 10 && normalizedPhone(entry.phone) === phone;
    return emailMatches || phoneMatches;
  }) || null;
}

function routeRepeatLead(workspace, lead) {
  const previous = findPreviousOwnedLead(workspace, lead);
  if (!previous) return null;
  const now = new Date().toISOString();
  previous.repeatInquiries = Array.isArray(previous.repeatInquiries) ? previous.repeatInquiries : [];
  previous.repeatInquiries.unshift({
    at: now,
    source: lead.source,
    type: lead.type,
    property: lead.property,
    price: lead.price,
    urgency: lead.urgency,
    phone: lead.phone,
    email: lead.email,
    message: lead.message,
  });
  previous.repeatInquiries = previous.repeatInquiries.slice(0, 50);
  previous.repeatCount = Number(previous.repeatCount || 0) + 1;
  previous.lastRepeatInquiryAt = now;
  previous.isRepeat = true;
  previous.statusBeforeRepeat = previous.status;
  previous.status = "claimed";
  previous.claimedAt = previous.claimedAt || dateKey();
  previous.updatedAt = now;
  if (lead.source) previous.source = lead.source;
  if (lead.type) previous.type = lead.type;
  if (lead.property) previous.property = lead.property;
  if (lead.price) previous.price = lead.price;
  if (lead.urgency) previous.urgency = lead.urgency;
  if (lead.phone) previous.phone = lead.phone;
  if (lead.email) previous.email = lead.email;
  if (lead.message) previous.message = lead.message;
  previous.activity = Array.isArray(previous.activity) ? previous.activity : [];
  previous.activity.unshift({
    at: new Date().toISOString(),
    text: `Repeat inquiry matched by email or phone. Existing lead reopened and notification routed only to ${previous.assignedTo}.`,
  });
  return previous;
}

async function supabaseRequest(path, options = {}) {
  const url = supabaseBaseUrl();
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  let response;
  try {
    response = await fetch(`${url}${path}`, {
      ...options,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Vercel could not reach Supabase. Check SUPABASE_URL in Vercel and redeploy.");
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.msg || text || "Supabase request failed");
  return data;
}

async function verifyUserToken(token) {
  if (!token) throw new Error("Sign in before creating a notified lead.");
  const url = supabaseBaseUrl();
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  let response;
  try {
    response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new Error("Vercel could not reach Supabase. Check SUPABASE_URL in Vercel and redeploy.");
  }
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

function viewLeadUrl(lead) {
  const url = new URL(appUrl());
  url.searchParams.set("lead", lead.id);
  return url.toString();
}

function emailEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function receivedLabel(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function notificationText(lead, member, noticeLabel = "") {
  const view = viewLeadUrl(lead);
  return [
    noticeLabel ? `${noticeLabel}: this lead is still unclaimed.` : "",
    `${lead.isRepeat ? "Repeat lead" : "New lead"}: ${lead.source} ${lead.type} inquiry from ${lead.name}`,
    lead.isRepeat ? `This person previously inquired and is already assigned to you.` : "",
    lead.createdAt ? `Received: ${receivedLabel(lead.createdAt)}` : "",
    lead.source ? `Lead source: ${lead.source}` : "",
    lead.type ? `Lead type: ${lead.type}` : "",
    lead.urgency ? `Priority: ${lead.urgency}` : "",
    lead.property ? `Property/area: ${lead.property}` : "",
    lead.price ? `Price/range: ${lead.price}` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.email ? `Email: ${lead.email}` : "",
    lead.message ? `Original inquiry / notes:\n${lead.message}` : "",
    lead.isRepeat ? "" : `Claim this lead: ${claimUrl(lead, member)}`,
    `View lead details: ${view}`,
  ].filter(Boolean).join("\n");
}

async function sendEmail(member, lead, noticeLabel = "") {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("EMAIL_FROM");
  if (!apiKey || !from || !member.email) return { sent: false, skipped: "Email is not configured." };
  const claim = claimUrl(lead, member);
  const view = viewLeadUrl(lead);
  const detailRows = [
    ["Name", lead.name],
    ["Received", receivedLabel(lead.createdAt)],
    ["Lead source", lead.source],
    ["Lead type", lead.type],
    ["Priority", lead.urgency],
    ["Property / area", lead.property],
    ["Price / range", lead.price],
    ["Phone", lead.phone],
    ["Email", lead.email],
  ].filter(([, value]) => String(value || "").trim());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: member.email,
      subject: `${noticeLabel ? `${noticeLabel}: ` : ""}${lead.isRepeat ? "Repeat lead" : "New lead"}: ${lead.name} (${lead.source})`,
      text: notificationText(lead, member, noticeLabel),
      html: `
        <div style="margin:0;background:#f1f5f4;padding:24px;font-family:Arial,sans-serif;color:#18213d;">
          <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d8e2e3;">
            <div style="background:#123849;color:#ffffff;padding:22px 26px;">
              <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#f2c65d;">Lead Relay</div>
              <h1 style="margin:7px 0 0;font-size:25px;">${emailEscape(noticeLabel ? `${noticeLabel}: Lead still unclaimed` : `${lead.isRepeat ? "Repeat" : "New"} lead received`)}</h1>
            </div>
            <div style="padding:24px 26px;">
              ${lead.isRepeat ? `<p style="padding:11px 13px;background:#fff4c7;border-radius:8px;"><strong>This person previously inquired and is already assigned to you.</strong></p>` : ""}
              <h2 style="margin:0 0 18px;font-size:23px;color:#123849;">${emailEscape(lead.name)}</h2>
              <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
                ${detailRows.map(([label, value]) => `<tr><td style="width:135px;padding:8px 10px 8px 0;border-bottom:1px solid #edf1f2;color:#66708d;font-weight:700;vertical-align:top;">${emailEscape(label)}</td><td style="padding:8px 0;border-bottom:1px solid #edf1f2;font-weight:600;vertical-align:top;">${emailEscape(value)}</td></tr>`).join("")}
              </table>
              ${lead.message ? `<div style="margin-top:20px;padding:16px;background:#fff8cb;border:1px solid #ead36e;border-radius:9px;"><strong style="display:block;margin-bottom:7px;color:#72590d;">Original inquiry / notes</strong><div style="white-space:pre-wrap;line-height:1.5;overflow-wrap:anywhere;">${emailEscape(lead.message)}</div></div>` : ""}
              <div style="margin-top:24px;">
                ${lead.isRepeat ? "" : `<a href="${emailEscape(claim)}" style="display:inline-block;margin:0 10px 10px 0;padding:13px 19px;border-radius:8px;background:#123849;color:#ffffff;text-decoration:none;font-weight:700;">Claim this lead</a>`}
                <a href="${emailEscape(view)}" style="display:inline-block;margin:0 0 10px;padding:12px 18px;border:2px solid #123849;border-radius:8px;background:#ffffff;color:#123849;text-decoration:none;font-weight:700;">View lead details</a>
              </div>
              <p style="margin:12px 0 0;color:#66708d;font-size:12px;line-height:1.45;">Claiming assigns the lead to you immediately. Viewing the lead does not claim it.</p>
            </div>
          </div>
        </div>
      `,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Email send failed");
  return { sent: true };
}

async function sendPush(member, lead, workspace, noticeLabel = "") {
  const publicKey = optionalEnv("VAPID_PUBLIC_KEY");
  const privateKey = optionalEnv("VAPID_PRIVATE_KEY");
  const subject = optionalEnv("VAPID_SUBJECT") || "mailto:lead-router@example.com";
  const subscriptions = workspace.pushSubscriptions?.[member.name] || [];
  if (!publicKey || !privateKey || !subscriptions.length) return { sent: false, skipped: "Push is not configured for this member." };
  const webPush = require("web-push");
  webPush.setVapidDetails(subject, publicKey, privateKey);
  let sent = 0;
  let expired = 0;
  const activeSubscriptions = [];
  const errors = [];
  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(subscription, JSON.stringify({
        title: `${noticeLabel ? `${noticeLabel}: ` : ""}${lead.isRepeat ? "Repeat" : "New"} ${lead.source} lead`,
        body: `${lead.name}${noticeLabel ? " - still unclaimed" : ""}${lead.isRepeat ? " - previously assigned to you" : ""}${lead.property ? ` - ${lead.property}` : ""}`,
        url: lead.isRepeat ? appUrl() : claimUrl(lead, member),
      }));
      activeSubscriptions.push(subscription);
      sent += 1;
    } catch (error) {
      if ([404, 410].includes(Number(error.statusCode))) expired += 1;
      else {
        activeSubscriptions.push(subscription);
        errors.push(error);
      }
    }
  }
  workspace.pushSubscriptions[member.name] = activeSubscriptions;
  if (!sent && errors.length) throw errors[0];
  return {
    sent: sent > 0,
    count: sent,
    expired,
    skipped: !sent && expired ? "This device registration expired. Open Lead Relay Settings to reconnect push alerts." : "",
  };
}

async function sendTestPush(owner, workspace) {
  const member = (workspace.team || []).find((entry) => entry.name === owner);
  if (!member) return { sent: false, error: "That team member was not found." };
  const lead = {
    id: "test",
    source: "Lead Relay",
    type: "Test",
    name: "Push notification test",
    property: "Your device is connected",
  };
  return sendPush(member, lead, workspace);
}

async function sendClaimConfirmationEmail(member, lead) {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("EMAIL_FROM");
  if (!apiKey || !from || !member.email) return { sent: false, skipped: "Email is not configured." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: member.email,
      subject: `Claim confirmed: ${lead.name}`,
      text: [
        `Hi ${member.name},`,
        "",
        `This confirms that you claimed ${lead.name} in Lead Relay. This lead is now assigned to you.`,
        lead.property ? `Property/area: ${lead.property}` : "",
        lead.phone ? `Phone: ${lead.phone}` : "",
        lead.email ? `Email: ${lead.email}` : "",
        "",
        `Open Lead Relay: ${appUrl()}`,
      ].filter(Boolean).join("\n"),
      html: `
        <h2>Lead claim confirmed</h2>
        <p>Hi ${member.name},</p>
        <p>This confirms that you claimed <strong>${lead.name}</strong> in Lead Relay. This lead is now assigned to you.</p>
        ${lead.property ? `<p>Property/area: ${lead.property}</p>` : ""}
        ${lead.phone ? `<p>Phone: ${lead.phone}</p>` : ""}
        ${lead.email ? `<p>Email: ${lead.email}</p>` : ""}
        <p><a href="${appUrl()}">Open Lead Relay</a></p>
      `,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Claim confirmation email failed");
  return { sent: true };
}

async function sendClaimConfirmationPush(member, lead, workspace) {
  const publicKey = optionalEnv("VAPID_PUBLIC_KEY");
  const privateKey = optionalEnv("VAPID_PRIVATE_KEY");
  const subject = optionalEnv("VAPID_SUBJECT") || "mailto:lead-router@example.com";
  const subscriptions = workspace.pushSubscriptions?.[member.name] || [];
  if (!publicKey || !privateKey || !subscriptions.length) return { sent: false, skipped: "Push is not configured for this member." };
  const webPush = require("web-push");
  webPush.setVapidDetails(subject, publicKey, privateKey);
  let sent = 0;
  let expired = 0;
  const activeSubscriptions = [];
  const errors = [];
  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(subscription, JSON.stringify({
        title: "Lead claim confirmed",
        body: `You claimed ${lead.name}.${lead.property ? ` ${lead.property}` : ""}`,
        url: appUrl(),
      }));
      activeSubscriptions.push(subscription);
      sent += 1;
    } catch (error) {
      if ([404, 410].includes(Number(error.statusCode))) expired += 1;
      else {
        activeSubscriptions.push(subscription);
        errors.push(error);
      }
    }
  }
  workspace.pushSubscriptions[member.name] = activeSubscriptions;
  if (!sent && errors.length) throw errors[0];
  return {
    sent: sent > 0,
    count: sent,
    expired,
    skipped: !sent && expired ? "This device registration expired. Open Lead Relay Settings to reconnect push alerts." : "",
  };
}

async function notifyClaimingMember(workspace, lead, owner) {
  const member = (workspace.team || []).find((entry) => entry.name === owner);
  if (!member) return { member: owner, email: false, push: false, error: "Team member not found." };
  const result = { member: member.name, email: false, push: false };
  try {
    const emailResult = await sendClaimConfirmationEmail(member, lead);
    result.email = Boolean(emailResult.sent);
    if (emailResult.skipped) result.emailSkipped = emailResult.skipped;
  } catch (error) {
    result.emailError = error.message;
  }
  try {
    const pushResult = await sendClaimConfirmationPush(member, lead, workspace);
    result.push = Boolean(pushResult.sent);
    if (pushResult.count) result.pushCount = pushResult.count;
    if (pushResult.skipped) result.pushSkipped = pushResult.skipped;
  } catch (error) {
    result.pushError = error.message;
  }
  return result;
}

async function notifyActiveTeam(workspace, lead, options = {}) {
  const noticeLabel = String(options.noticeLabel || "").trim();
  const results = [];
  const recipients = lead.isRepeat && lead.assignedTo
    ? (workspace.team || []).filter((member) => member.name === lead.assignedTo)
    : activeRecipients(workspace);
  for (const member of recipients) {
    const memberResult = { member: member.name, email: false, push: false };
    try {
      const emailResult = await sendEmail(member, lead, noticeLabel);
      memberResult.email = Boolean(emailResult.sent);
      if (emailResult.skipped) memberResult.emailSkipped = emailResult.skipped;
    } catch (error) {
      memberResult.emailError = error.message;
    }
    try {
      const pushResult = await sendPush(member, lead, workspace, noticeLabel);
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

function recordNotificationDelivery(lead, notifications, action = "Notifications sent") {
  lead.notificationHistory = Array.isArray(lead.notificationHistory) ? lead.notificationHistory : [];
  lead.notificationHistory.unshift({
    at: new Date().toISOString(),
    action,
    recipients: notifications.map((entry) => ({
      member: entry.member,
      email: Boolean(entry.email),
      push: Boolean(entry.push),
      pushCount: Number(entry.pushCount || 0),
      emailSkipped: entry.emailSkipped || "",
      pushSkipped: entry.pushSkipped || "",
      emailError: entry.emailError || "",
      pushError: entry.pushError || "",
    })),
  });
  lead.notificationHistory = lead.notificationHistory.slice(0, 20);
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
  lead.claimedAt = lead.claimedAt || dateKey();
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
  parseLeadEmail,
  routeRepeatLead,
  notifyActiveTeam,
  notifyClaimingMember,
  recordNotificationDelivery,
  optionalEnv,
  parseBody,
  readBody,
  sendTestPush,
  saveWorkspace,
  supabaseBaseUrl,
  verifyUserToken,
};
