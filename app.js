const LEADS_KEY = "lead-router-leads-v1";
const TEAM_KEY = "lead-router-team-v1";
const SETTINGS_KEY = "lead-router-settings-v1";

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
  { id: 1, name: "Lisa", phone: "717-555-0101", email: "lisa@example.com", active: true, claims: 1 },
  { id: 2, name: "Assistant", phone: "717-555-0102", email: "assistant@example.com", active: true, claims: 0 },
  { id: 3, name: "Buyer Agent", phone: "717-555-0103", email: "buyeragent@example.com", active: true, claims: 0 },
];

const defaultSettings = {
  notificationTemplate: "New {source} lead: {name}, {type}, {property}. Reply CLAIM {id} to take it.",
  allowReclaim: true,
  notifyAll: true,
};

let leads = loadJson(LEADS_KEY, sampleLeads);
let team = loadJson(TEAM_KEY, sampleTeam);
let settings = loadJson(SETTINGS_KEY, defaultSettings);
let activeView = "dashboard";
let searchTerm = "";
let statusFilter = "all";

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

function saveAll() {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
  localStorage.setItem(TEAM_KEY, JSON.stringify(team));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateTimeLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function leadAge(value) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusLabel(status) {
  const labels = {
    new: "Unclaimed",
    claimed: "Claimed",
    contacted: "Contacted",
    appointment: "Appointment set",
    nurture: "Nurture",
    closed: "Closed out",
  };
  return labels[status] || status;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function activeTeam() {
  return team.filter((member) => member.active);
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
  addActivity(lead, `Simulated text sent to ${names}: ${message}`);
}

function addActivity(lead, text) {
  lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
  lead.activity.unshift({ at: new Date().toISOString(), text });
  lead.updatedAt = new Date().toISOString();
}

function leadCard(lead, compact = false) {
  const assigned = lead.assignedTo ? `Assigned to ${escapeHtml(lead.assignedTo)}` : "Available to claim";
  return `
    <article class="lead-card ${lead.urgency.toLowerCase()} ${lead.status === "new" ? "" : "claimed"}" data-open-lead="${lead.id}">
      <div class="lead-main">
        <div>
          <strong>${escapeHtml(lead.name)}</strong>
          <span>${escapeHtml(lead.property || "No property yet")}</span>
        </div>
        <span class="status-pill">${statusLabel(lead.status)}</span>
      </div>
      <div class="lead-meta">
        <span>${escapeHtml(lead.source)}</span>
        <span>${escapeHtml(lead.type)}</span>
        <span>${escapeHtml(lead.urgency)}</span>
        <span>${leadAge(lead.createdAt)}</span>
        <span>${assigned}</span>
      </div>
      ${compact ? "" : `<p>${escapeHtml(lead.message || "No message yet.")}</p>`}
      <div class="lead-actions">
        ${lead.status === "new" ? claimButtons(lead) : ""}
        <button class="ghost-button" type="button" data-edit-lead="${lead.id}">Edit</button>
        <button class="ghost-button" type="button" data-status-lead="${lead.id}" data-status="contacted">Contacted</button>
        <button class="ghost-button" type="button" data-status-lead="${lead.id}" data-status="appointment">Appointment</button>
        <button class="ghost-button" type="button" data-status-lead="${lead.id}" data-status="nurture">Nurture</button>
      </div>
    </article>
  `;
}

function claimButtons(lead) {
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
  const unclaimed = leads.filter((lead) => lead.status === "new").length;
  const claimed = leads.filter((lead) => lead.status !== "new" && lead.status !== "closed").length;
  const appointments = leads.filter((lead) => lead.status === "appointment").length;
  const hot = leads.filter((lead) => lead.urgency === "Hot" && lead.status !== "closed").length;
  document.querySelector("#metricsGrid").innerHTML = [
    metricCard("Unclaimed", unclaimed, "Needs response"),
    metricCard("Claimed active", claimed, "Being worked"),
    metricCard("Appointments", appointments, "Set from leads"),
    metricCard("Hot leads", hot, "High priority"),
  ].join("");
}

function renderDashboard() {
  const unclaimed = leads.filter((lead) => lead.status === "new").sort(sortNewest);
  const claimed = leads.filter((lead) => lead.status !== "new" && lead.status !== "closed").sort(sortNewest);
  document.querySelector("#unclaimedCount").textContent = unclaimed.length;
  document.querySelector("#claimedCount").textContent = claimed.length;
  document.querySelector("#unclaimedLeads").innerHTML = unclaimed.length ? unclaimed.map((lead) => leadCard(lead)).join("") : emptyState("No unclaimed leads.");
  document.querySelector("#claimedLeads").innerHTML = claimed.length ? claimed.map((lead) => leadCard(lead, true)).join("") : emptyState("No claimed leads yet.");
  renderActivityLog();
}

function renderActivityLog() {
  const rows = leads
    .flatMap((lead) => (lead.activity || []).map((activity) => ({ ...activity, lead })))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 12);
  document.querySelector("#activityLog").innerHTML = rows.length ? rows.map((row) => `
    <div class="activity-row">
      <strong>${escapeHtml(row.lead.name)}</strong>
      <span>${dateTimeLabel(row.at)}</span>
      <p>${escapeHtml(row.text)}</p>
    </div>
  `).join("") : emptyState("No activity yet.");
}

function sortNewest(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function filteredLeads() {
  const term = searchTerm.trim().toLowerCase();
  return leads.filter((lead) => {
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const haystack = [lead.name, lead.source, lead.type, lead.phone, lead.email, lead.property, lead.price, lead.message, lead.assignedTo]
      .join(" ")
      .toLowerCase();
    return matchesStatus && haystack.includes(term);
  }).sort(sortNewest);
}

function renderInbox() {
  const rows = filteredLeads();
  document.querySelector("#leadTable").innerHTML = rows.length ? rows.map((lead) => `
    <div class="table-row">
      <strong>${escapeHtml(lead.name)}</strong>
      <span>${escapeHtml(lead.source)} · ${escapeHtml(lead.type)}</span>
      <span>${escapeHtml(lead.property || "No property")}</span>
      <span>${statusLabel(lead.status)}</span>
      <button class="ghost-button" type="button" data-edit-lead="${lead.id}">Open</button>
    </div>
  `).join("") : emptyState("No leads match this view.");
}

function renderTeam() {
  document.querySelector("#teamGrid").innerHTML = team.map((member) => `
    <article class="team-card ${member.active ? "" : "paused"}">
      <strong>${escapeHtml(member.name)}</strong>
      <span>${escapeHtml(member.phone || "No phone")}</span>
      <span>${escapeHtml(member.email || "No email")}</span>
      <span>${member.active ? "Active for routing" : "Paused"}</span>
      <button class="ghost-button" type="button" data-toggle-team="${member.id}">${member.active ? "Pause" : "Activate"}</button>
    </article>
  `).join("");
}

function renderSettings() {
  document.querySelector("#notificationTemplate").value = settings.notificationTemplate;
  document.querySelector("#allowReclaim").checked = settings.allowReclaim;
  document.querySelector("#notifyAll").checked = settings.notifyAll;
}

function emptyState(text) {
  return `<div class="empty-state">${text}</div>`;
}

function renderAll() {
  renderMetrics();
  renderDashboard();
  renderInbox();
  renderTeam();
  renderSettings();
}

function switchView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}View`));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function fillLeadForm(lead = {}) {
  const form = document.querySelector("#leadForm");
  form.elements.leadId.value = lead.id || "";
  form.elements.source.value = lead.source || "";
  form.elements.type.value = lead.type || "Buyer";
  form.elements.name.value = lead.name || "";
  form.elements.phone.value = lead.phone || "";
  form.elements.email.value = lead.email || "";
  form.elements.property.value = lead.property || "";
  form.elements.price.value = lead.price || "";
  form.elements.urgency.value = lead.urgency || "Warm";
  form.elements.message.value = lead.message || "";
}

function openLeadDialog(lead) {
  fillLeadForm(lead);
  document.querySelector("#leadDialogTitle").textContent = lead ? "Edit Lead" : "Add Lead";
  document.querySelector("#leadDialog").showModal();
}

function saveLead(form) {
  const data = new FormData(form);
  const existingId = Number(data.get("leadId"));
  const existing = leads.find((lead) => lead.id === existingId);
  const lead = {
    id: existing?.id || Date.now(),
    source: String(data.get("source") || "").trim(),
    type: String(data.get("type") || "Buyer"),
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    property: String(data.get("property") || "").trim(),
    price: String(data.get("price") || "").trim(),
    urgency: String(data.get("urgency") || "Warm"),
    status: existing?.status || "new",
    assignedTo: existing?.assignedTo || "",
    message: String(data.get("message") || "").trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activity: existing?.activity || [],
  };
  if (existing) {
    Object.assign(existing, lead);
    addActivity(existing, "Lead details updated.");
  } else {
    lead.activity = [{ at: new Date().toISOString(), text: `Lead received from ${lead.source}.` }];
    leads.unshift(lead);
    broadcastLead(lead);
  }
  saveAll();
  form.reset();
  document.querySelector("#leadDialog").close();
  renderAll();
  showToast(existing ? "Lead updated." : "Lead added and simulated notification sent.");
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
  saveAll();
  renderAll();
  showToast(`${member.name} claimed ${lead.name}.`);
}

function updateLeadStatus(leadId, status) {
  const lead = leads.find((entry) => entry.id === Number(leadId));
  if (!lead) return;
  lead.status = status;
  addActivity(lead, `Status changed to ${statusLabel(status)}.`);
  saveAll();
  renderAll();
  showToast("Lead status updated.");
}

function saveTeamMember(form) {
  const data = new FormData(form);
  team.push({
    id: Date.now(),
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    active: data.get("active") === "true",
    claims: 0,
  });
  saveAll();
  form.reset();
  document.querySelector("#teamDialog").close();
  renderAll();
  showToast("Team member added.");
}

function toggleTeamMember(id) {
  const member = team.find((entry) => entry.id === Number(id));
  if (!member) return;
  member.active = !member.active;
  saveAll();
  renderAll();
}

function parseLeadEmail(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || "";
  const source = /zillow/i.test(text) ? "Zillow" : /realtor\.com/i.test(text) ? "Realtor.com" : /homes\.com/i.test(text) ? "Homes.com" : "Website";
  const nameLine = lines.find((line) => /name:/i.test(line)) || lines.find((line) => /from:/i.test(line)) || lines[0] || "New Lead";
  const propertyLine = lines.find((line) => /(property|address|home|listing):/i.test(line)) || lines.find((line) => /\d+ .*(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court)/i.test(line)) || "";
  return {
    source,
    type: /sell|seller|valuation|home value/i.test(text) ? "Seller" : "Buyer",
    name: nameLine.replace(/^(name|from):/i, "").trim() || "New Lead",
    phone,
    email,
    property: propertyLine.replace(/^(property|address|home|listing):/i, "").trim(),
    price: text.match(/\$[\d,]+(?:\s*-\s*\$?[\d,]+)?/)?.[0] || "",
    urgency: /tour|showing|today|asap|pre-approved|preapproved/i.test(text) ? "Hot" : "Warm",
    message: text.slice(0, 600),
  };
}

function createLeadFromEmail() {
  const text = document.querySelector("#leadEmailText").value.trim();
  if (!text) {
    showToast("Paste the lead email first.");
    return;
  }
  const parsed = parseLeadEmail(text);
  openLeadDialog(parsed);
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
      saveAll();
      renderAll();
      showToast("Lead router data imported.");
    } catch {
      showToast("That import file could not be read.");
    }
  });
  reader.readAsText(file);
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

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);

  const editLead = event.target.closest("[data-edit-lead]");
  if (editLead) openLeadDialog(leads.find((lead) => lead.id === Number(editLead.dataset.editLead)));

  const claim = event.target.closest("[data-claim-lead]");
  if (claim) claimLead(claim.dataset.claimLead, claim.dataset.member);

  const status = event.target.closest("[data-status-lead]");
  if (status) updateLeadStatus(status.dataset.statusLead, status.dataset.status);

  const toggleTeam = event.target.closest("[data-toggle-team]");
  if (toggleTeam) toggleTeamMember(toggleTeam.dataset.toggleTeam);

  if (event.target.closest("[data-close-dialog]")) event.target.closest("dialog").close();
});

document.querySelector("#openLeadForm").addEventListener("click", () => openLeadDialog());
document.querySelector("#leadForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveLead(event.currentTarget);
});

document.querySelector("#addTeamMember").addEventListener("click", () => document.querySelector("#teamDialog").showModal());
document.querySelector("#teamForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveTeamMember(event.currentTarget);
});

document.querySelector("#parseEmailButton").addEventListener("click", createLeadFromEmail);
document.querySelector("#loadSampleButton").addEventListener("click", loadSampleEmail);
document.querySelector("#leadSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value;
  renderInbox();
});
document.querySelector("#leadStatusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  renderInbox();
});
document.querySelector("#exportButton").addEventListener("click", exportData);
document.querySelector("#importInput").addEventListener("change", (event) => {
  if (event.target.files[0]) importData(event.target.files[0]);
});
document.querySelector("#notificationTemplate").addEventListener("change", (event) => {
  settings.notificationTemplate = event.target.value;
  saveAll();
});
document.querySelector("#allowReclaim").addEventListener("change", (event) => {
  settings.allowReclaim = event.target.checked;
  saveAll();
});
document.querySelector("#notifyAll").addEventListener("change", (event) => {
  settings.notifyAll = event.target.checked;
  saveAll();
});

renderAll();
