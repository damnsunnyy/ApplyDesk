# Apply Desk

A personal job-search workspace with account-based profiles, a role matching feed, application tracking, resume tailoring, email status signals, and an optional Chrome form helper.

**Live webpage:** https://damnsunnyy.github.io/ApplyDesk/

## Current setup state

The site is deployed as a standalone GitHub Pages app. Account sign-in, private cross-device records, live job search, and Gmail sync require a Supabase project and provider credentials. Until those are connected, the page opens the setup guide rather than pretending sign-up is active.

## Connect the backend

1. Create a Supabase project.
2. Run `supabase/migrations/202610170001_apply_desk.sql` in its SQL editor.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `config.js` and push the change. Use only the publishable key in the browser.
4. For job listings, add Adzuna app credentials as Supabase Edge Function secrets and deploy `find-jobs`.
5. For Gmail tracking, configure a Google OAuth web client and add its client ID to `config.js`. Gmail sync currently runs while a signed-in user has the app open.

See the [full setup guide](setup/).

## Local development

```sh
npm ci
npm run build
```

Serve this directory with any static HTTP server. `file://` will not work with ES modules.

## Private data and safety

Supabase row-level security scopes application and email records to the signed-in account. Provider secrets belong in Supabase function secrets, never in browser code. The optional Chrome helper stores form profile data locally; auto-submit must be explicitly enabled and restricted to an exact allowlist of hostnames.
