# Lead Relay

This is a separate prototype for a FiveStreet-style real estate lead routing app.

## What this first version does

- Tracks incoming buyer, seller, investor, and rental leads.
- Lets you paste a lead email and create a draft lead from the text.
- Adds a quick intake flow to preview a pasted lead email, create the lead, and notify active team members.
- Can email active team members and send browser push alerts when Vercel notifications are connected.
- Lets the first available team member claim a lead.
- Tracks claimed leads, contacted leads, appointments, nurture leads, do not contact leads, lost leads, and closed sales.
- Supports editable team members with statuses: Available, On call, Backup only, Paused, Out of office, and Admin only.
- Imports lead CSV files exported from FiveStreet.
- Assigns imported leads to matching team members when the CSV has an owner/agent field.
- Can assign an entire FiveStreet CSV upload to one selected team member.
- Recognizes repeat leads by matching email address or phone number against existing and imported leads.
- Routes repeat inquiries only to the team member who already owns the matching lead and labels the notification as a repeat lead.
- Extracts Facebook campaign lead names and property/area values without copying the surrounding email sentence or campaign-volume label.
- Uses a darker, richer dashboard palette with lead names as the main tile element and dashboard lists sorted from hot to cold.
- Recognizes conversational intake wording such as “My name is Fake Buyer” when extracting a lead name.
- Recognizes conversational names even when the name starts on the following line.
- Recognizes natural introductions using “I’m …” while avoiding intent phrases such as “I’m interested in …”.
- Adds a Cancel / start over button that clears the pasted intake, preview form, and current draft.
- Recognizes a lead’s name at the beginning of conversational text, such as “Randy Bucks, I’ve …”.
- Expands team invitation emails with complete iPhone/Android push setup, test, and troubleshooting instructions.
- Prevents claimed-but-unassigned records, automatically claims newly assigned leads, and returns ownerless claimed records to New/Unclaimed.
- Preserves saved phone push subscriptions when the browser syncs lead and team changes.
- Merges each lead by its latest update time so an older browser cannot overwrite a newer claim.
- Refreshes shared cloud claims automatically every 30 seconds and whenever the app returns to the foreground.
- Keeps the selected owner in the edit form while auto-saving, so Done cannot accidentally return an assigned lead to Unclaimed.
- Imports FiveStreet leads for current agents as assigned, preserves former owners in history, sends active former-owner records to Unclaimed review, and archives older legacy records so they remain searchable without flooding the dashboard.
- Shows a category count and former-owner summary for confirmation before a FiveStreet import is saved.
- Shows persistent FiveStreet import progress, reports invalid files and browser storage errors, supports selecting the same file again, and rolls back instead of leaving a partial import.
- Corrects the former-owner summary row loop so the supplied FiveStreet CSV reaches the review confirmation.
- Prevents a blank team-member phone field from falsely matching a former FiveStreet owner.
- Imports the supplied FiveStreet Agent 2 owner fields, full property address, property price, original received date, claimed date, notes, and translated FiveStreet statuses.
- Recognizes a leading name followed directly by intent wording, such as “Jennifer Jitters, looking for more info …”.
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
8. Sign in inside the app. The app will start the shared cloud workspace and auto-save changes after edits.

## Connected lead intake and notifications

- The app includes `/api/inbound-lead` for incoming lead webhooks.
- The app includes `/api/claim-lead` so team members can claim from an email or push link.
- The app includes `/api/push-subscription` so phones/computers can receive push alerts.
- Use an email parser or forwarding service for Zillow, Realtor.com, Homes.com, HomeSale.com, Reminder Media, and similar sources.
- Use email alerts first, then enable push alerts on each team member's phone/computer.

See `LEAD_INTAKE_SETUP.md` for the Vercel, email, push, and email parser setup.

## Keep separate from Closing Desk

Do not upload these files to the Closing Desk GitHub repo. This should have its own repository, Vercel project, and Supabase project.
