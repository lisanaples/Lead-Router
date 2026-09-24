const LEADS_KEY = "lead-router-leads-v1";
const TEAM_KEY = "lead-router-team-v1";
const SETTINGS_KEY = "lead-router-settings-v1";
const CLOUD_SESSION_KEY = "lead-router-cloud-session-v1";
const MY_OWNER_KEY = "lead-router-my-owner-v1";
const ACCOUNT_ROLE_KEY = "lead-router-account-role-v1";
const LAST_AUTO_SYNC_KEY = "lead-router-last-auto-sync-v1";
const SUPABASE_URL = "https://bzjsalaacldusmswkygw.supabase.co";
const SUPABASE_KEY = "sb_publishable_wvNqklMeEgNe21HquCDiWg_F22bTjMA";
const CLOUD_RECORD_ID = "lead-router-shared-workspace";
const LEAD_RELAY_APP_URL = "https://lead-router-29yb.vercel.app/";
const TEAM_STATUSES = ["Available", "On call", "Backup only", "Paused", "Out of office", "Admin only"];
const ROUTING_STATUSES = ["Available", "On call"];
const FULL_ACCESS_ROLES = ["Full access"];
const MASTER_EMAILS = ["lisanaplesrealtor@gmail.com"];
const PIPELINE_GROUPS = [
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "attempted", label: "Attempted" },
  { key: "noContact", label: "No contact made" },
  { key: "contacted", label: "Contacted" },
  { key: "appointment", label: "Appointment set" },
  { key: "consultation", label: "Consultation" },
  { key: "converted", label: "Converted" },
  { key: "nurture", label: "Nurture / Cold" },
  { key: "doNotContact", label: "Do not contact" },
];

const sampleLeads = [
  {
    id: 1,
    source: "Zillow",
    type: "Buyer",
    name: "Megan Carter",
    phone: "717-555-0148",
    email: "megan@example.com",
    property: "124 Maple Ridge Dr, Lititz",
    price: "$450K-$525K",
    urgency: "Hot",
    status: "new",
    assignedTo: "",
    message: "Interested in touring this weekend. Has a pre-approval and wants school district info.",
    createdAt: minutesAgo(24),
    updatedAt: minutesAgo(24),
    activity: [{ at: minutesAgo(24), text: "Lead received from Zillow and broadcast to active team members." }],
  },
  {
    id: 2,
    source: "Realtor.com",
    type: "Seller",
    name: "Tom Alvarez",
    phone: "717-555-0182",
    email: "tom@example.com",
    property: "East Petersburg",
    price: "$375K estimate",
    urgency: "Warm",
    status: "claimed",
    assignedTo: "Lisa",
    message: "Considering selling in late fall. Requested pricing guidance.",
    createdAt: minutesAgo(94),
    updatedAt: minutesAgo(76),
    activity: [
      { at: minutesAgo(94), text: "Lead received from Realtor.com and broadcast to active team members." },
      { at: minutesAgo(76), text: "Lisa claimed the lead." },
    ],
  },
];

const sampleTeam = [
  { id: 1, name: "Lisa", phone: "717-555-0101", email: "lisanaplesrealtor@gmail.com", status: "Available", accessRole: "Full access", inviteStatus: "Account created", claims: 1 },
  { id: 2, name: "Assistant", phone: "717-555-0102", email: "assistant@example.com", status: "Available", accessRole: "Full access", inviteStatus: "Not invited", claims: 0 },
  { id: 3, name: "Buyer Agent", phone: "717-555-0103", email: "buyeragent@example.com", status: "On call", accessRole: "Team member", inviteStatus: "Not invited", claims: 0 },
];

const defaultSettings = {
  notificationTemplate: "New {source} lead: {name}, {type}, {property}. Open Lead Relay to claim it.",
  allowReclaim: true,
  notifyAll: true,
};

let leads = loadJson(LEADS_KEY, sampleLeads);
let team = loadJson(TEAM_KEY, sampleTeam);
let settings = loadJson(SETTINGS_KEY, defaultSettings);
let activeView = "dashboard";
let searchTerm = "";
let statusFilter = "all";
let ownerFilter = "all";
let reportRange = "week";
let workflowOwner = "";
let myOwner = localStorage.getItem(MY_OWNER_KEY) || "";
let accountRole = localStorage.getItem(ACCOUNT_ROLE_KEY) || "master";
let cloudSession = loadCloudSession();
let parsedLeadDraft = null;
let autoSyncTimer = null;
let leadFormAutoSaveTimer = null;
let teamFormAutoSaveTimer = null;
let syncState = "idle";
let lastAutoSync = localStorage.getItem(LAST_AUTO_SYNC_KEY) || "";

team = team.map((member) => ({
  ...member,
  status: member.status || (member.active === false ? "Paused" : "Available"),
  accessRole: member.accessRole || (teamMemberStatus(member) === "Admin only" ? "Full access" : "Team member"),
  inviteStatus: member.inviteStatus || "Not invited",
}));
leads = leads.map((lead) => ({
  ...lead,
  notes: Array.isArray(lead.notes) ? lead.notes : [],
  contactAttempts: Number(lead.contactAttempts || 0),
  nextFollowUpDate: lead.nextFollowUpDate || "",
  firstAttemptedAt: lead.firstAttemptedAt || "",
  firstContactedAt: lead.firstContactedAt || "",
  appointmentSetAt: lead.appointmentSetAt || "",
  consultationCompletedAt: lead.consultationCompletedAt || "",
  convertedAt: lead.convertedAt || "",
  lostAt: lead.lostAt || "",
  outcomeNotes: lead.outcomeNotes || "",
}));
workflowOwner = team[0]?.name || "";
myOwner = team.some((member) => member.name === myOwner) ? myOwner : team[0]?.name || "";

function minutesAgo(value) {
  return new Date(Date.now() - value * 60000).toISOString();
}

