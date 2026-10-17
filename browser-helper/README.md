# Apply Desk browser helper

This optional Chrome Manifest V3 extension captures visible job-page text into the Apply Desk, logs an open email you explicitly choose, and fills blank form fields it can confidently identify from your local profile. It asks for access only to the active tab after you click a button. Profile details remain in this browser's extension storage.

The live Apply Desk first needs the Supabase connection described in [its setup guide](../job-hunt/setup/). Each friend signs up in their own account; the browser helper profile is configured per device.

## Install in Chrome

1. Download this repository or its `browser-helper` folder to your computer.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this folder.
3. Open the extension’s **Details → Extension options** and check your contact details.
4. On a job page, click the extension and choose **Capture this job**. Sign in if asked, review the captured role/company/description, then save it to your account.
5. In Gmail, open a job-related message and choose **Log this email** to add a reply signal to the tracker. This is an on-demand capture; inbox-wide sync is not enabled.
6. On an application form, choose **Fill application**. By default, it fills recognized fields and leaves submission to you.
7. To enable opt-in submission, open **Edit profile**, enable auto-submit, and list exact approved hostnames (for example, `jobs.example.com`). On those hosts, the helper clicks a clearly labeled submit button only when it has filled at least one known field and all required fields are complete. You still start each application by clicking the extension.

The helper blocks auto-submit when required answers are missing or it detects questions about work authorization, sponsorship, salary, demographics, legal declarations, assessments, or consent. It cannot attach a resume or reliably handle every dynamic application flow. Check the site for a receipt after it submits; the helper cannot guarantee that a third-party site accepted the application. Review the host allowlist and your saved details before enabling this feature.

## Privacy and limitations

The extension profile lives in Chrome extension storage on this device. Captured page text and message snippets are sent to the Apply Desk URL in a fragment for prefilling; URL fragments are not sent to the web server, but the text is visible in the opened tab until the app removes the fragment. Application records are stored in your signed-in Supabase account and protected by row-level security. Gmail sync is optional and uses Google's read-only OAuth consent; the app stores only message headers and short snippets in your own account. Every user must connect their own Gmail account.
