# Lead Router

This is a separate prototype for a FiveStreet-style real estate lead routing app.

## What this first version does

- Tracks incoming buyer, seller, investor, and rental leads.
- Lets you paste a lead email and create a draft lead from the text.
- Can email active team members and send browser push alerts when Vercel notifications are connected.
- Lets the first available team member claim a lead.
- Tracks claimed leads, contacted leads, appointments, nurture leads, do not contact leads, lost leads, and closed sales.
- Supports editable team members with statuses: Available, On call, Backup only, Paused, Out of office, and Admin only.
- Imports lead CSV files exported from FiveStreet.
- Assigns imported leads to matching team members when the CSV has an owner/agent field.
- Downloads lead CSV files by owner/team member.
- Shows an owner workflow with daily contacts and a hot-to-cold pipeline.
- Adds a My Leads view for the selected team member.
- Tracks response milestones: first attempt, first contact, appointment, consultation, converted, and lost.
- Adds Reports with weekly check-ins and overall stats.
- Adds account type mode: Master account or Team member account.
- Adds Do not contact status and renames closed to Closed sale.
- Adds Vercel API endpoints for incoming lead webhooks, email alerts, push alerts, and claim links.
- Saves data in this browser.
- Supports export/import backup.
- Includes installable-app starter files for later hosting.
- Includes Supabase sign-in and shared team cloud data.

## What to do next

1. Test this locally by opening `index.html`.
2. When the workflow feels right, create a new GitHub repository for this app only.
3. Upload these files to that new GitHub repo.
4. Create a new Vercel project connected to that repo.
5. Create a separate Supabase project for this app.
6. Run `supabase-setup.sql` in the new Supabase project.
7. Upload the updated files to GitHub and let Vercel redeploy.
8. Sign in inside the app, then use **Upload local data** once to seed the shared cloud workspace.

## Connected lead intake and notifications

- The app includes `/api/inbound-lead` for incoming lead webhooks.
- The app includes `/api/claim-lead` so team members can claim from an email or push link.
- The app includes `/api/push-subscription` so phones/computers can receive push alerts.
- Use an email parser or forwarding service for Zillow, Realtor.com, Homes.com, HomeSale.com, Reminder Media, and similar sources.
- Use email alerts first, then enable push alerts on each team member's phone/computer.

See `LEAD_INTAKE_SETUP.md` for the Vercel, email, push, and email parser setup.

## Keep separate from Closing Desk

Do not upload these files to the Closing Desk GitHub repo. This should have its own repository, Vercel project, and Supabase project.