function loadJson(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function loadCloudSession() {
  try {
    const saved = localStorage.getItem(CLOUD_SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveCloudSession(session) {
  cloudSession = session;
  if (session?.access_token) localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(CLOUD_SESSION_KEY);
  renderSyncStatus();
}

function saveAll() {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
  localStorage.setItem(TEAM_KEY, JSON.stringify(team));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function localSnapshot() {
  return { leads, team, settings };
}

function applySnapshot(snapshot) {
  if (!snapshot) return;
  leads = Array.isArray(snapshot.leads) ? snapshot.leads : leads;
  team = Array.isArray(snapshot.team) ? snapshot.team : team;
  settings = snapshot.settings || settings;
  team = team.map((member) => ({
    ...member,
    status: member.status || (member.active === false ? "Paused" : "Available"),
    accessRole: member.accessRole || (teamMemberStatus(member) === "Admin only" ? "Full access" : "Team member"),
    inviteStatus: member.inviteStatus || "Not invited",
  }));
  applySignedInTeamAccess();
  saveAll();
  renderAll();
}

async function supabaseRequest(path, options = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (cloudSession?.access_token) headers.Authorization = `Bearer ${cloudSession.access_token}`;
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.msg || data?.message || "Supabase request failed.");
  return data;
}

async function appApiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("The Lead Relay API did not respond. Open the Vercel app, make sure the api folder was uploaded, and redeploy.");
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || data?.message || "Lead Relay request failed.");
  return data;
}

async function authenticatedAppApiRequest(path, options = {}) {
  if (!cloudSession?.access_token) throw new Error("Sign in before creating and notifying.");
  return appApiRequest(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${cloudSession.access_token}`,
      ...(options.headers || {}),
    },
  });
}

async function signIn(email, password) {
  const data = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveCloudSession(data);
  await refreshFromCloud({ silent: true });
  applySignedInTeamAccess();
  renderAll();
  showToast("Signed in and refreshed cloud data.");
}

async function createAccount(email, password) {
  const data = await supabaseRequest("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data?.access_token) {
    saveCloudSession(data);
    await syncCloudSnapshot();
    showToast("Account created and local leads uploaded.");
  } else {
    showToast("Account created. Check your email if Supabase asks you to confirm it.");
  }
}

async function refreshFromCloud(options = {}) {
  if (!cloudSession?.access_token) {
    if (!options.silent) showToast("Sign in first to refresh cloud data.");
    return;
  }
  try {
    const rows = await supabaseRequest(`/rest/v1/lead_router_records?id=eq.${encodeURIComponent(CLOUD_RECORD_ID)}&select=data&limit=1`);
    if (rows?.[0]?.data) {
      applySnapshot(rows[0].data);
      if (!options.silent) showToast("Cloud data refreshed.");
    } else if (!options.silent) {
      await syncCloudSnapshot({ silent: true });
      showToast("Cloud workspace started and local data saved.");
    } else {
      await syncCloudSnapshot({ silent: true });
    }
  } catch (error) {
    showToast(`Refresh failed: ${error.message}`);
  }
}

async function syncCloudSnapshot(options = {}) {
  if (!cloudSession?.access_token) {
    if (!options.silent) showToast("Sign in first to upload local data.");
    return;
  }
  try {
    syncState = "saving";
    renderSyncStatus();
    await supabaseRequest("/rest/v1/lead_router_records?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        id: CLOUD_RECORD_ID,
        record_type: "workspace",
        data: localSnapshot(),
      }),
    });
    syncState = "saved";
    lastAutoSync = new Date().toISOString();
    localStorage.setItem(LAST_AUTO_SYNC_KEY, lastAutoSync);
    renderSyncStatus();
    if (!options.silent) showToast("Lead data saved to Supabase.");
  } catch (error) {
    syncState = "error";
    renderSyncStatus();
    showToast(`Auto-save failed: ${error.message}`);
  }
}

function saveAndSync(options = {}) {
  saveAll();
  if (!cloudSession?.access_token) {
    renderSyncStatus();
    return;
  }
  window.clearTimeout(autoSyncTimer);
  syncState = "pending";
  renderSyncStatus();
  autoSyncTimer = window.setTimeout(() => {
    syncCloudSnapshot({ silent: options.silent !== false });
  }, options.immediate ? 0 : 900);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function dateTimeLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateOnlyLabel(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function weekEndKey() {
  const end = new Date();
  end.setDate(end.getDate() + (6 - end.getDay()));
  return dateKey(end);
}

function leadAge(value) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function reportRangeLabel() {
  const labels = {
    week: "this week",
    month: "this month",
    year: "this year",
    all: "all time",
  };
  return labels[reportRange] || labels.week;
}

function startOfReportRange() {
  const now = new Date();
  if (reportRange === "all") return null;
  if (reportRange === "year") return new Date(now.getFullYear(), 0, 1);
  if (reportRange === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function leadInReportRange(lead) {
  const start = startOfReportRange();
  if (!start) return true;
  return new Date(lead.createdAt) >= start;
}

function madeContact(lead) {
  return ["contacted", "appointment", "consultation", "converted", "closed"].includes(lead.status);
}

function statusLabel(status) {
  const labels = {
    new: "Unclaimed",
    claimed: "Claimed",
    attempted: "Contact attempted",
    noContact: "No contact made",
    contacted: "Contacted",
    appointment: "Appointment set",
    consultation: "Consultation completed",
    converted: "Converted",
    nurture: "Nurture",
    doNotContact: "Archived - do not contact",
    archived: "Archived",
    lost: "Lost",
    closed: "Closed sale",
  };
  return labels[status] || status;
}

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function jwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function signedInEmail() {
  return normalizedEmail(cloudSession?.user?.email || jwtPayload(cloudSession?.access_token).email);
}

function isMasterEmail(email = signedInEmail()) {
  return MASTER_EMAILS.includes(normalizedEmail(email));
}

function teamMemberForEmail(email = signedInEmail()) {
  const target = normalizedEmail(email);
  if (!target) return null;
  return team.find((member) => normalizedEmail(member.email) === target) || null;
}

function fullAccessFor(member) {
  return member && (FULL_ACCESS_ROLES.includes(member.accessRole) || teamMemberStatus(member) === "Admin only");
}

function applySignedInTeamAccess() {
  if (isMasterEmail()) {
    const lisa = team.find((member) => member.name.toLowerCase() === "lisa") || team[0];
    if (lisa) {
      lisa.email = lisa.email || signedInEmail();
      lisa.accessRole = "Full access";
      myOwner = lisa.name;
      localStorage.setItem(MY_OWNER_KEY, myOwner);
    }
    accountRole = "master";
    localStorage.setItem(ACCOUNT_ROLE_KEY, accountRole);
    return;
  }
  const member = teamMemberForEmail();
  if (!member) return;
  myOwner = member.name;
  localStorage.setItem(MY_OWNER_KEY, myOwner);
  accountRole = fullAccessFor(member) ? "master" : "team";
  localStorage.setItem(ACCOUNT_ROLE_KEY, accountRole);
}

function visibleLeads() {
  if (accountRole === "team") {
    return leads.filter((lead) => lead.status === "new" || lead.assignedTo === myOwner);
  }
  return leads;
}

function canManageAll() {
  return accountRole === "master";
}

function applyAccountAccess() {
  if (cloudSession?.access_token) applySignedInTeamAccess();
  document.querySelector("#accountRoleSelect").value = accountRole;
  document.querySelector("#accountRoleSelect").disabled = Boolean(teamMemberForEmail()) && !isMasterEmail();
  document.querySelectorAll(".master-only").forEach((element) => {
    element.classList.toggle("hidden", !canManageAll());
  });
  if (!canManageAll() && ["team"].includes(activeView)) switchView("myLeads");
}

function latestResponseLabel(lead) {
  if (lead.convertedAt) return `Converted ${dateOnlyLabel(lead.convertedAt)}`;
  if (lead.lostAt) return `Lost ${dateOnlyLabel(lead.lostAt)}`;
  if (lead.consultationCompletedAt) return `Consultation ${dateOnlyLabel(lead.consultationCompletedAt)}`;
  if (lead.appointmentSetAt) return `Appointment ${dateOnlyLabel(lead.appointmentSetAt)}`;
  if (lead.firstContactedAt) return `Contacted ${dateOnlyLabel(lead.firstContactedAt)}`;
  if (lead.firstAttemptedAt) return `Attempted ${dateOnlyLabel(lead.firstAttemptedAt)}`;
  return "No response tracked";
}

function teamMemberStatus(member) {
  return member.status || (member.active === false ? "Paused" : "Available");
}

function teamStatusOptions(selected = "Available") {
  return TEAM_STATUSES.map((status) => `
    <option ${status === selected ? "selected" : ""}>${status}</option>
  `).join("");
}

function ownerOptions(selected = "", includeUnassigned = true) {
  return [
    includeUnassigned ? `<option value="">Unassigned</option>` : "",
    ...team.map((member) => `
      <option value="${escapeHtml(member.name)}" ${member.name === selected ? "selected" : ""}>${escapeHtml(member.name)}</option>
    `),
  ].join("");
}

function ownerFilterOptions(selected = "all") {
  return [
    `<option value="all" ${selected === "all" ? "selected" : ""}>All owners</option>`,
    `<option value="" ${selected === "" ? "selected" : ""}>Unassigned</option>`,
    ...team.map((member) => `
      <option value="${escapeHtml(member.name)}" ${member.name === selected ? "selected" : ""}>${escapeHtml(member.name)}</option>
    `),
  ].join("");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 5200);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function enablePushAlerts() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    showToast("Push alerts are not supported on this browser.");
    return;
  }
  if (location.protocol === "file:") {
    showToast("Push alerts work from the hosted app, not the local file.");
    return;
  }
  if (!myOwner) {
    showToast("Choose who you are in Working as first.");
    return;
  }
  try {
    const config = await appApiRequest("/api/public-config");
    if (!config.pushEnabled || !config.vapidPublicKey) {
      showToast("Push is not turned on in Vercel yet.");
      return;
    }
    if (!config.cloudSaveEnabled) {
      showToast("Push cannot save yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("Push permission was not approved.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    });
    await appApiRequest("/api/push-subscription", {
      method: "POST",
      body: JSON.stringify({ owner: myOwner, subscription: subscription.toJSON() }),
    });
    showToast(`Push alerts enabled for ${myOwner}. Now send a test push.`);
  } catch (error) {
    showToast(`Push setup failed: ${error.message}`);
  }
}

async function sendTestPush() {
  if (location.protocol === "file:") {
    showToast("Test push works from the hosted app, not the local file.");
    return;
  }
  if (!myOwner) {
    showToast("Choose who you are in Working as first.");
    return;
  }
  try {
    await appApiRequest("/api/test-push", {
      method: "POST",
      body: JSON.stringify({ owner: myOwner }),
    });
    showToast(`Test push sent to ${myOwner}.`);
  } catch (error) {
    showToast(`Test push failed: ${error.message}`);
  }
}

function activeTeam() {
  return team.filter((member) => ROUTING_STATUSES.includes(teamMemberStatus(member)));
}

function broadcastLead(lead) {
  const recipients = settings.notifyAll ? activeTeam() : activeTeam().slice(0, 1);
  const names = recipients.map((member) => member.name).join(", ") || "no active team members";
  const message = settings.notificationTemplate
    .replaceAll("{source}", lead.source)
    .replaceAll("{name}", lead.name)
    .replaceAll("{type}", lead.type)
    .replaceAll("{property}", lead.property || "No property")
    .replaceAll("{id}", lead.id);
  addActivity(lead, `Simulated email/push alert sent to ${names}: ${message}`);
}

function addActivity(lead, text) {
  lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
  lead.activity.unshift({ at: new Date().toISOString(), text });
  lead.updatedAt = new Date().toISOString();
}

function leadCard(lead, compact = false) {
  const assigned = lead.assignedTo ? `Assigned to ${escapeHtml(lead.assignedTo)}` : "Available to claim";
  return `
    <article class="lead-card ${lead.urgency.toLowerCase()} status-${lead.status} ${lead.status === "new" ? "" : "claimed"}" data-open-lead="${lead.id}">
      <div class="lead-main">
        <div>
          <strong>${escapeHtml(lead.name)}</strong>
          <span>${escapeHtml(lead.source || "Lead")}${lead.property ? ` - ${escapeHtml(lead.property)}` : ""}</span>
        </div>
        <span class="status-pill">${statusLabel(lead.status)}</span>
      </div>
      ${compact ? "" : `
        <div class="lead-meta">
          <span>${escapeHtml(lead.type)}</span>
          <span>${escapeHtml(lead.urgency)}</span>
          <span>${leadAge(lead.createdAt)}</span>
          <span>${assigned}</span>
          ${lead.nextFollowUpDate ? `<span>Follow-up ${dateOnlyLabel(lead.nextFollowUpDate)}</span>` : ""}
        </div>
      `}
      <div class="lead-actions">
        ${lead.status === "new" ? claimButtons(lead) : ""}
        ${compact ? "" : `
          <button class="ghost-button" type="button" data-response-lead="${lead.id}" data-response="attempted">Attempted</button>
          <button class="ghost-button" type="button" data-response-lead="${lead.id}" data-response="noContact">No contact</button>
          <button class="ghost-button" type="button" data-status-lead="${lead.id}" data-status="contacted">Contacted</button>
          <button class="ghost-button" type="button" data-status-lead="${lead.id}" data-status="appointment">Appointment</button>
          <button class="ghost-button" type="button" data-status-lead="${lead.id}" data-status="nurture">Nurture</button>
          <button class="ghost-button" type="button" data-response-lead="${lead.id}" data-response="doNotContact">Archive DNC</button>
        `}
      </div>
    </article>
  `;
}

function claimButtons(lead) {
  if (!canManageAll()) {
    const member = team.find((entry) => entry.name === myOwner);
    return member ? `<button class="primary-button" type="button" data-claim-lead="${lead.id}" data-member="${member.id}">Claim lead</button>` : "";
  }
  const members = activeTeam();
  if (!members.length) return `<button class="ghost-button" type="button" disabled>No active agents</button>`;
  return members.map((member) => `
    <button class="primary-button" type="button" data-claim-lead="${lead.id}" data-member="${member.id}">Claim: ${escapeHtml(member.name)}</button>
  `).join("");
}

function metricCard(label, value, helper) {
  return `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <span>${helper}</span>
    </article>
  `;
}

function renderMetrics() {
  const scope = visibleLeads();
  const unclaimed = scope.filter((lead) => lead.status === "new").length;
  const claimed = scope.filter((lead) => !["new", "closed", "converted", "lost", "doNotContact", "archived"].includes(lead.status)).length;
  const appointments = scope.filter((lead) => lead.status === "appointment").length;
  const hot = scope.filter((lead) => lead.urgency === "Hot" && lead.status !== "closed").length;
  const converted = scope.filter((lead) => lead.status === "converted").length;
  document.querySelector("#metricsGrid").innerHTML = [
    metricCard("Unclaimed", unclaimed, "Needs response"),
    metricCard("Claimed active", claimed, "Being worked"),
    metricCard("Appointments", appointments, "Set from leads"),
    metricCard("Hot leads", hot, "High priority"),
    metricCard("Converted", converted, "Became clients"),
  ].join("");
}

function renderDashboard() {
  const scope = visibleLeads();
  const unclaimed = scope.filter((lead) => lead.status === "new").sort(sortNewest);
  const claimed = scope.filter((lead) => !["new", "closed", "converted", "lost", "doNotContact", "archived"].includes(lead.status)).sort(sortNewest);
  document.querySelector("#unclaimedCount").textContent = unclaimed.length;
  document.querySelector("#claimedCount").textContent = claimed.length;
  document.querySelector("#unclaimedLeads").innerHTML = unclaimed.length ? unclaimed.map((lead) => leadCard(lead, true)).join("") : emptyState("No unclaimed leads.");
  document.querySelector("#claimedLeads").innerHTML = claimed.length ? claimed.map((lead) => leadCard(lead, true)).join("") : emptyState("No claimed leads yet.");
}

function sortNewest(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function filteredLeads() {
  const term = searchTerm.trim().toLowerCase();
  return visibleLeads().filter((lead) => {
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const matchesOwner = ownerFilter === "all" || String(lead.assignedTo || "") === ownerFilter;
    const haystack = [lead.name, lead.source, lead.type, lead.phone, lead.email, lead.property, lead.price, lead.message, lead.assignedTo]
      .join(" ")
      .toLowerCase();
    return matchesStatus && matchesOwner && haystack.includes(term);
  }).sort(sortNewest);
}

function renderInbox() {
  const rows = filteredLeads();
  document.querySelector("#leadTable").innerHTML = rows.length ? rows.map((lead) => leadCard(lead, true)).join("") : emptyState("No leads match this view.");
}

function renderTeam() {
  document.querySelector("#teamGrid").innerHTML = team.map((member) => `
    <article class="team-card ${ROUTING_STATUSES.includes(teamMemberStatus(member)) ? "" : "paused"}">
      <strong>${escapeHtml(member.name)}</strong>
      <span>${escapeHtml(member.phone || "No phone")}</span>
      <span>${escapeHtml(member.email || "No email")}</span>
      <span>${escapeHtml(teamMemberStatus(member))}</span>
      <span>${escapeHtml(member.accessRole || "Team member")}</span>
      <span>${escapeHtml(member.inviteStatus || "Not invited")}</span>
      <div class="lead-actions">
        <button class="ghost-button" type="button" data-edit-team="${member.id}">Edit</button>
        <button class="ghost-button" type="button" data-invite-team="${member.id}">Prepare invite email</button>
        <button class="ghost-button" type="button" data-download-owner="${escapeHtml(member.name)}">Download leads</button>
      </div>
    </article>
  `).join("");
}

function renderOwnerControls() {
  document.querySelector("#ownerFilter").innerHTML = ownerFilterOptions(ownerFilter);
  document.querySelector("#downloadOwnerSelect").innerHTML = ownerOptions(team[0]?.name || "", false);
  myOwner = team.some((member) => member.name === myOwner) ? myOwner : team[0]?.name || "";
  document.querySelector("#myOwnerSelect").innerHTML = ownerOptions(myOwner, false);
  const workflowSelect = document.querySelector("#workflowOwnerSelect");
  workflowOwner = team.some((member) => member.name === workflowOwner) ? workflowOwner : team[0]?.name || "";
  workflowSelect.innerHTML = ownerOptions(workflowOwner, false);
  document.querySelector("#leadOwnerSelect").innerHTML = ownerOptions("", true);
}

function leadRank(lead) {
  if (lead.status === "converted") return 6;
  if (lead.status === "consultation") return 5;
  if (lead.status === "appointment") return 4;
  if (lead.status === "contacted") return 3;
  if (lead.status === "attempted") return 2;
  if (lead.urgency === "Hot") return 0;
  if (lead.urgency === "Warm") return 1;
  return 7;
}

function pipelineGroupKey(lead) {
  if (lead.status === "archived") return "doNotContact";
  if (lead.status === "converted") return "converted";
  if (lead.status === "consultation") return "consultation";
  if (lead.status === "appointment") return "appointment";
  if (lead.status === "contacted") return "contacted";
  if (lead.status === "noContact") return "noContact";
  if (lead.status === "attempted") return "attempted";
  if (lead.urgency === "Hot") return "hot";
  if (lead.urgency === "Warm") return "warm";
  return "nurture";
}

function ownerLeads(owner) {
  return leads
    .filter((lead) => lead.assignedTo === owner && !["closed", "lost", "doNotContact", "archived"].includes(lead.status))
    .sort((a, b) => leadRank(a) - leadRank(b) || sortNewest(a, b));
}

function dailyWorkflowLeads(owner) {
  const today = dateKey();
  return ownerLeads(owner)
    .filter((lead) => !lead.nextFollowUpDate || lead.nextFollowUpDate <= today || lead.status === "new")
    .sort((a, b) => (a.nextFollowUpDate || "0000-00-00").localeCompare(b.nextFollowUpDate || "0000-00-00") || leadRank(a) - leadRank(b));
}

function workflowLeadCard(lead) {
  return `
    <article class="workflow-task status-${lead.status} ${lead.urgency.toLowerCase()}" data-open-lead="${lead.id}">
      <div class="workflow-task-main">
        <strong>${escapeHtml(lead.name)}</strong>
        <span>${escapeHtml(lead.source || "Lead")} · ${escapeHtml(taskReason(lead))}</span>
        <em>${Number(lead.contactAttempts || 0)} attempts · ${escapeHtml(statusLabel(lead.status))}</em>
      </div>
      <div class="workflow-task-actions">
        <button type="button" data-attempt-lead="${lead.id}" data-attempt-type="Call">Call</button>
        <button type="button" data-attempt-lead="${lead.id}" data-attempt-type="Text">Text</button>
        <button type="button" data-attempt-lead="${lead.id}" data-attempt-type="Email">Email</button>
        <button type="button" data-response-lead="${lead.id}" data-response="contacted">Contacted</button>
        <button type="button" data-followup-lead="${lead.id}" data-days="1">Tomorrow</button>
        <button type="button" data-followup-lead="${lead.id}" data-days="7">Next week</button>
      </div>
    </article>
  `;
}

function miniLeadTile(lead) {
  return `
    <article class="lead-mini-tile status-${lead.status} ${lead.urgency.toLowerCase()}" data-open-lead="${lead.id}" title="${escapeAttr(statusLabel(lead.status))}${lead.source ? ` - ${escapeAttr(lead.source)}` : ""}">
      <strong>${escapeHtml(lead.name)}</strong>
      <span>${Number(lead.contactAttempts || 0)} attempts</span>
      <button type="button" data-attempt-lead="${lead.id}" title="Log contact attempt">+</button>
    </article>
  `;
}

function renderWorkflow() {
  const owner = workflowOwner || team[0]?.name || "";
  const daily = dailyWorkflowLeads(owner);
  document.querySelector("#dailyWorkflowCount").textContent = daily.length;
  document.querySelector("#dailyWorkflowList").innerHTML = daily.length ? daily.map(workflowLeadCard).join("") : emptyState("No contacts due for this owner.");
  document.querySelector("#ownerPipeline").innerHTML = PIPELINE_GROUPS.map((group) => {
    const groupLeads = ownerLeads(owner).filter((lead) => pipelineGroupKey(lead) === group.key);
    return `
      <section class="pipeline-column-card">
        <div class="section-title">
          <h3>${group.label}</h3>
          <span>${groupLeads.length}</span>
        </div>
        <div class="lead-list compact">
          ${groupLeads.length ? groupLeads.map((lead) => leadCard(lead, true)).join("") : emptyState("None")}
        </div>
      </section>
    `;
  }).join("");
}

function renderLeadBucket(listId, countId, items, emptyText) {
  document.querySelector(`#${countId}`).textContent = items.length;
  document.querySelector(`#${listId}`).innerHTML = items.length ? items.map(miniLeadTile).join("") : emptyState(emptyText);
}

function hotTasksFor(owner) {
  const today = dateKey();
  return ownerLeads(owner)
    .filter((lead) => (
      !lead.nextFollowUpDate ||
      lead.nextFollowUpDate <= today ||
      (lead.urgency === "Hot" && !madeContact(lead))
    ))
    .sort((a, b) => (a.nextFollowUpDate || "0000-00-00").localeCompare(b.nextFollowUpDate || "0000-00-00") || leadRank(a) - leadRank(b));
}

function taskReason(lead) {
  const today = dateKey();
  if (!lead.nextFollowUpDate) return "Needs follow-up date";
  if (lead.nextFollowUpDate < today) return `Overdue ${dateOnlyLabel(lead.nextFollowUpDate)}`;
  if (lead.nextFollowUpDate === today) return "Due today";
  if (lead.urgency === "Hot" && !madeContact(lead)) return "Hot lead";
  return statusLabel(lead.status);
}

function renderHotTasks() {
  const tasks = hotTasksFor(myOwner);
  document.querySelector("#hotTaskCount").textContent = tasks.length;
  document.querySelector("#hotTaskList").innerHTML = tasks.length ? tasks.map((lead) => `
    <article class="hot-task status-${lead.status}" data-open-lead="${lead.id}">
      <strong>${escapeHtml(lead.name)}</strong>
      <span>${escapeHtml(taskReason(lead))}</span>
      <em>${Number(lead.contactAttempts || 0)} attempts</em>
      <button type="button" data-attempt-lead="${lead.id}">+ Attempt</button>
    </article>
  `).join("") : emptyState("No hot tasks right now.");
}

function renderMyLeads() {
  const mine = ownerLeads(myOwner);
  const newOrClaimed = mine.filter((lead) => ["new", "claimed"].includes(lead.status));
  const attempted = mine.filter((lead) => ["attempted", "noContact"].includes(lead.status));
  const contacted = mine.filter((lead) => lead.status === "contacted");
  const appointment = mine.filter((lead) => ["appointment", "consultation"].includes(lead.status));
  const nurture = mine.filter((lead) => lead.status === "nurture" || lead.urgency === "Nurture");

  renderLeadBucket("myDueLeads", "myDueCount", newOrClaimed, "No new or claimed leads.");
  renderLeadBucket("myNewLeads", "myNewCount", attempted, "No attempted leads.");
  renderLeadBucket("myHotLeads", "myHotCount", contacted, "No contacted leads.");
  renderLeadBucket("myContactedLeads", "myContactedCount", appointment, "No appointments yet.");
  renderLeadBucket("myNurtureLeads", "myNurtureCount", nurture, "No nurture leads.");
  renderHotTasks();
}

function countBy(items, getKey) {
  return items.reduce((totals, item) => {
    const key = getKey(item) || "Unassigned";
    totals[key] = (totals[key] || 0) + 1;
    return totals;
  }, {});
}

function weeklyCheckInLeads() {
  const today = dateKey();
  const end = weekEndKey();
  return visibleLeads()
    .filter((lead) => !["closed", "converted", "lost", "doNotContact", "archived"].includes(lead.status))
    .filter((lead) => !lead.nextFollowUpDate || lead.nextFollowUpDate <= end)
    .sort((a, b) => (a.nextFollowUpDate || "0000-00-00").localeCompare(b.nextFollowUpDate || "0000-00-00") || leadRank(a) - leadRank(b))
    .map((lead) => ({
      ...lead,
      checkInStatus: !lead.nextFollowUpDate ? "Needs follow-up date" : lead.nextFollowUpDate < today ? "Overdue" : "Due this week",
    }));
}

function statRows(title, totals) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `
    <article class="report-card">
      <h3>${title}</h3>
      ${entries.length ? entries.map(([label, value]) => `
        <div class="stat-row">
          <span>${escapeHtml(label)}</span>
          <strong>${value}</strong>
        </div>
      `).join("") : `<div class="empty-state">No data</div>`}
    </article>
  `;
}

function chartColor(index) {
  return ["#123849", "#d9a441", "#20bfd4", "#e5487b", "#6c7a89", "#7fb069", "#9a6dd7", "#f28c38"][index % 8];
}

function donutChart(title, totals) {
  const entries = Object.entries(totals).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let cursor = 0;
  const segments = entries.map(([, value], index) => {
    const start = cursor;
    const size = total ? (value / total) * 100 : 0;
    cursor += size;
    return `${chartColor(index)} ${start}% ${cursor}%`;
  }).join(", ");
  return `
    <article class="report-card chart-card">
      <h3>${title}</h3>
      ${total ? `
        <div class="donut-wrap">
          <div class="donut-chart" style="background: conic-gradient(${segments});">
            <span>${total}</span>
          </div>
          <div class="chart-legend">
            ${entries.map(([label, value], index) => `
              <div class="legend-row">
                <i style="background:${chartColor(index)}"></i>
                <span>${escapeHtml(label)}</span>
                <strong>${value}</strong>
              </div>
            `).join("")}
          </div>
        </div>
      ` : `<div class="empty-state">No chart data</div>`}
    </article>
  `;
}

function barChart(title, rows, valueKey = "total") {
  const max = Math.max(1, ...rows.map((row) => row[valueKey] || 0));
  return `
    <article class="report-card wide-report-card">
      <h3>${title}</h3>
      ${rows.length ? rows.map((row, index) => `
        <div class="bar-row">
          <span>${escapeHtml(row.owner || row.label)}</span>
          <div class="bar-track">
            <i style="width:${Math.max(4, ((row[valueKey] || 0) / max) * 100)}%; background:${chartColor(index)}"></i>
          </div>
          <strong>${row[valueKey] || 0}</strong>
        </div>
      `).join("") : `<div class="empty-state">No chart data</div>`}
    </article>
  `;
}

function percentLabel(value, total) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function reportScope() {
  return visibleLeads().filter(leadInReportRange);
}

function ownerPerformanceRows(scope) {
  const owners = canManageAll()
    ? team.map((member) => member.name)
    : [myOwner];
  const assignedOwners = [...new Set(scope.map((lead) => lead.assignedTo).filter(Boolean))];
  const rowOwners = [...new Set([...owners, ...assignedOwners])].filter(Boolean);
  return rowOwners.map((owner) => {
    const ownerLeadsForRange = scope.filter((lead) => lead.assignedTo === owner);
    const contacted = ownerLeadsForRange.filter(madeContact).length;
    const noContact = ownerLeadsForRange.filter((lead) => lead.status === "noContact").length;
  const archived = ownerLeadsForRange.filter((lead) => ["doNotContact", "archived"].includes(lead.status)).length;
    return { owner, total: ownerLeadsForRange.length, contacted, noContact, archived };
  }).filter((row) => row.total || canManageAll());
}

function ownerPerformanceReport(scope) {
  const rows = ownerPerformanceRows(scope);
  return `
    <article class="report-card wide-report-card">
      <h3>${canManageAll() ? "Team member performance" : "My lead performance"}</h3>
      ${rows.length ? rows.map((row) => `
        <div class="performance-row">
          <strong>${escapeHtml(row.owner)}</strong>
          <span>${row.total} received</span>
          <span>${row.contacted} contacted (${percentLabel(row.contacted, row.total)})</span>
          <span>${row.noContact} no contact</span>
          <span>${row.archived} archived</span>
        </div>
      `).join("") : `<div class="empty-state">No leads in this range.</div>`}
    </article>
  `;
}

function renderReports() {
  const rangeSelect = document.querySelector("#reportRangeSelect");
  if (rangeSelect) rangeSelect.value = reportRange;
  const scope = reportScope();
  const active = scope.filter((lead) => !["closed", "converted", "lost", "doNotContact", "archived"].includes(lead.status));
  const weekly = weeklyCheckInLeads();
  const overdue = weekly.filter((lead) => lead.checkInStatus === "Overdue").length;
  const noDate = weekly.filter((lead) => lead.checkInStatus === "Needs follow-up date").length;
  const contacted = scope.filter(madeContact).length;
  const noContact = scope.filter((lead) => lead.status === "noContact").length;
  const archived = scope.filter((lead) => ["doNotContact", "archived"].includes(lead.status)).length;
  document.querySelector("#reportMetrics").innerHTML = [
    metricCard("Leads received", scope.length, reportRangeLabel()),
    metricCard("Made contact", contacted, `${percentLabel(contacted, scope.length)} of received`),
    metricCard("No contact made", noContact, `${percentLabel(noContact, scope.length)} of received`),
    metricCard("Archived", archived, "Saved outside active work"),
    metricCard("Active funnel", active.length, "Open leads"),
    metricCard("Due follow-ups", weekly.length, `${overdue} overdue · ${noDate} no date`),
  ].join("");
  const ownerRows = ownerPerformanceRows(scope);
  document.querySelector("#leadPerformanceReport").innerHTML = [
    donutChart("Lead source mix", countBy(scope, (lead) => lead.source || "Unknown source")),
    donutChart("Contact outcome mix", {
      "Made contact": contacted,
      "No contact made": noContact,
      "Archived": archived,
      "Not worked yet": scope.filter((lead) => ["new", "claimed"].includes(lead.status)).length,
    }),
    barChart(canManageAll() ? "Leads received by team member" : "My leads received", ownerRows),
    ownerPerformanceReport(scope),
    statRows("Lead sources", countBy(scope, (lead) => lead.source || "Unknown source")),
    statRows("Contact outcomes", {
      "Made contact": contacted,
      "No contact made": noContact,
      "Archived": archived,
      "Not worked yet": scope.filter((lead) => ["new", "claimed"].includes(lead.status)).length,
    }),
  ].join("");
  document.querySelector("#weeklyCheckInReport").innerHTML = weekly.length ? weekly.map((lead) => `
    <div class="table-row report-row">
      <strong>${escapeHtml(lead.name)}</strong>
      <span>${escapeHtml(lead.assignedTo || "Unassigned")}</span>
      <span>${escapeHtml(lead.source)} · ${escapeHtml(lead.urgency)}</span>
      <span>${lead.nextFollowUpDate ? dateOnlyLabel(lead.nextFollowUpDate) : "No date"} · ${lead.checkInStatus}</span>
      <button class="ghost-button" type="button" data-edit-lead="${lead.id}">Open</button>
    </div>
  `).join("") : emptyState("No weekly check-ins needed.");
  document.querySelector("#overallStatsReport").innerHTML = [
    statRows("By status", countBy(scope, (lead) => statusLabel(lead.status))),
    statRows("By source", countBy(scope, (lead) => lead.source)),
    statRows("By owner", countBy(scope, (lead) => lead.assignedTo || "Unassigned")),
    statRows("By urgency", countBy(scope, (lead) => lead.urgency)),
  ].join("");
}

function renderSettings() {
  document.querySelector("#notificationTemplate").value = settings.notificationTemplate;
  document.querySelector("#allowReclaim").checked = settings.allowReclaim;
  document.querySelector("#notifyAll").checked = settings.notifyAll;
}

function renderSyncStatus() {
  const signedIn = Boolean(cloudSession?.access_token);
  const pushAvailable = "serviceWorker" in navigator && "PushManager" in window && location.protocol !== "file:";
  const syncLabels = {
    pending: "Auto-save pending",
    saving: "Saving to cloud...",
    saved: "Auto-saved",
    error: "Auto-save needs attention",
    idle: "Connected to Supabase",
  };
  const lastSavedText = lastAutoSync ? ` Last saved ${dateTimeLabel(lastAutoSync)}.` : "";
  document.querySelector("#syncStatus").textContent = signedIn ? syncLabels[syncState] || syncLabels.idle : "Local mode";
  document.querySelector("#syncHelper").textContent = signedIn
    ? `Changes save automatically.${lastSavedText} Use Refresh if another device changed leads.`
    : "Sign in to share leads and claims with the team.";
  document.querySelector("#authForm").classList.toggle("hidden", signedIn);
  document.querySelector("#signOutButton").classList.toggle("hidden", !signedIn);
  document.querySelector("#refreshCloudButton").disabled = !signedIn;
  document.querySelector("#enablePushButton").disabled = !pushAvailable || !myOwner;
  document.querySelector("#testPushButton").disabled = !pushAvailable || !myOwner;
}

function emptyState(text) {
  return `<div class="empty-state">${text}</div>`;
}

function renderAll() {
  renderMetrics();
  renderDashboard();
  renderInbox();
  renderTeam();
  renderOwnerControls();
  renderMyLeads();
  renderWorkflow();
  renderReports();
  renderSettings();
  renderSyncStatus();
  applyAccountAccess();
}

function switchView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}View`));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function fillLeadForm(lead = {}) {
  window.clearTimeout(leadFormAutoSaveTimer);
  const form = document.querySelector("#leadForm");
  form.elements.assignedTo.innerHTML = ownerOptions(lead.assignedTo || "", true);
  form.elements.leadId.value = lead.id || "";
  form.elements.source.value = lead.source || "";
  form.elements.type.value = lead.type || "Buyer";
  form.elements.name.value = lead.name || "";
  form.elements.phone.value = lead.phone || "";
  form.elements.email.value = lead.email || "";
  form.elements.property.value = lead.property || "";
  form.elements.price.value = lead.price || "";
  form.elements.urgency.value = lead.urgency || "Warm";
  form.elements.status.value = lead.status || "new";
  form.elements.assignedTo.value = lead.assignedTo || "";
  form.elements.nextFollowUpDate.value = lead.nextFollowUpDate || "";
  form.elements.firstAttemptedAt.value = lead.firstAttemptedAt || "";
  form.elements.firstContactedAt.value = lead.firstContactedAt || "";
  form.elements.appointmentSetAt.value = lead.appointmentSetAt || "";
  form.elements.consultationCompletedAt.value = lead.consultationCompletedAt || "";
  form.elements.convertedAt.value = lead.convertedAt || "";
  form.elements.lostAt.value = lead.lostAt || "";
  form.elements.outcomeNotes.value = lead.outcomeNotes || "";
  form.elements.message.value = lead.message || "";
  document.querySelector("#leadNoteText").value = "";
  renderLeadNotes(lead);
  document.querySelector("#engagementDraft").value = "";
}

function renderLeadNotes(lead = {}) {
  const notes = Array.isArray(lead.notes) ? lead.notes : [];
  document.querySelector("#leadNotesLog").innerHTML = notes.length ? notes.map((note) => `
    <article class="note-entry">
      <strong>${dateTimeLabel(note.at)}</strong>
      <p>${escapeHtml(note.text)}</p>
    </article>
  `).join("") : emptyState("No notes yet.");
}

function openLeadDialog(lead) {
  window.clearTimeout(leadFormAutoSaveTimer);
  fillLeadForm(lead);
  document.querySelector("#leadDialogTitle").textContent = lead ? "Edit Lead" : "Add Lead";
  document.querySelector("#archiveLeadButton").classList.toggle("hidden", !lead);
  document.querySelector("#archiveLeadButton").dataset.archiveLead = lead?.id || "";
  document.querySelector("#leadDialog").showModal();
}

function currentLeadFromForm() {
  const form = document.querySelector("#leadForm");
  return {
    source: form.elements.source.value.trim() || "your inquiry",
    type: form.elements.type.value || "Buyer",
    name: form.elements.name.value.trim() || "there",
    phone: form.elements.phone.value.trim(),
    email: form.elements.email.value.trim(),
    property: form.elements.property.value.trim(),
    price: form.elements.price.value.trim(),
    message: form.elements.message.value.trim(),
  };
}

function firstName(name) {
  return String(name || "there").trim().split(/\s+/)[0] || "there";
}

function leadDraft(type) {
  const lead = currentLeadFromForm();
  const greeting = `Hi ${firstName(lead.name)},`;
  const propertyLine = lead.property ? ` about ${lead.property}` : "";
  const buyerNeed = lead.property
    ? `I saw your inquiry about ${lead.property}.`
    : "I saw your inquiry and would love to help you with the next step.";
  const sellerNeed = lead.property
    ? `I saw your inquiry about ${lead.property}.`
    : "I saw your inquiry about selling and would be happy to help.";
  if (type === "buyer-text") {
    return `${greeting} this is Lisa Naples. ${buyerNeed} Are you hoping to see it, get more details, or talk through whether it could be a good fit?`;
  }
  if (type === "buyer-email") {
    return `${greeting}\n\nThank you for reaching out through ${lead.source}. ${buyerNeed}\n\nI can help with the property details, showing availability, recent comparable sales, and how it may fit what you are looking for.\n\nWhat is the best next step for you: setting up a showing, getting more information first, or talking through your search goals?\n\nThanks,\nLisa`;
  }
  if (type === "showing") {
    return `${greeting}\n\nThank you for reaching out${propertyLine}. I can check showing availability and help coordinate a time that works.\n\nAre you available today or tomorrow, and are there any must-have questions you want me to look into before we schedule?\n\nThanks,\nLisa`;
  }
  if (type === "buyer-preapproval") {
    return `${greeting}\n\nI would be happy to help you with this property and your search. If you are planning to tour or make an offer, the strongest next step is making sure your financing/pre-approval is current.\n\nIf you already have a lender, great. If not, I can point you toward a few good local options so you are ready when the right home comes along.\n\nWould you like to start with the property details or talk through financing first?\n\nThanks,\nLisa`;
  }
  if (type === "seller-text") {
    return `${greeting} this is Lisa Naples. ${sellerNeed} Are you looking for a quick value estimate, advice on timing, or a plan for getting the home ready?`;
  }
  if (type === "seller-email") {
    return `${greeting}\n\nThank you for reaching out through ${lead.source}. ${sellerNeed}\n\nI can help you understand likely value, timing, preparation, and what the current market means for your specific home.\n\nA short conversation would help me give you better guidance. Are you thinking soon, later this year, or just exploring options?\n\nThanks,\nLisa`;
  }
  if (type === "seller-value") {
    return `${greeting}\n\nThank you for reaching out. I would be glad to help you get a realistic sense of value.\n\nOnline estimates can be a starting point, but they usually miss condition, updates, setting, competition, and buyer demand. I can put together a more thoughtful range once I know a little more about the home and your timing.\n\nWould you prefer a quick call first, or would you like to send me a few details about the property?\n\nThanks,\nLisa`;
  }
  if (type === "seller-prep") {
    return `${greeting}\n\nIf you are thinking about selling, one of the most useful things we can do early is talk through preparation: what is worth doing, what is not worth doing, timing, photos, staging, and how to launch well.\n\nI would be happy to walk through that with you before you spend time or money on projects.\n\nWhat does your ideal timing look like?\n\nThanks,\nLisa`;
  }
  if (type === "still-interested") {
    return `${greeting}\n\nI wanted to check back in on your ${lead.source} inquiry${propertyLine}. Are you still interested, or has your search changed direction?\n\nEither way is completely fine. I just do not want to miss helping you if this is still on your radar.\n\nThanks,\nLisa`;
  }
  if (type === "no-pressure") {
    return `${greeting}\n\nJust a quick, no-pressure follow-up. I know real estate timing can shift quickly, and sometimes an online inquiry is just the beginning of figuring things out.\n\nIf you would like help, I am happy to be a resource. If now is not the right time, that is okay too.\n\nThanks,\nLisa`;
  }
  return lead.type === "Seller" ? leadDraft("seller-email") : leadDraft("buyer-email");
}

function prepareEngagementDraft(type) {
  document.querySelector("#engagementDraft").value = leadDraft(type);
}

async function copyEngagementDraft() {
  const text = document.querySelector("#engagementDraft").value.trim();
  if (!text) {
    showToast("Choose a draft first.");
    return;
  }
  await navigator.clipboard.writeText(text);
  showToast("Draft copied.");
}

function openEmailDraft() {
  const lead = currentLeadFromForm();
  const body = document.querySelector("#engagementDraft").value.trim();
  if (!body) {
    showToast("Choose a draft first.");
    return;
  }
  const subject = lead.property ? `Your inquiry about ${lead.property}` : "Your real estate inquiry";
  window.location.href = `mailto:${encodeURIComponent(lead.email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function saveLead(form, options = {}) {
  const data = new FormData(form);
  const existingId = Number(data.get("leadId"));
  const existing = leads.find((lead) => lead.id === existingId);
  const hasDraftContent = ["source", "name", "phone", "email", "property", "price", "message"].some((key) => String(data.get(key) || "").trim());
  if (!existing && !hasDraftContent) return null;
  const lead = {
    id: existing?.id || Date.now(),
    source: String(data.get("source") || "").trim() || "Manual lead",
    type: String(data.get("type") || "Buyer"),
    name: String(data.get("name") || "").trim() || "New lead",
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    property: String(data.get("property") || "").trim(),
    price: String(data.get("price") || "").trim(),
    urgency: String(data.get("urgency") || "Warm"),
    status: String(data.get("status") || existing?.status || "new"),
    assignedTo: String(data.get("assignedTo") || "").trim(),
    nextFollowUpDate: data.get("nextFollowUpDate") || "",
    firstAttemptedAt: data.get("firstAttemptedAt") || "",
    firstContactedAt: data.get("firstContactedAt") || "",
    appointmentSetAt: data.get("appointmentSetAt") || "",
    consultationCompletedAt: data.get("consultationCompletedAt") || "",
    convertedAt: data.get("convertedAt") || "",
    lostAt: data.get("lostAt") || "",
    outcomeNotes: String(data.get("outcomeNotes") || "").trim(),
    message: String(data.get("message") || "").trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: existing?.notes || [],
    contactAttempts: Number(existing?.contactAttempts || 0),
    activity: existing?.activity || [],
  };
  if (existing) {
    Object.assign(existing, lead);
    if (options.activity !== false) addActivity(existing, "Lead details updated.");
  } else {
    lead.activity = [{ at: new Date().toISOString(), text: `Lead received from ${lead.source}.` }];
    leads.unshift(lead);
    if (options.broadcast) broadcastLead(lead);
    form.elements.leadId.value = lead.id;
  }
  saveAndSync({ silent: options.silent !== false });
  if (options.close) {
    form.reset();
    document.querySelector("#leadDialog").close();
  }
  renderAll();
  if (options.toast) showToast(existing ? "Lead updated." : "Lead added.");
  return lead;
}

function archiveLead(leadId) {
  const id = Number(leadId);
  const lead = leads.find((entry) => entry.id === id);
  if (!lead) return;
  const confirmed = window.confirm(`Archive ${lead.name || "this lead"}? You can still find it later by filtering for Archived.`);
  if (!confirmed) return;
  lead.status = "archived";
  lead.lostAt = lead.lostAt || dateKey();
  addActivity(lead, "Lead archived.");
  saveAndSync({ silent: false });
  document.querySelector("#leadDialog")?.close();
  renderAll();
  showToast("Lead archived.");
}

function claimLead(leadId, memberId) {
  const lead = leads.find((entry) => entry.id === Number(leadId));
  const member = team.find((entry) => entry.id === Number(memberId));
  if (!lead || !member) return;
  if (lead.status !== "new" && !settings.allowReclaim) {
    showToast("This lead has already been claimed.");
    return;
  }
  lead.status = "claimed";
  lead.assignedTo = member.name;
  member.claims = (member.claims || 0) + 1;
  addActivity(lead, `${member.name} claimed the lead.`);
  saveAndSync();
  renderAll();
  showToast(`${member.name} claimed ${lead.name}.`);
}

function updateLeadStatus(leadId, status) {
  const lead = leads.find((entry) => entry.id === Number(leadId));
  if (!lead) return;
  lead.status = status;
  const today = dateKey();
  if (status === "noContact" && !lead.firstAttemptedAt) lead.firstAttemptedAt = today;
  if (status === "contacted" && !lead.firstContactedAt) lead.firstContactedAt = today;
  if (status === "appointment" && !lead.appointmentSetAt) lead.appointmentSetAt = today;
  addActivity(lead, `Status changed to ${statusLabel(status)}.`);
  saveAndSync();
  renderAll();
  showToast("Lead status updated.");
}

function logContactAttempt(leadId, attemptType = "Contact") {
  const lead = leads.find((entry) => entry.id === Number(leadId));
  if (!lead) return;
  const today = dateKey();
  const label = attemptType || "Contact";
  lead.contactAttempts = Number(lead.contactAttempts || 0) + 1;
  lead.firstAttemptedAt = lead.firstAttemptedAt || today;
  if (["new", "claimed"].includes(lead.status)) lead.status = "attempted";
  addActivity(lead, `${label} attempt #${lead.contactAttempts} logged.`);
  saveAndSync();
  renderAll();
  showToast(`${label} attempt #${lead.contactAttempts} logged for ${lead.name}.`);
}

function updateResponseMilestone(leadId, response) {
  const lead = leads.find((entry) => entry.id === Number(leadId));
  if (!lead) return;
  const today = dateKey();
  if (response === "attempted") {
    logContactAttempt(leadId);
    return;
  }
  const updates = {
    attempted: ["firstAttemptedAt", "attempted", "First contact attempt logged."],
    noContact: ["firstAttemptedAt", "noContact", "No contact made."],
    contacted: ["firstContactedAt", "contacted", "First contact made."],
    appointment: ["appointmentSetAt", "appointment", "Appointment set."],
    consultation: ["consultationCompletedAt", "consultation", "Consultation completed."],
    converted: ["convertedAt", "converted", "Lead converted to client."],
    doNotContact: ["lostAt", "doNotContact", "Lead archived as do not contact."],
    lost: ["lostAt", "lost", "Lead marked lost."],
  };
  const update = updates[response];
  if (!update) return;
  lead[update[0]] = lead[update[0]] || today;
  lead.status = update[1];
  addActivity(lead, update[2]);
  saveAndSync();
  renderAll();
  showToast(update[2]);
}

function fillTeamForm(member = {}) {
  window.clearTimeout(teamFormAutoSaveTimer);
  const form = document.querySelector("#teamForm");
  form.elements.teamId.value = member.id || "";
  form.elements.name.value = member.name || "";
  form.elements.phone.value = member.phone || "";
  form.elements.email.value = member.email || "";
  form.elements.accessRole.value = member.accessRole || "Team member";
  form.elements.status.innerHTML = teamStatusOptions(teamMemberStatus(member));
  form.elements.inviteStatus.value = member.inviteStatus || "Not invited";
}

function openTeamDialog(member) {
  window.clearTimeout(teamFormAutoSaveTimer);
  fillTeamForm(member);
  document.querySelector("#teamDialog h2").textContent = member ? "Edit Team Member" : "Add Team Member";
  document.querySelector("#teamDialog").showModal();
}

function saveTeamMember(form, options = {}) {
  const data = new FormData(form);
  const existingId = Number(data.get("teamId"));
  const existing = team.find((member) => member.id === existingId);
  const oldName = existing?.name;
  const hasDraftContent = ["name", "phone", "email"].some((key) => String(data.get(key) || "").trim());
  if (!existing && !hasDraftContent) return null;
  const member = {
    id: existing?.id || Date.now(),
    name: String(data.get("name") || "").trim() || "New team member",
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    accessRole: String(data.get("accessRole") || "Team member"),
    status: String(data.get("status") || "Available"),
    inviteStatus: String(data.get("inviteStatus") || "Not invited"),
    claims: existing?.claims || 0,
  };
  if (existing) Object.assign(existing, member);
  else {
    team.push(member);
    form.elements.teamId.value = member.id;
  }
  if (oldName && oldName !== member.name) {
    leads.forEach((lead) => {
      if (lead.assignedTo === oldName) lead.assignedTo = member.name;
    });
  }
  saveAndSync({ silent: options.silent !== false });
  if (options.close) {
    form.reset();
    document.querySelector("#teamDialog").close();
  }
  renderAll();
  if (options.toast) showToast(existing ? "Team member updated." : "Team member added.");
  if (options.promptInvite && !existing && member.email) {
    const wantsInvite = window.confirm(`Prepare an invite email for ${member.name} now?`);
    if (wantsInvite) sendTeamInvite(member.id);
  }
  return member;
}

function scheduleLeadFormAutoSave() {
  window.clearTimeout(leadFormAutoSaveTimer);
  leadFormAutoSaveTimer = window.setTimeout(() => {
    saveLead(document.querySelector("#leadForm"), { activity: false, silent: true });
  }, 650);
}

function scheduleTeamFormAutoSave() {
  window.clearTimeout(teamFormAutoSaveTimer);
  teamFormAutoSaveTimer = window.setTimeout(() => {
    saveTeamMember(document.querySelector("#teamForm"), { silent: true });
  }, 650);
}

function addLeadNote() {
  const text = document.querySelector("#leadNoteText").value.trim();
  if (!text) {
    showToast("Type a note first.");
    return;
  }
  window.clearTimeout(leadFormAutoSaveTimer);
  const form = document.querySelector("#leadForm");
  const savedLead = saveLead(form, { activity: false, silent: true });
  if (!savedLead) {
    showToast("Add a lead name or source before adding a note.");
    return;
  }
  savedLead.notes = Array.isArray(savedLead.notes) ? savedLead.notes : [];
  savedLead.notes.unshift({ at: new Date().toISOString(), text });
  addActivity(savedLead, "Lead note added.");
  document.querySelector("#leadNoteText").value = "";
  renderLeadNotes(savedLead);
  saveAndSync({ immediate: true });
  renderAll();
  showToast("Note added.");
}

function leadRouterAppUrl() {
  if (location.protocol === "file:") return LEAD_RELAY_APP_URL;
  return location.origin + location.pathname;
}

function teamInviteBody(member) {
  const accessLine = fullAccessFor(member)
    ? "You will have full-access assistant/admin access, which means you can see the full team lead workspace."
    : "You will have team-member access, which means you can see unclaimed leads and the leads you claim.";
  return `Hi ${member.name},\n\nI am inviting you to Lead Relay, our first-to-claim lead app.\n\n${accessLine}\n\nPlease set it up this way:\n\n1. Open this link on your phone:\n${leadRouterAppUrl()}\n\n2. Create an account using this exact email address:\n${member.email}\n\n3. Sign in, then choose yourself under Working as if it is not already selected.\n\n4. Add Lead Relay to your phone home screen:\n- iPhone: open the link in Safari, tap Share, then Add to Home Screen.\n- Android: open the link in Chrome, tap the menu, then Add to Home screen or Install app.\n\n5. Open Lead Relay from the Home Screen and tap Enable push alerts. If your phone asks whether to allow notifications, choose Allow.\n\nOnce a lead comes in, open the notification and claim it if you are the first available person to respond.\n\nThanks!`;
}

function sendTeamInvite(memberId) {
  const member = team.find((entry) => entry.id === Number(memberId));
  if (!member) return;
  if (!member.email) {
    showToast("Add an email before preparing an invite.");
    return;
  }
  member.inviteStatus = "Invited";
  saveAndSync({ immediate: true });
  renderAll();
  const subject = encodeURIComponent("Lead Relay app invitation");
  const body = encodeURIComponent(teamInviteBody(member));
  window.location.href = `mailto:${encodeURIComponent(member.email)}?subject=${subject}&body=${body}`;
  showToast(`Invite email prepared for ${member.name}.`);
}

function toggleTeamMember(id) {
  const member = team.find((entry) => entry.id === Number(id));
  if (!member) return;
  member.status = ROUTING_STATUSES.includes(teamMemberStatus(member)) ? "Paused" : "Available";
  saveAndSync();
  renderAll();
}

function isGreetingLine(line) {
  return /^(hi|hello|dear|good morning|good afternoon|good evening)\b/i.test(line.trim());
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

function parseLeadEmail(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || "";
  const source = /zillow/i.test(text) ? "Zillow" : /realtor\.com/i.test(text) ? "Realtor.com" : /homes\.com/i.test(text) ? "Homes.com" : /reminder media/i.test(text) ? "Reminder Media" : /homesale/i.test(text) ? "HomeSale.com" : "Website";
  const propertyLine = lines.find((line) => /(property|address|home|listing|interested in):/i.test(line)) || lines.find((line) => /\d+ .*(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|pike|blvd|boulevard)/i.test(line)) || "";
  const messageLine = lines.find((line) => /^(message|comments|note|inquiry):/i.test(line));
  return {
    source,
    type: /sell|seller|valuation|home value/i.test(text) ? "Seller" : "Buyer",
    name: extractLeadName(lines),
    phone,
    email,
    property: propertyLine.replace(/^(property|address|home|listing|interested in):/i, "").trim(),
    price: text.match(/\$[\d,]+(?:\s*-\s*\$?[\d,]+)?/)?.[0] || "",
    urgency: /tour|showing|today|asap|pre-approved|preapproved/i.test(text) ? "Hot" : "Warm",
    message: text,
    summary: (messageLine ? messageLine.replace(/^(message|comments|note|inquiry):/i, "").trim() : text).slice(0, 800),
    raw: text,
  };
}

function renderParsedLeadPreview(lead) {
  const preview = document.querySelector("#parsedLeadPreview");
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <div class="section-title">
      <h3>Review before sending</h3>
      <span>${escapeHtml(lead.source)} · ${escapeHtml(lead.urgency)}</span>
    </div>
    <div class="preview-grid">
      <label><span>Name</span><input name="name" value="${escapeAttr(lead.name || "New Lead")}" /></label>
      <label><span>Type</span>
        <select name="type">
          <option ${lead.type === "Buyer" ? "selected" : ""}>Buyer</option>
          <option ${lead.type === "Seller" ? "selected" : ""}>Seller</option>
          <option ${lead.type === "Investor" ? "selected" : ""}>Investor</option>
          <option ${lead.type === "Rental" ? "selected" : ""}>Rental</option>
        </select>
      </label>
      <label><span>Phone</span><input name="phone" value="${escapeAttr(lead.phone || "")}" /></label>
      <label><span>Email</span><input name="email" type="email" value="${escapeAttr(lead.email || "")}" /></label>
      <label><span>Property / area</span><input name="property" value="${escapeAttr(lead.property || "")}" /></label>
      <label><span>Price</span><input name="price" value="${escapeAttr(lead.price || "")}" /></label>
      <label><span>Source</span><input name="source" value="${escapeAttr(lead.source || "Website")}" /></label>
      <label><span>Urgency</span>
        <select name="urgency">
          <option ${lead.urgency === "Hot" ? "selected" : ""}>Hot</option>
          <option ${lead.urgency === "Warm" ? "selected" : ""}>Warm</option>
          <option ${lead.urgency === "Cold" ? "selected" : ""}>Cold</option>
        </select>
      </label>
    </div>
    <label class="preview-notes-field">
      <span>Notes / message</span>
      <textarea name="message">${escapeHtml(lead.summary || lead.message || "")}</textarea>
    </label>
    <details>
      <summary>Full original email / notes</summary>
      <pre>${escapeHtml(lead.raw || lead.message || "")}</pre>
    </details>
  `;
}

function applyParsedLeadPreviewEdits() {
  if (!parsedLeadDraft) return;
  const preview = document.querySelector("#parsedLeadPreview");
  parsedLeadDraft = {
    ...parsedLeadDraft,
    name: preview.querySelector('[name="name"]')?.value.trim() || "New Lead",
    type: preview.querySelector('[name="type"]')?.value || "Buyer",
    phone: preview.querySelector('[name="phone"]')?.value.trim() || "",
    email: preview.querySelector('[name="email"]')?.value.trim() || "",
    property: preview.querySelector('[name="property"]')?.value.trim() || "",
    price: preview.querySelector('[name="price"]')?.value.trim() || "",
    source: preview.querySelector('[name="source"]')?.value.trim() || "Website",
    urgency: preview.querySelector('[name="urgency"]')?.value || "Warm",
    message: preview.querySelector('[name="message"]')?.value.trim() || parsedLeadDraft.message || "",
  };
}

function createLeadFromEmail() {
  const text = document.querySelector("#leadEmailText").value.trim();
  if (!text) {
    showToast("Paste the lead email first.");
    return;
  }
  parsedLeadDraft = parseLeadEmail(text);
  renderParsedLeadPreview(parsedLeadDraft);
  document.querySelector("#createParsedLeadButton").classList.remove("hidden");
  showToast("Lead preview ready. Review before sending.");
}

async function createParsedLeadAndNotify() {
  if (!parsedLeadDraft) {
    showToast("Preview a lead first.");
    return;
  }
  applyParsedLeadPreviewEdits();
  try {
    const result = await authenticatedAppApiRequest("/api/manual-lead", {
      method: "POST",
      body: JSON.stringify(parsedLeadDraft),
    });
    await refreshFromCloud({ silent: true });
    document.querySelector("#leadEmailText").value = "";
    document.querySelector("#parsedLeadPreview").classList.add("hidden");
    document.querySelector("#createParsedLeadButton").classList.add("hidden");
    parsedLeadDraft = null;
    switchView("dashboard");
    const pushed = (result.notifications || []).filter((entry) => entry.push).length;
    showToast(`Lead created. Push sent to ${pushed} team member(s).`);
  } catch (error) {
    showToast(`Create failed: ${error.message}`);
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ leads, team, settings }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "lead-router-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const data = JSON.parse(reader.result);
      leads = Array.isArray(data.leads) ? data.leads : leads;
      team = Array.isArray(data.team) ? data.team : team;
      settings = data.settings || settings;
      saveAndSync({ silent: false });
      renderAll();
      showToast("Lead Relay data imported.");
    } catch {
      showToast("That import file could not be read.");
    }
  });
  reader.readAsText(file);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizedHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function rowValue(row, headerMap, names) {
  const keys = names.map(normalizedHeader);
  const match = keys.find((key) => headerMap[key] !== undefined);
  return match ? String(row[headerMap[match]] || "").trim() : "";
}

function matchTeamMember(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const member = team.find((entry) => (
    entry.name.toLowerCase() === normalized ||
    String(entry.email || "").toLowerCase() === normalized ||
    String(entry.phone || "").replace(/\D/g, "") === normalized.replace(/\D/g, "")
  ));
  return member?.name || value;
}

function normalizeLeadStatus(value) {
  const normalized = String(value || "").toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  if (normalized.includes("do not contact") || compact.includes("donotcontact") || normalized.includes("dnc")) return "doNotContact";
  if (normalized.includes("archive")) return "archived";
  if (normalized.includes("no contact") || compact.includes("nocontact")) return "noContact";
  if (normalized.includes("converted") || normalized.includes("client")) return "converted";
  if (normalized.includes("consult")) return "consultation";
  if (normalized.includes("appointment")) return "appointment";
  if (normalized.includes("contact")) return "contacted";
  if (normalized.includes("attempt")) return "attempted";
  if (normalized.includes("nurture") || normalized.includes("cold")) return "nurture";
  if (normalized.includes("lost") || normalized.includes("dead")) return "lost";
  if (normalized.includes("closed")) return "closed";
  if (normalized.includes("claim") || normalized.includes("assign")) return "claimed";
  return "new";
}

function normalizeUrgency(value, status = "") {
  const normalized = String(value || status || "").toLowerCase();
  if (normalized.includes("hot") || normalized.includes("urgent") || normalized.includes("new")) return "Hot";
  if (normalized.includes("cold") || normalized.includes("nurture")) return "Nurture";
  return "Warm";
}

function normalizeCsvDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function leadFromCsvRow(row, headerMap) {
  const first = rowValue(row, headerMap, ["first name", "firstname"]);
  const last = rowValue(row, headerMap, ["last name", "lastname"]);
  const fullName = rowValue(row, headerMap, ["name", "lead name", "contact name", "client"]);
  const status = rowValue(row, headerMap, ["status", "lead status", "stage"]);
  const owner = rowValue(row, headerMap, ["owner", "agent", "assigned to", "assigned agent", "user", "claimed by"]);
  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    source: rowValue(row, headerMap, ["source", "lead source", "provider"]) || "FiveStreet",
    type: rowValue(row, headerMap, ["type", "lead type", "buyer seller"]) || "Buyer",
    name: fullName || [first, last].filter(Boolean).join(" ") || "Imported Lead",
    phone: rowValue(row, headerMap, ["phone", "phone number", "mobile", "cell"]),
    email: rowValue(row, headerMap, ["email", "email address"]),
    property: rowValue(row, headerMap, ["property", "address", "listing", "area", "city"]),
    price: rowValue(row, headerMap, ["price", "price range", "listing price"]),
    urgency: normalizeUrgency(rowValue(row, headerMap, ["urgency", "priority", "temperature"]), status),
    status: normalizeLeadStatus(status),
    assignedTo: matchTeamMember(owner),
    nextFollowUpDate: normalizeCsvDate(rowValue(row, headerMap, ["next follow up", "next follow-up", "follow up date", "follow-up date", "next task date"])),
    firstAttemptedAt: normalizeCsvDate(rowValue(row, headerMap, ["first attempted", "contact attempted", "first contact attempted"])),
    firstContactedAt: normalizeCsvDate(rowValue(row, headerMap, ["first contacted", "contact made", "first contact made"])),
    appointmentSetAt: normalizeCsvDate(rowValue(row, headerMap, ["appointment set", "appointment date"])),
    consultationCompletedAt: normalizeCsvDate(rowValue(row, headerMap, ["consultation completed", "consult date", "buyer consult", "seller consult"])),
    convertedAt: normalizeCsvDate(rowValue(row, headerMap, ["converted", "converted date", "client date"])),
    lostAt: normalizeCsvDate(rowValue(row, headerMap, ["lost date", "closed lost"])),
    outcomeNotes: rowValue(row, headerMap, ["lost reason", "outcome", "outcome notes"]),
    message: rowValue(row, headerMap, ["message", "notes", "comments", "inquiry"]),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activity: [{ at: new Date().toISOString(), text: "Imported from FiveStreet CSV." }],
  };
}

function importFiveStreetCsv(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const rows = parseCsv(String(reader.result || ""));
    if (rows.length < 2) {
      showToast("No leads found in that CSV.");
      return;
    }
    const headers = rows[0].map(normalizedHeader);
    const headerMap = Object.fromEntries(headers.map((header, index) => [header, index]));
    const imported = rows.slice(1).map((row) => leadFromCsvRow(row, headerMap));
    leads = [...imported, ...leads];
    saveAndSync({ silent: false });
    renderAll();
    showToast(`${imported.length} FiveStreet leads imported.`);
  });
  reader.readAsText(file);
}

function csvEscape(value) {
  const text = String(value || "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadOwnerLeads(owner) {
  const ownerName = owner || workflowOwner || team[0]?.name || "";
  const rows = leads.filter((lead) => lead.assignedTo === ownerName);
  downloadCsv(`${ownerName || "unassigned"}-leads.csv`, [
    ["Name", "Phone", "Email", "Source", "Type", "Property", "Price", "Urgency", "Status", "Contact Attempts", "Next Follow-Up", "First Attempted", "First Contacted", "Appointment Set", "Consultation Completed", "Converted", "Lost", "Outcome Notes", "Message"],
    ...rows.map((lead) => [
      lead.name,
      lead.phone,
      lead.email,
      lead.source,
      lead.type,
      lead.property,
      lead.price,
      lead.urgency,
      statusLabel(lead.status),
      lead.contactAttempts || 0,
      lead.nextFollowUpDate,
      lead.firstAttemptedAt,
      lead.firstContactedAt,
      lead.appointmentSetAt,
      lead.consultationCompletedAt,
      lead.convertedAt,
      lead.lostAt,
      lead.outcomeNotes,
      lead.message,
    ]),
  ]);
}

function downloadWeeklyReport() {
  const rows = weeklyCheckInLeads();
  downloadCsv("weekly-lead-check-ins.csv", [
    ["Name", "Owner", "Phone", "Email", "Source", "Urgency", "Status", "Next Follow-Up", "Check-In Status", "Message"],
    ...rows.map((lead) => [
      lead.name,
      lead.assignedTo,
      lead.phone,
      lead.email,
      lead.source,
      lead.urgency,
      statusLabel(lead.status),
      lead.nextFollowUpDate,
      lead.checkInStatus,
      lead.message,
    ]),
  ]);
}

function downloadLeadPerformanceReport() {
  const scope = reportScope();
  downloadCsv(`lead-performance-${reportRange}.csv`, [
    ["Name", "Owner", "Source", "Status", "Created", "Contact Attempts", "Contact Outcome", "Phone", "Email", "Property", "Message"],
    ...scope.map((lead) => [
      lead.name,
      lead.assignedTo || "Unassigned",
      lead.source,
      statusLabel(lead.status),
      lead.createdAt ? dateOnlyLabel(lead.createdAt.slice(0, 10)) : "",
      lead.contactAttempts || 0,
      ["doNotContact", "archived"].includes(lead.status) ? "Archived" : madeContact(lead) ? "Made contact" : lead.status === "noContact" ? "No contact made" : "Not worked yet",
      lead.phone,
      lead.email,
      lead.property,
      lead.message,
    ]),
  ]);
}

function moveFollowUp(leadId, days) {
  const lead = leads.find((entry) => entry.id === Number(leadId));
  if (!lead) return;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + Number(days));
  lead.nextFollowUpDate = dateKey(nextDate);
  addActivity(lead, `Follow-up moved to ${dateOnlyLabel(lead.nextFollowUpDate)}.`);
  saveAndSync();
  renderAll();
}

function loadSampleEmail() {
  document.querySelector("#leadEmailText").value = `Zillow lead notification
Name: Jordan Smith
Phone: 717-555-0199
Email: jordan@example.com
Property: 88 Meadow Lane, Manheim, PA
Message: I am pre-approved and would like to tour this home today if possible.
Price: $425,000`;
}

async function processClaimLink() {
  const params = new URLSearchParams(window.location.search);
  const claimId = params.get("claim");
  const owner = params.get("owner");
  if (!claimId || !owner) return;
  try {
    await appApiRequest(`/api/claim-lead?claim=${encodeURIComponent(claimId)}&owner=${encodeURIComponent(owner)}`);
    myOwner = owner;
    localStorage.setItem(MY_OWNER_KEY, myOwner);
    await refreshFromCloud({ silent: true });
    switchView("myLeads");
    showToast(`Lead claimed for ${owner}.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);

  const editLead = event.target.closest("[data-edit-lead]");
  if (editLead) openLeadDialog(leads.find((lead) => lead.id === Number(editLead.dataset.editLead)));

  const openLead = event.target.closest("[data-open-lead]");
  if (openLead && !event.target.closest("button, a, input, select, textarea")) {
    openLeadDialog(leads.find((lead) => lead.id === Number(openLead.dataset.openLead)));
  }

  const attemptLead = event.target.closest("[data-attempt-lead]");
  if (attemptLead) logContactAttempt(attemptLead.dataset.attemptLead, attemptLead.dataset.attemptType);

  const archiveButton = event.target.closest("[data-archive-lead]");
  if (archiveButton) archiveLead(archiveButton.dataset.archiveLead);

  const claim = event.target.closest("[data-claim-lead]");
  if (claim) claimLead(claim.dataset.claimLead, claim.dataset.member);

  const status = event.target.closest("[data-status-lead]");
  if (status) updateLeadStatus(status.dataset.statusLead, status.dataset.status);

  const response = event.target.closest("[data-response-lead]");
  if (response) updateResponseMilestone(response.dataset.responseLead, response.dataset.response);

  const toggleTeam = event.target.closest("[data-toggle-team]");
  if (toggleTeam) toggleTeamMember(toggleTeam.dataset.toggleTeam);

  const editTeam = event.target.closest("[data-edit-team]");
  if (editTeam) openTeamDialog(team.find((member) => member.id === Number(editTeam.dataset.editTeam)));

  const inviteTeam = event.target.closest("[data-invite-team]");
  if (inviteTeam) sendTeamInvite(inviteTeam.dataset.inviteTeam);

  const ownerDownload = event.target.closest("[data-download-owner]");
  if (ownerDownload) downloadOwnerLeads(ownerDownload.dataset.downloadOwner);

  const followUpButton = event.target.closest("[data-followup-lead]");
  if (followUpButton) moveFollowUp(followUpButton.dataset.followupLead, followUpButton.dataset.days);

  const draftButton = event.target.closest("[data-draft-type]");
  if (draftButton) prepareEngagementDraft(draftButton.dataset.draftType);

  const closeDialogButton = event.target.closest("[data-close-dialog]");
  if (closeDialogButton) {
    const dialog = closeDialogButton.closest("dialog");
    if (dialog?.id === "leadDialog") {
      window.clearTimeout(leadFormAutoSaveTimer);
      saveLead(document.querySelector("#leadForm"), { activity: false, silent: true });
    }
    if (dialog?.id === "teamDialog") {
      window.clearTimeout(teamFormAutoSaveTimer);
      saveTeamMember(document.querySelector("#teamForm"), { silent: true });
    }
    dialog?.close();
  }
});

document.querySelector("#openLeadForm").addEventListener("click", () => openLeadDialog());
document.querySelector("#leadForm").addEventListener("submit", (event) => {
  event.preventDefault();
});
document.querySelector("#leadForm").addEventListener("input", scheduleLeadFormAutoSave);
document.querySelector("#leadForm").addEventListener("change", scheduleLeadFormAutoSave);
document.querySelector("#addLeadNoteButton").addEventListener("click", addLeadNote);
document.querySelector("#copyDraftButton").addEventListener("click", copyEngagementDraft);
document.querySelector("#openEmailDraftButton").addEventListener("click", openEmailDraft);

document.querySelector("#addTeamMember").addEventListener("click", () => openTeamDialog());
document.querySelector("#teamForm").addEventListener("submit", (event) => {
  event.preventDefault();
});
document.querySelector("#teamForm").addEventListener("input", scheduleTeamFormAutoSave);
document.querySelector("#teamForm").addEventListener("change", scheduleTeamFormAutoSave);

document.querySelector("#parseEmailButton").addEventListener("click", createLeadFromEmail);
document.querySelector("#createParsedLeadButton").addEventListener("click", createParsedLeadAndNotify);
document.querySelector("#loadSampleButton").addEventListener("click", loadSampleEmail);
document.querySelector("#leadSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value;
  renderInbox();
});
document.querySelector("#leadStatusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  renderInbox();
});
document.querySelector("#ownerFilter").addEventListener("change", (event) => {
  ownerFilter = event.target.value;
  renderInbox();
});
document.querySelector("#myOwnerSelect").addEventListener("change", (event) => {
  myOwner = event.target.value;
  localStorage.setItem(MY_OWNER_KEY, myOwner);
  renderAll();
});
document.querySelector("#accountRoleSelect").addEventListener("change", (event) => {
  accountRole = event.target.value;
  localStorage.setItem(ACCOUNT_ROLE_KEY, accountRole);
  renderAll();
});
document.querySelector("#workflowOwnerSelect").addEventListener("change", (event) => {
  workflowOwner = event.target.value;
  renderWorkflow();
});
document.querySelector("#reportRangeSelect").addEventListener("change", (event) => {
  reportRange = event.target.value;
  renderReports();
});
document.querySelector("#downloadMyLeads").addEventListener("click", () => downloadOwnerLeads(myOwner));
document.querySelector("#downloadReportButton").addEventListener("click", downloadLeadPerformanceReport);
document.querySelector("#downloadWorkflowOwner").addEventListener("click", () => downloadOwnerLeads(workflowOwner));
document.querySelector("#downloadOwnerButton").addEventListener("click", () => downloadOwnerLeads(document.querySelector("#downloadOwnerSelect").value));
document.querySelector("#exportButton").addEventListener("click", exportData);
document.querySelector("#importInput").addEventListener("change", (event) => {
  if (event.target.files[0]) importData(event.target.files[0]);
});
document.querySelector("#csvImportInput").addEventListener("change", (event) => {
  if (event.target.files[0]) importFiveStreetCsv(event.target.files[0]);
});
document.querySelector("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  if (!email || !password) {
    showToast("Enter an email and password.");
    return;
  }
  try {
    await signIn(email, password);
  } catch (error) {
    showToast(`Sign in failed: ${error.message}`);
  }
});
document.querySelector("#createAccountButton").addEventListener("click", async () => {
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  if (!email || !password) {
    showToast("Enter an email and password first.");
    return;
  }
  try {
    await createAccount(email, password);
  } catch (error) {
    showToast(`Account could not be created: ${error.message}`);
  }
});
document.querySelector("#refreshCloudButton").addEventListener("click", () => refreshFromCloud());
document.querySelector("#enablePushButton").addEventListener("click", enablePushAlerts);
document.querySelector("#testPushButton").addEventListener("click", sendTestPush);
document.querySelector("#signOutButton").addEventListener("click", () => {
  saveCloudSession(null);
  showToast("Signed out. This browser is back in local mode.");
});
document.querySelector("#notificationTemplate").addEventListener("change", (event) => {
  settings.notificationTemplate = event.target.value;
  saveAndSync();
});
document.querySelector("#allowReclaim").addEventListener("change", (event) => {
  settings.allowReclaim = event.target.checked;
  saveAndSync();
});
document.querySelector("#notifyAll").addEventListener("change", (event) => {
  settings.notifyAll = event.target.checked;
  saveAndSync();
});

renderAll();
if (cloudSession?.access_token) refreshFromCloud({ silent: true });
processClaimLink();
