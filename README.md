# Lead Router

This is a separate prototype for a FiveStreet-style real estate lead routing app.

## What this first version does

- Tracks incoming buyer, seller, investor, and rental leads.
- Lets you paste a lead email and create a draft lead from the text.
- Simulates notifying active team members.
- Lets the first available team member claim a lead.
- Tracks claimed leads, contacted leads, appointments, nurture leads, and closed-out leads.
- Saves data in this browser.
- Supports export/import backup.
- Includes installable-app starter files for later hosting.
- Includes a separate Supabase setup file for future shared data.

## What to do next

1. Test this locally by opening `index.html`.
2. When the workflow feels right, create a new GitHub repository for this app only.
3. Upload these files to that new GitHub repo.
4. Create a new Vercel project connected to that repo.
5. Create a separate Supabase project for this app.
6. Run `supabase-setup.sql` in the new Supabase project.
7. Add sign-in and cloud sync to connect this app to Supabase.

## What a real connected version would need

- A dedicated Supabase project for shared lead data and accounts.
- An inbound email parser or forwarding address for Zillow, Realtor.com, Homes.com, website forms, and other lead sources.
- A texting service such as Twilio for team notifications.
- A claim link or text reply workflow that locks the lead to the first team member who claims it.
- Admin controls for reassigning leads, pausing agents, and reporting lead response times.

## Keep separate from Closing Desk

Do not upload these files to the Closing Desk GitHub repo. This should have its own repository, Vercel project, and Supabase project.
