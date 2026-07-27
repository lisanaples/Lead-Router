# Lead Intake, Email Alerts, and Push Notifications

This setup receives leads from Zillow, Reminder Media, Realtor.com, Homes.com, HomeSale.com, and similar sources, then alerts active team members without using paid SMS.

## What was added

- `/api/inbound-lead`
  - Receives new lead details from a webhook.
  - Adds the lead to the shared Supabase workspace.
  - Sends email alerts and browser push alerts to team members whose status is `Available` or `On call`.

- `/api/claim-lead`
  - Lets a team member claim the lead from the email or push notification link.
  - Locks the lead to the first person who claims it.

- `/api/push-subscription`
  - Saves a phone/computer push subscription for the selected team member.

- `/api/test-push`
  - Sends one test notification to the selected team member after they enable push alerts.

- `/api/public-config`
  - Lets the app know whether push/email notifications are configured.

## Vercel environment variables

In Vercel, open the Lead Router project, then go to **Settings > Environment Variables**.

Add these:

| Name | What it is |
| --- | --- |
| `SUPABASE_URL` | Your Lead Router Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key, not the public key |
| `LEAD_ROUTER_APP_URL` | Your app link, such as `https://lead-router-29yb.vercel.app` |
| `LEAD_ROUTER_INTAKE_SECRET` | A private password you make up for incoming lead webhooks |
| `RESEND_API_KEY` | Email provider API key |
| `EMAIL_FROM` | Verified sender email, such as `Lead Router <leads@yourdomain.com>` |
| `VAPID_PUBLIC_KEY` | Public key for browser push notifications |
| `VAPID_PRIVATE_KEY` | Private key for browser push notifications |
| `VAPID_SUBJECT` | Contact email for push, such as `mailto:lisa@example.com` |

After saving these, redeploy the Vercel project.

## Push keys

The push keys are called VAPID keys. They are not passwords for your app; they let browsers trust the push alerts.

After the files are in GitHub, Vercel can install the included `web-push` package. A developer can generate keys with:

```text
npx web-push generate-vapid-keys
```

Then paste the public and private keys into Vercel as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

Also add:

```text
VAPID_SUBJECT
mailto:your-email@example.com
```

Redeploy Vercel after adding or changing these keys.

## Email alerts

The current version is set up for Resend because it has a simple email API and is easy to connect to Vercel.

Each active/on-call team member needs an email address saved in the Team section.

When a lead arrives, each active/on-call team member receives an email with:

- lead name
- source
- property or area
- phone/email if included
- a **Claim this lead** link

## Push alerts

Each team member should:

1. Open the hosted app on their phone or computer.
2. Sign in.
3. Choose their name in **Working as**.
4. Click **Enable push alerts**.
5. Allow notifications when the browser asks.
6. Click **Send test push**.

Push alerts work from the hosted app, not from the local file version.

On iPhone, push alerts usually require opening the installed Home Screen app, not just a normal Safari tab.

## Lead source setup

Most portals send lead notifications by email. To get those into Lead Router, use an email parser or automation service, such as:

- Zapier Email Parser
- Make.com
- Mailparser
- Parseur

The parser should send a POST webhook to:

```text
https://lead-router-29yb.vercel.app/api/inbound-lead
```

Include your private secret as either a header:

```text
x-lead-router-secret: your-secret-here
```

or in the URL:

```text
https://lead-router-29yb.vercel.app/api/inbound-lead?secret=your-secret-here
```

## Fields the webhook can send

The app accepts these fields:

- `source`
- `type`
- `name`
- `phone`
- `email`
- `property`
- `price`
- `urgency`
- `message`
- `raw`

If the parser sends one big email body as `raw`, the app will try to pull out the name, phone, email, source, property, and urgency automatically.

## Best first test

Before connecting every source, test one simple webhook from Zapier or Make.com with:

```json
{
  "source": "Zillow",
  "type": "Buyer",
  "name": "Test Lead",
  "phone": "717-555-0100",
  "email": "test@example.com",
  "property": "123 Main St",
  "urgency": "Hot",
  "message": "Test lead only"
}
```

Then open the app and click **Refresh cloud data**.
