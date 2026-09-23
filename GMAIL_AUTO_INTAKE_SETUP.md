# Gmail Auto Intake for Lead Router

This setup lets lead emails go directly into Lead Router without copying and pasting.

## Recommended Email Address

Start with a dedicated Gmail account or Google Workspace inbox, such as:

```text
lisanaplesleads@gmail.com
```

Later, your website/domain company can create a nicer address like:

```text
leads@athomeinlancaster.com
```

That address can forward into the Gmail inbox if needed.

## Step 1: Create a Gmail Label

In Gmail, create this label:

```text
Lead Router Intake
```

The script will only process emails with this label.

## Step 2: Send Lead Emails to That Label

In Gmail, create filters for lead senders such as Zillow, Realtor.com, Homes.com, HomeSale, Reminder Media, and any website lead forms.

For each filter:

- Apply the label: `Lead Router Intake`
- Do not mark as spam
- Optional: Mark as important

## Step 3: Create the Google Apps Script

Go to:

```text
https://script.google.com
```

Create a new project named:

```text
Lead Router Gmail Intake
```

Delete the starter code and paste this:

```javascript
const LEAD_ROUTER_WEBHOOK =
  "https://lead-router-29yb.vercel.app/api/inbound-lead?secret=PASTE_YOUR_SECRET_HERE";

const INTAKE_LABEL = "Lead Router Intake";
const PROCESSED_LABEL = "Lead Router Processed";
const ERROR_LABEL = "Lead Router Error";

function sendLeadEmailsToLeadRouter() {
  const intakeLabel = GmailApp.getUserLabelByName(INTAKE_LABEL);
  if (!intakeLabel) {
    throw new Error(`Create the Gmail label first: ${INTAKE_LABEL}`);
  }

  const processedLabel = getOrCreateLabel(PROCESSED_LABEL);
  const errorLabel = getOrCreateLabel(ERROR_LABEL);
  const threads = intakeLabel.getThreads(0, 20);

  threads.forEach((thread) => {
    if (threadHasLabel(thread, PROCESSED_LABEL)) return;

    const messages = thread.getMessages();
    const message = messages[messages.length - 1];
    const body = [
      `Subject: ${message.getSubject()}`,
      `From: ${message.getFrom()}`,
      `To: ${message.getTo()}`,
      `Date: ${message.getDate()}`,
      "",
      message.getPlainBody(),
    ].join("\n");

    const payload = {
      raw: body,
      source: guessSource(body),
    };

    try {
      const response = UrlFetchApp.fetch(LEAD_ROUTER_WEBHOOK, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const code = response.getResponseCode();
      if (code < 200 || code >= 300) {
        throw new Error(`Lead Router returned ${code}: ${response.getContentText()}`);
      }

      thread.addLabel(processedLabel);
      thread.removeLabel(intakeLabel);
    } catch (error) {
      thread.addLabel(errorLabel);
      console.error(error);
    }
  });
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function threadHasLabel(thread, labelName) {
  return thread.getLabels().some((label) => label.getName() === labelName);
}

function guessSource(text) {
  if (/zillow/i.test(text)) return "Zillow";
  if (/realtor\.com/i.test(text)) return "Realtor.com";
  if (/homes\.com/i.test(text)) return "Homes.com";
  if (/reminder media/i.test(text)) return "Reminder Media";
  if (/homesale/i.test(text)) return "HomeSale.com";
  return "Email Lead";
}
```

Replace:

```text
PASTE_YOUR_SECRET_HERE
```

with your `LEAD_ROUTER_INTAKE_SECRET` value from Vercel.

## Step 4: Authorize and Test

In Google Apps Script:

1. Click **Save**.
2. Choose the function `sendLeadEmailsToLeadRouter`.
3. Click **Run**.
4. Google will ask for permission.
5. Approve the script.

Then send or move one test lead email into the `Lead Router Intake` label and run the function again.

If it works:

- the lead appears in Lead Router
- active/on-call team members receive push/email alerts
- the Gmail thread moves from `Lead Router Intake` to `Lead Router Processed`

If it fails:

- the Gmail thread gets the label `Lead Router Error`

## Step 5: Make It Automatic

In Google Apps Script:

1. Click **Triggers** on the left.
2. Click **Add Trigger**.
3. Choose function: `sendLeadEmailsToLeadRouter`
4. Event source: **Time-driven**
5. Type: **Minutes timer**
6. Interval: every **5 minutes**
7. Save.

Now Gmail will check for new lead emails every few minutes and send them to Lead Router automatically.

