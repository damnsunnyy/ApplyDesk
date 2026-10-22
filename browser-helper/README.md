# Apply Desk — Wellfound Auto-Apply & Browser Helper

Inspired by [ankitbaghel01/wellfound_autoApply](https://github.com/ankitbaghel01/wellfound_autoApply), this Chrome Extension provides an intelligent, automated job application engine for **Wellfound** (formerly AngelList Talent) alongside one-click autofill for career portals and Gmail email logging.

## Core Features (Inspired by `wellfound_autoApply`)

* **Live On-Screen HUD:** A floating dashboard inside your Wellfound tab displays live application counts, skipped roles, seen roles, pacing delays, and an immediate **Stop** button.
* **Dry Run Mode:** Test the runner safely without submitting (`🧪 Dry Run`). It finds matching jobs, opens the modal, populates the cover letter and answers, highlights the fields, pauses for visual inspection, and cleanly closes the modal.
* **Live Run Mode:** Submits matching jobs with a 60-second minimum interval, enforces a maximum of 50 submissions per day, and can sync records with your [Apply Desk Tracker](https://damnsunnyy.github.io/ApplyDesk/).
* **Profile based answers:** Fills contact and resume details from your saved profile. Eligibility, sponsorship, relocation, salary, availability, and experience answers stay blank until you configure them. Unknown required questions cause the listing to be skipped.
* **Cover note:** Uses your own template or a short note based on your saved summary and skills. It does not create answers to personal or experience questions.
* **Duplicate Protection:** Stores previously applied job URLs across sessions so you never re-apply to the same listing.

---

## How to Install and Use in Chrome

### 1. Load the Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn ON **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `browser-helper/` directory inside this repository.

### 2. Configure Your Profile & Preferences
1. Click the extension icon and click **⚙ Profile & Settings** (or right-click extension icon → **Options**).
2. Either upload your resume PDF (parsed entirely on your local device) or type in your details:
   - Full name, Email, Phone, Location, Portfolio, LinkedIn, GitHub.
   - Summary, Skills, and Experience facts.
   - Wellfound target job title keywords (e.g. `software engineer`, `full stack`, `react`).
   - Title blocklist (e.g. `senior`, `principal`, `lead`, `intern`).
   - Work authorization, visa sponsorship, relocation, salary expectations, and notice period.
3. Click **Save settings on this device**.
4. *(Alternative)* If you have an account on [Apply Desk](https://damnsunnyy.github.io/ApplyDesk/), go to **Profile** → **Sync profile to Chrome helper** to sync all details in one click!

### 3. Run on Wellfound
1. Open [wellfound.com/jobs](https://wellfound.com/jobs) in Chrome and make sure you are signed in.
2. Set any desired location, market, or search filters in Wellfound's UI.
3. Click the **Apply Desk** extension icon in your Chrome toolbar:
   - Click **🧪 Dry Run (Fill, No Submit)** to test the form filling without sending.
   - Click **▶ Start Live Auto-Apply** to begin automatic submissions.
4. Watch the on-screen HUD in the top-right corner of your Wellfound tab. You can click **⏹ Stop runner** at any point.
5. Once complete, Apply Desk opens automatically to import all submitted applications directly into your private tracking desk!

---

## Standalone CLI Runner (Playwright Mode)

If you prefer running automation from your terminal via Node.js and Playwright (like `ankitbaghel01/wellfound_autoApply`):

1. Install Playwright:
   ```bash
   npm install -D playwright
   npx playwright install chromium
   ```
2. Copy `.env.example` to `.env` and fill in your information:
   ```bash
   cp .env.example .env
   ```
3. One-time interactive login to save your session:
   ```bash
   node auto-apply-runner.js wellfound login
   ```
4. Test in Dry Run mode:
   ```bash
   node auto-apply-runner.js wellfound
   ```
5. Run in Live Mode:
   ```bash
   node auto-apply-runner.js wellfound --live
   ```

The runner stores its daily count and duplicate history in the persistent Wellfound browser profile. Configure `.env` with your own details before running; the example file contains no sample identity or answer defaults.
