# Apply Desk

**Live demo:** [https://damnsunnyy.github.io/ApplyDesk/](https://damnsunnyy.github.io/ApplyDesk/)

A personal job-search workspace with account-based profiles, a role matching feed, application tracking, resume tailoring, email status signals, and a high-performance **Wellfound Auto-Apply engine** inspired by [ankitbaghel01/wellfound_autoApply](https://github.com/ankitbaghel01/wellfound_autoApply).

---

## ⚡ Wellfound Auto-Apply Features

The Wellfound auto-apply runner operates both as an **interactive Chrome Extension** (with a floating HUD, one-click dry-run & live run) and as a **standalone Playwright CLI runner**:

- **Real-Time On-Screen HUD:** Displays live submission counts, skipped roles, inspected jobs, pacing countdowns, and an instant **Stop** button directly inside your Wellfound tab.
- **Dry Run & Live Run Modes:** Test the entire application flow without submitting (`Dry Run`), or submit applications live with human-like pacing (45–75s).
- **Intelligent Q&A Answer Bank:** Eliminates stoppages and skips by automatically answering standard Wellfound prompts (work authorization, visa sponsorship, relocation, salary expectations, notice period, years of experience, and common startup questions).
- **Dynamic Cover Letter Generator:** Crafts personalized application notes referencing the target company, role title, your verified skills, and career summary. Supports custom templates.
- **Optional Google Gemini AI Fallback:** Provide a Gemini API key in settings to automatically answer custom startup questions based on your CV facts.
- **Automatic Tracker Sync:** All submitted applications are automatically synced to your private Apply Desk dashboard.
- **Duplicate Protection & Fast Pacing:** Avoids re-applying to past jobs and skips incompatible postings (e.g. manual PDF requirements or location restrictions) in just 2.5s without freezing.

👉 **[Read the Full Wellfound Auto-Apply Setup Guide](browser-helper/README.md)**

---

## Quick Start: Wellfound Auto-Apply

### Option A: Chrome Extension (Recommended)
1. In Chrome, open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the `browser-helper/` folder.
2. Click the extension icon → **⚙ Profile & Settings** to configure your details and target keywords (or click **Sync profile to Chrome helper** in Apply Desk).
3. Open [wellfound.com/jobs](https://wellfound.com/jobs) in your browser.
4. Click the extension icon and select **🧪 Dry Run** (to test) or **▶ Start Live Auto-Apply** (to apply).

### Option B: Standalone CLI Runner (Playwright)
```bash
# 1. Install dependencies & copy env
npm install
npm install -D playwright
npx playwright install chromium
cp .env.example .env

# 2. Login once to save session
node auto-apply-runner.js wellfound login

# 3. Run Dry Run or Live Run
node auto-apply-runner.js wellfound         # Test mode
node auto-apply-runner.js wellfound --live  # Live submissions
```

---

## Local Development & Build

```sh
npm install
npm run build
```

This compiles both `app.bundle.js` and `browser-helper/options.bundle.js` using `esbuild`.

## Private Data & Safety

Supabase row-level security scopes all application and email records to your signed-in account. The Chrome helper stores form profile data locally on your machine.
