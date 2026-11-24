const crypto = require("crypto");
const {
  getWorkspace,
  handleOptions,
  optionalEnv,
  saveWorkspace,
} = require("./_lead-router-lib");

const BLOCKED_STATUSES = new Set(["doNotContact", "archived", "lost", "closed", "converted"]);
const MAX_EMAILS_PER_RUN = 25;

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function firstName(value) {
  return String(value || "there").trim().split(/\s+/)[0] || "there";
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function signingSecret() {
  return optionalEnv("FUNNEL_SIGNING_SECRET") || optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function unsubscribeToken(leadId) {
  return crypto.createHmac("sha256", signingSecret()).update(String(leadId)).digest("hex");
}

function appUrl() {
  return (optionalEnv("LEAD_ROUTER_APP_URL") || "https://lead-router-29yb.vercel.app").replace(/\/$/, "");
}

function unsubscribeUrl(lead) {
  return `${appUrl()}/api/run-funnels?action=unsubscribe&lead=${encodeURIComponent(lead.id)}&token=${unsubscribeToken(lead.id)}`;
}

function unsubscribePage(response, status, title, message) {
  response.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<main style="max-width:620px;margin:70px auto;padding:30px;font-family:Arial,sans-serif;color:#183b4a;"><h1>${title}</h1><p style="font-size:18px;line-height:1.6;">${message}</p></main>`);
}

async function handleUnsubscribe(request, response) {
  const leadId = String(request.query?.lead || "");
  const token = String(request.query?.token || "");
  const expected = unsubscribeToken(leadId);
  if (!leadId || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return unsubscribePage(response, 400, "This link could not be verified", "Please contact the agent who emailed you if you would like to stop receiving messages.");
  }
  const workspace = await getWorkspace();
  const lead = (workspace.leads || []).find((entry) => String(entry.id) === leadId);
  if (!lead) return unsubscribePage(response, 404, "Lead not found", "No email preferences were changed.");
  lead.emailOptOut = true;
  lead.funnelPaused = true;
  lead.nextAutomatedEmailAt = "";
  lead.updatedAt = new Date().toISOString();
  lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
  lead.activity.unshift({ at: lead.updatedAt, text: "Lead unsubscribed from automated email follow-up." });
  await saveWorkspace(workspace);
  return unsubscribePage(response, 200, "You have been unsubscribed", "You will not receive any more automated Lead Relay follow-up emails.");
}

function senderAddress(agent) {
  const configured = optionalEnv("EMAIL_FROM");
  const address = configured.match(/<([^>]+)>/)?.[1] || configured;
  return `${agent.name || "Lead Relay"} <${address}>`;
}

function safePhotoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function signatureHtml(agent) {
  const photo = safePhotoUrl(agent.photoUrl);
  return `
    <table role="presentation" style="margin-top:26px;border-top:1px solid #dfe7e9;padding-top:18px;"><tr>
      ${photo ? `<td style="padding-right:14px;vertical-align:top;"><img src="${escapeHtml(photo)}" width="72" height="72" alt="${escapeHtml(agent.name)}" style="width:72px;height:72px;object-fit:cover;border-radius:50%;"></td>` : ""}
      <td style="font-family:Arial,sans-serif;color:#193b4a;line-height:1.45;vertical-align:top;">
        <strong style="font-size:17px;">${escapeHtml(agent.name)}</strong><br>
        ${agent.signatureTitle ? `${escapeHtml(agent.signatureTitle)}<br>` : ""}
        ${agent.signatureCompany ? `${escapeHtml(agent.signatureCompany)}<br>` : ""}
        ${agent.phone ? `Mobile: <a href="tel:${escapeHtml(agent.phone)}" style="color:#193b4a;">${escapeHtml(agent.phone)}</a><br>` : ""}
        ${agent.officePhone ? `Office: <a href="tel:${escapeHtml(agent.officePhone)}" style="color:#193b4a;">${escapeHtml(agent.officePhone)}</a><br>` : ""}
        ${agent.email ? `<a href="mailto:${escapeHtml(agent.email)}" style="color:#193b4a;">${escapeHtml(agent.email)}</a>` : ""}
      </td>
    </tr></table>`;
}

function messageFor(lead, agent) {
  const property = lead.property || "the property you asked about";
  const area = lead.property || "your preferred area";
  const name = firstName(lead.name);
  const sequences = {
    newNoResponse: [
      {
        subject: `Would you like to tour ${property}?`,
        body: `Thank you for asking about ${escapeHtml(property)}. I’d be happy to answer your questions or arrange a private tour.<br><br>Would you prefer to see the home during the week or this weekend?<br><br>You can reply directly to this email${agent.phone ? ` or call or text me at ${escapeHtml(agent.phone)}` : ""}.`,
      },
      {
        subject: `Following up about ${property}`,
        body: `I wanted to follow up in case you are still interested in ${escapeHtml(property)}.<br><br>I can help you check availability, get additional property information, or schedule a showing. If that particular home isn’t the right fit, I can also help you find similar properties.<br><br>Are you still interested in taking a closer look?`,
      },
      {
        subject: "Are you still looking for a home?",
        body: `I haven’t been able to reach you, so I wanted to check in one more time.<br><br>Are you still interested in ${escapeHtml(property)}, or has your home search changed? Either answer is perfectly fine. I just don’t want you to miss the opportunity to get the information or assistance you need.<br><br>If you’re still looking, simply reply and tell me what would be most helpful.`,
      },
      {
        subject: `Should I close the loop on ${property}?`,
        body: `I wanted to make one final check-in about ${escapeHtml(property)}.<br><br>If you would still like details, a private tour, or similar homes, I’m happy to help. If your plans have changed, no problem at all.<br><br>Just reply with what you would prefer, and I’ll follow your lead.`,
      },
    ],
    engaged: [
      {
        subject: "Next steps for your home search",
        body: `It was great connecting with you. Based on what you shared, I’d be happy to help you with the next step in your home search.<br><br>I can help with scheduling a tour of ${escapeHtml(property)}, finding similar homes, answering neighborhood questions, or connecting you with a trusted lender if needed.<br><br>What would be most helpful right now?`,
      },
      {
        subject: "A few homes you may want to consider",
        body: `I wanted to check in and see whether you are still considering ${escapeHtml(property)} or would like to explore some similar options.<br><br>If you tell me your preferred location, price range, and must-have features, I can narrow the search and help you focus on the strongest possibilities.<br><br>Would you like me to put together a short list for you?`,
      },
      {
        subject: "Would a quick home-search planning call help?",
        body: `I’d be glad to help you organize the next steps in your home search.<br><br>A short call can help us review your timing, financing, preferred areas, and the features that matter most so I can focus on the best options for you.<br><br>Would you like to choose a convenient time to talk?`,
      },
    ],
    longTermNurture: [
      {
        subject: "How is your home search going?",
        body: `I wanted to check in and see how your home search is going.<br><br>Even if you’re not ready to make a move immediately, I’m happy to keep an eye on the market and help you understand what is available in ${escapeHtml(area)}.<br><br>Has anything changed regarding your timing, preferred area, or price range?`,
      },
      {
        subject: "Would updated listings be helpful?",
        body: `Would it be helpful if I sent you updated listings that match what you’re looking for?<br><br>I can adjust the search based on location, price range, home style, bedrooms and bathrooms, and the specific features that matter to you.<br><br>Just reply with any updates, and I’ll make sure you receive useful options rather than homes that don’t fit.`,
      },
      {
        subject: "Have your preferred areas changed?",
        body: `As your plans develop, your preferred areas may change too.<br><br>If you would like, I can help compare neighborhoods, commute considerations, property taxes, and the types of homes available in different locations.<br><br>Are there any areas you would like to add or remove from your search?`,
      },
      {
        subject: "A quick financing check-in",
        body: `Financing options and monthly-payment goals can shape which homes make the most sense.<br><br>If you need an updated preapproval or would like to speak with a trusted lender, I can help make that connection. There is no obligation—this is simply a way to make your search more focused when you are ready.<br><br>Would a lender introduction be helpful?`,
      },
      {
        subject: "What features matter most now?",
        body: `I wanted to make sure I’m watching for homes that truly fit your needs.<br><br>Have any of your must-have features changed—such as location, bedrooms, first-floor living, outdoor space, garage size, or condition?<br><br>Reply with your top priorities, and I can refine the options I send you.`,
      },
      {
        subject: "Would you like help planning home tours?",
        body: `When you are ready to tour homes, I can help organize the appointments so you can compare the strongest options efficiently.<br><br>If there are properties you have saved or neighborhoods you want to explore, send them my way and I’ll help with availability and scheduling.<br><br>Would you like to plan a tour day?`,
      },
      {
        subject: "Has your moving timeline changed?",
        body: `I know moving plans can change, so I wanted to check on your timing.<br><br>Whether you hope to move soon, later this year, or are simply gathering information, knowing your approximate timeline helps me provide more useful guidance.<br><br>Has anything changed with your plans?`,
      },
      {
        subject: "Would you still like real estate updates?",
        body: `I want to make sure the information I send remains useful to you.<br><br>Would you still like occasional listings and real estate updates, or would you prefer that I pause for now? Either choice is completely fine.<br><br>Just reply and let me know what works best for you.`,
      },
    ],
  };
  const list = sequences[lead.funnel] || [];
  const step = Number(lead.funnelStep || 0);
  const message = list[lead.funnel === "longTermNurture" ? step % list.length : step];
  if (!message) return null;
  return {
    ...message,
    html: `<p>Hi ${escapeHtml(name)},</p><p style="line-height:1.65;">${message.body}</p>${signatureHtml(agent)}<p style="margin-top:28px;font-size:11px;color:#68777d;">You are receiving this because you requested real estate information. <a href="${escapeHtml(unsubscribeUrl(lead))}">Unsubscribe</a></p>`,
  };
}

async function sendFunnelEmail(lead, agent, message) {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("EMAIL_FROM");
  if (!apiKey || !from) throw new Error("RESEND_API_KEY or EMAIL_FROM is missing.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: senderAddress(agent),
      to: lead.email,
      reply_to: agent.email,
      subject: message.subject,
      html: `<div style="max-width:640px;margin:0 auto;padding:28px;font-family:Arial,sans-serif;color:#202a2e;">${message.html}</div>`,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Email send failed.");
  try { return JSON.parse(text); } catch { return {}; }
}

function eligible(lead, now) {
  if (!lead || !["newNoResponse", "engaged", "longTermNurture"].includes(lead.funnel)) return false;
  if (lead.funnelPaused || lead.emailOptOut || BLOCKED_STATUSES.has(lead.status)) return false;
  if (!lead.email || !lead.assignedTo || !lead.nextAutomatedEmailAt) return false;
  return new Date(lead.nextAutomatedEmailAt).getTime() <= now.getTime();
}

function recordSuccess(lead, message, result, now) {
  lead.automationHistory = Array.isArray(lead.automationHistory) ? lead.automationHistory : [];
  lead.activity = Array.isArray(lead.activity) ? lead.activity : [];
  lead.automationHistory.unshift({ at: now.toISOString(), text: `Sent “${message.subject}” from ${lead.assignedTo}.`, providerId: result.id || "" });
  lead.automationHistory = lead.automationHistory.slice(0, 50);
  lead.activity.unshift({ at: now.toISOString(), text: `Automated funnel email sent: ${message.subject}` });
  lead.updatedAt = now.toISOString();
  const step = Number(lead.funnelStep || 0);
  if (lead.funnel === "newNoResponse" && step >= 3) {
    lead.funnel = "longTermNurture";
    lead.funnelStep = 0;
    lead.funnelStartedAt = now.toISOString();
    lead.nextAutomatedEmailAt = addDays(now, 28);
    lead.activity.unshift({ at: now.toISOString(), text: "No response after four emails. Automatically moved to Long-Term Nurture." });
  } else if (lead.funnel === "engaged" && step >= 2) {
    lead.funnelStep = 3;
    lead.funnelPaused = true;
    lead.nextAutomatedEmailAt = "";
    lead.activity.unshift({ at: now.toISOString(), text: "Engaged sequence completed and paused for personal follow-up." });
  } else {
    lead.funnelStep = step + 1;
    const waitDays = lead.funnel === "newNoResponse"
      ? [3, 4, 5][step] || 5
      : lead.funnel === "engaged"
      ? [4, 7][step] || 7
      : 28;
    lead.nextAutomatedEmailAt = addDays(now, waitDays);
  }
}

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;
  if (request.method === "GET" && request.query?.action === "unsubscribe") return handleUnsubscribe(request, response);
  if (request.method !== "GET" && request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const cronSecret = optionalEnv("CRON_SECRET");
  if (!cronSecret || request.headers.authorization !== `Bearer ${cronSecret}`) return response.status(401).json({ error: "Unauthorized" });

  const workspace = await getWorkspace();
  if (!workspace.settings?.funnelAutomationEnabled) return response.status(200).json({ ok: true, sent: 0, message: "Funnel automation is disabled." });
  const now = new Date();
  const due = (workspace.leads || []).filter((lead) => eligible(lead, now)).slice(0, MAX_EMAILS_PER_RUN);
  const results = [];
  for (const lead of due) {
    const agent = (workspace.team || []).find((member) => member.name === lead.assignedTo);
    if (!agent?.email) {
      results.push({ leadId: lead.id, sent: false, error: "Assigned agent email is missing." });
      continue;
    }
    const message = messageFor(lead, agent);
    if (!message) {
      results.push({ leadId: lead.id, sent: false, error: "No email remains in this sequence." });
      continue;
    }
    try {
      const providerResult = await sendFunnelEmail(lead, agent, message);
      recordSuccess(lead, message, providerResult, now);
      results.push({ leadId: lead.id, sent: true, subject: message.subject });
    } catch (error) {
      lead.automationHistory = Array.isArray(lead.automationHistory) ? lead.automationHistory : [];
      lead.automationHistory.unshift({ at: now.toISOString(), text: `Email failed: ${error.message}` });
      results.push({ leadId: lead.id, sent: false, error: error.message });
    }
  }
  if (due.length) await saveWorkspace(workspace);
  response.status(200).json({ ok: true, due: due.length, sent: results.filter((item) => item.sent).length, results });
};
