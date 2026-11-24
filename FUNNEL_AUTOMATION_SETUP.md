# Lead Relay funnel automation setup

Version 97 includes automated lead-facing email funnels. The master switch starts off.

## Required Vercel environment variables

- `RESEND_API_KEY`: existing Resend API key.
- `EMAIL_FROM`: existing verified sending address, such as `Lead Relay <leads@your-verified-domain.com>`.
- `CRON_SECRET`: a new long random value. Vercel uses it to authorize the daily scheduled run.
- `FUNNEL_SIGNING_SECRET`: optional separate long random value for unsubscribe links. If omitted, the existing Supabase service-role key signs those links.
- `LEAD_ROUTER_APP_URL`: should remain `https://lead-router-29yb.vercel.app`.

After adding or changing an environment variable, redeploy the app.

## Before enabling the switch

1. Open Team and edit every agent.
2. Confirm their email and phone.
3. Add their signature title, company, and a public HTTPS photo URL.
4. Open one test lead with your own email address and assign it to yourself.
5. Put it in a funnel and confirm its next planned email date.
6. Turn on **Enable scheduled lead emails** in Settings only after the test information is correct.

The scheduled run occurs daily. It sends only due emails and skips paused, opted-out, archived, do-not-contact, lost, closed, and converted leads.
