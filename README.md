# Apply Desk

A personal job-search workspace with account-based profiles, a role matching feed, application tracking, resume tailoring, email status signals, and an optional Chrome form helper.

**Live webpage:** https://damnsunnyy.github.io/ApplyDesk/

## Current setup state

The site is deployed as a standalone GitHub Pages app. The frontend now points to the connected Supabase project. Sign-up and private cross-device records become fully usable once the database migration is applied and the project’s Auth redirect URLs include this Pages site. Job discovery uses Himalayas’ free public remote jobs API; Gmail tracking still needs its own Google OAuth client ID.

## Connect the backend

1. The frontend URL and publishable key are configured in `config.js`.
2. Run `supabase/migrations/202610170001_apply_desk.sql` in the linked project SQL editor if the GitHub integration has not already applied it.
3. In Supabase Auth → URL Configuration, allow `https://damnsunnyy.github.io/ApplyDesk/` as the Site URL and redirect URL. Use only the publishable key in browser code.
4. For free remote job listings, deploy the `find-jobs` Supabase Edge Function. No job provider key or subscription is needed. Results show Himalayas as the source and link to each original Himalayas listing. The provider supports country eligibility, so city inputs map to country filters where recognized; results are remote roles only.
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
