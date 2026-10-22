/* Apply Desk Wellfound runner.
   Feature scope inspired by: https://github.com/ankitbaghel01/wellfound_autoApply
   Uses the visible signed-in Wellfound tab with HUD, dry-run & live execution,
   smart Q&A answering, custom cover notes, and automatic Apply Desk sync. */
(async () => {
  'use strict';
  const cfg = window.__APPLY_CONFIG || {};

  if (window.__applyDeskWellfoundBusy) {
    console.warn('[Apply Desk Wellfound] Runner is already running in this tab.');
    return;
  }
  window.__applyDeskWellfoundBusy = true;
  window.__applyDeskWellfoundStop = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = el => !!el && el.getClientRects().length > 0 && !el.disabled;
  const getLocal = async key => {
    if (globalThis.chrome?.storage?.local) return (await chrome.storage.local.get(key))[key];
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  };
  const setLocal = async (key, value) => {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.set({ [key]: value });
    localStorage.setItem(key, JSON.stringify(value));
  };

  // --- FLOATING HUD (HEADS-UP DISPLAY) ---
  let hudEl = document.querySelector('#applydesk-wellfound-hud');
  if (hudEl) hudEl.remove();

  hudEl = document.createElement('div');
  hudEl.id = 'applydesk-wellfound-hud';
  hudEl.style.cssText = `
    position: fixed; top: 18px; right: 18px; z-index: 2147483647;
    width: 330px; background: rgba(17, 18, 15, 0.94);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border: 1px solid #33352d; border-radius: 10px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f1f0e8; font-size: 13px; line-height: 1.45; padding: 14px 16px;
    transition: all 0.25s ease; user-select: none;
  `;

  const isDryRun = Boolean(cfg.dryRun);
  const modeBadgeColor = isDryRun ? '#f39c12' : '#2ecc71';
  const modeLabel = isDryRun ? 'DRY RUN' : 'LIVE RUN';

  hudEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #282a24; padding-bottom:8px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-weight:700; font-size:12px; letter-spacing:0.08em; color:#d7f36a;">APPLY DESK</span>
        <span style="background:${modeBadgeColor}22; color:${modeBadgeColor}; border:1px solid ${modeBadgeColor}55; border-radius:4px; font-size:10px; font-weight:700; padding:1px 6px;">${modeLabel}</span>
      </div>
      <button id="applydesk-hud-close" style="background:none; border:none; color:#8e9087; font-size:16px; cursor:pointer; padding:0 4px; line-height:1;">&times;</button>
    </div>
    <div id="applydesk-hud-action" style="font-weight:500; color:#fff; margin-bottom:8px; min-height:36px; word-break:break-word;">Initializing auto-apply runner…</div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; background:#181914; border:1px solid #282a24; border-radius:6px; padding:7px 10px; margin-bottom:10px; text-align:center;">
      <div>
        <div style="font-size:10px; color:#8e9087; text-transform:uppercase;">${isDryRun ? 'Tested' : 'Applied'}</div>
        <div id="applydesk-hud-count" style="font-weight:700; color:#d7f36a; font-size:14px;">0</div>
      </div>
      <div>
        <div style="font-size:10px; color:#8e9087; text-transform:uppercase;">Skipped</div>
        <div id="applydesk-hud-skipped" style="font-weight:700; color:#e06c75; font-size:14px;">0</div>
      </div>
      <div>
        <div style="font-size:10px; color:#8e9087; text-transform:uppercase;">Checked</div>
        <div id="applydesk-hud-seen" style="font-weight:700; color:#61afef; font-size:14px;">0</div>
      </div>
    </div>
    <div id="applydesk-hud-timer" style="font-size:11px; color:#8e9087; margin-bottom:8px; display:none;"></div>
    <div style="display:flex; gap:8px;">
      <button id="applydesk-hud-stop" style="flex:1; background:#c0392b; color:#fff; border:none; border-radius:6px; padding:7px 10px; font-weight:600; font-size:11px; cursor:pointer; transition:background 0.2s;">⏹ Stop runner</button>
      <button id="applydesk-hud-tracker" style="background:#282a24; color:#d7f36a; border:1px solid #3d4036; border-radius:6px; padding:7px 10px; font-size:11px; font-weight:600; cursor:pointer;">Tracker ↗</button>
    </div>
  `;
  document.body.appendChild(hudEl);

  const actionEl = hudEl.querySelector('#applydesk-hud-action');
  const countEl = hudEl.querySelector('#applydesk-hud-count');
  const skippedEl = hudEl.querySelector('#applydesk-hud-skipped');
  const seenEl = hudEl.querySelector('#applydesk-hud-seen');
  const timerEl = hudEl.querySelector('#applydesk-hud-timer');
  const stopBtn = hudEl.querySelector('#applydesk-hud-stop');
  const trackerBtn = hudEl.querySelector('#applydesk-hud-tracker');
  const closeBtn = hudEl.querySelector('#applydesk-hud-close');

  stopBtn.addEventListener('click', () => {
    window.__applyDeskWellfoundStop = true;
    updateStatus('Stopping runner… finishing active job.');
    stopBtn.textContent = 'Stopping…';
    stopBtn.disabled = true;
  });

  trackerBtn.addEventListener('click', () => {
    window.open('https://damnsunnyy.github.io/ApplyDesk/', '_blank');
  });

  closeBtn.addEventListener('click', () => {
    hudEl.style.display = hudEl.style.display === 'none' ? 'block' : 'none';
  });

  function updateStatus(text, color = '#fff') {
    if (actionEl) {
      actionEl.textContent = text;
      actionEl.style.color = color;
    }
    console.info(`[Apply Desk Wellfound] ${text}`);
  }

  function updateMetrics(submitted, skipped, seen) {
    if (countEl) countEl.textContent = String(submitted);
    if (skippedEl) skippedEl.textContent = String(skipped);
    if (seenEl) seenEl.textContent = String(seen);
  }

  // --- CONFIGURATION & PROFILE SETUP ---
  const today = new Date().toLocaleDateString('en-CA');
  const stateKey = 'wellfoundApplyState';
  const saved = (await getLocal(stateKey)) || { date: today, count: 0, applications: [] };
  const state = saved.date === today ? saved : { date: today, count: 0, applications: [] };

  const maxApplications = Math.min(50, Math.max(0, Number(cfg.maxApplications) || 50));
  const max = isDryRun ? 50 : Math.min(maxApplications, Math.max(0, maxApplications - state.count));

  const profile = cfg.CV || {};
  const answers = cfg.answers || {};

  const keywords = (Array.isArray(cfg.titleKeywords) && cfg.titleKeywords.length ? cfg.titleKeywords : [
    'software developer', 'software engineer', 'web developer', 'frontend', 'backend', 'full stack', 'react', 'javascript', 'typescript', 'python', 'business analyst', 'project coordinator', 'project associate'
  ]).map(x => String(x).toLowerCase().trim()).filter(Boolean);

  const blocked = (Array.isArray(cfg.titleBlocklist) && cfg.titleBlocklist.length ? cfg.titleBlocklist : [
    'senior', 'principal', 'director', 'manager', 'lead', 'intern', 'staff', 'architect'
  ]).map(x => String(x).toLowerCase().trim()).filter(Boolean);

  const blockedCompanies = (Array.isArray(cfg.companyBlocklist) ? cfg.companyBlocklist : [])
    .map(x => String(x).toLowerCase().trim()).filter(Boolean);

  // Pre-load previously submitted application URLs into seen set
  const seen = new Set();
  for (const app of (state.applications || [])) {
    if (app.url) {
      try {
        const u = new URL(app.url);
        seen.add(u.pathname);
      } catch {}
    }
  }

  let submittedCount = 0;
  let skippedCount = 0;
  let seenCount = 0;

  const challengePresent = () => /captcha|verification required|datadome|verify you are human|security check/i.test(document.body?.innerText || '');

  // Set input / textarea value and dispatch React synthetic events
  const setValue = (el, value) => {
    if (!el || value === undefined || value === null) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const labelOf = el => norm([
    ...(el.labels || []).map(x => x.innerText),
    el.closest('label')?.innerText,
    el.getAttribute('aria-label'),
    el.placeholder,
    el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText,
    el.parentElement?.innerText,
    el.name,
    el.id
  ].filter(Boolean).join(' '));
  const choiceLabel = el => norm([...(el.labels || []).map(label => label.innerText), el.closest('label')?.innerText, el.getAttribute('aria-label'), el.value].filter(Boolean).join(' '));

  // --- COVER LETTER GENERATOR ---
  function generateCoverLetter(company, title) {
    if (cfg.coverLetterTemplate && cfg.coverLetterTemplate.trim()) {
      return cfg.coverLetterTemplate
        .replace(/\{company\}/gi, company || 'your company')
        .replace(/\{title\}/gi, title || 'this role')
        .replace(/\{name\}/gi, profile.name || '')
        .replace(/\{email\}/gi, profile.email || '')
        .replace(/\{phone\}/gi, profile.phone || '')
        .replace(/\{skills\}/gi, profile.skills || '')
        .replace(/\{summary\}/gi, profile.summary || '')
        .replace(/\{linkedin\}/gi, profile.linkedin || '')
        .replace(/\{portfolio\}/gi, profile.portfolio || profile.website || '');
    }

    return `Hi ${company || 'Hiring'} team,\n\nI am applying for the ${title || 'position'} role.\n\n${profile.summary || ''}\n\n${profile.skills ? `My skills include ${profile.skills}.\n\n` : ''}Best regards,\n${profile.name || ''}`.trim();
  }

  // --- BUILT-IN Q&A ANSWER BANK (Inspired by ankitbaghel01/wellfound_autoApply) ---
  const answerFor = (label, job) => {
    const q = label.toLowerCase();

    // 1. Work authorization & legal eligibility
    if (/work authorization|authorized to work|legally authorized|eligible to work|legal right|work permit/.test(q)) {
      return answers.workAuthorization || '';
    }
    // 2. Visa sponsorship
    if (/sponsor|require sponsorship|need sponsorship|visa support|future sponsorship/.test(q)) {
      return answers.visaSponsorship || '';
    }
    // 3. Relocation & remote
    if (/relocat|willing to move|open to relocate/.test(q)) {
      return answers.willingToRelocate || '';
    }
    if (/remote|work from home|telecommute|distributed team/.test(q)) {
      return '';
    }
    // 4. Compensation / salary expectations
    if (/salary|compensation|ctc|pay expectation|expected pay|rate/.test(q)) {
      return answers.salaryExpectation || '';
    }
    // 5. Notice period / start date / availability
    if (/notice period|start date|how soon|when can you start|availability/.test(q)) {
      return answers.noticePeriod || '';
    }
    // 6. Years of experience
    if (/years? of experience|years have you|how many years/.test(q)) {
      return String(answers.yearsOfExperience || '');
    }
    // 7. Personal & contact info
    if (/first name/.test(q)) return String(profile.name || '').trim().split(/\s+/)[0] || '';
    if (/last name|family name|surname/.test(q)) return String(profile.name || '').trim().split(/\s+/).slice(1).join(' ');
    if (/full name|your name|^name$/.test(q)) return profile.name || '';
    if (/e-?mail/.test(q)) return profile.email || '';
    if (/phone|mobile|telephone|contact number/.test(q)) return profile.phone || '';
    if (/linkedin/.test(q)) return profile.linkedin || '';
    if (/github/.test(q)) return profile.github || '';
    if (/portfolio|personal website|website|blog|url/.test(q)) return profile.portfolio || profile.website || '';
    if (/city|location|where are you based|current address|residence/.test(q)) return profile.location || '';
    if (/education|degree|university|college|school/.test(q)) return profile.education || '';
    if (/skill|technology|tech stack|tools/.test(q)) return profile.skills || '';

    // 8. Wellfound next role / ideal job (e.g. "Describe what you are looking for in your next job")
    if (/what (are you|you're) looking for|next (job|role)|ideal (role|team|environment)|looking for in your next/i.test(q)) return '';
    if (/primary role|target role|desired title|current title|what is your title/i.test(q)) {
      return (Array.isArray(profile.targetRoles) && profile.targetRoles[0]) || '';
    }
    if (/bio\b|elevator pitch|about yourself|describe yourself|tell us about|summary/i.test(q)) {
      return profile.summary || '';
    }
    if (/why (this|are you|do you|work with|join)|interest in (this|our|the)|pitch/i.test(q)) {
      return '';
    }
    if (/achievement|proudest|biggest project|accomplishment/i.test(q)) {
      return '';
    }
    if (/challenging (bug|problem|technical)|difficult issue/i.test(q)) {
      return '';
    }

    return '';
  };

  // --- UI HELPERS ---
  const closePanel = panel => {
    const closeBtn = [...(panel?.querySelectorAll('button,[role="button"],svg') || [])].find(b => {
      const txt = norm(b.innerText || b.getAttribute('aria-label') || '');
      return visible(b) && /^(close|cancel|×|✕)$/i.test(txt);
    });
    if (closeBtn) closeBtn.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };

  const waitFor = async (find, ms = 7000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const value = find();
      if (value) return value;
      await sleep(250);
    }
    return null;
  };

  // --- DETECT JOB CARDS ON WELLFOUND ---
  const getJobCards = () => {
    const found = new Map();

    // 1. Scan for direct job links
    const jobLinks = document.querySelectorAll('a[href*="/jobs/"]');
    for (const link of jobLinks) {
      const href = link.href;
      let path = '';
      try { path = new URL(href).pathname; } catch { continue; }
      if (!/\/jobs\/\d/.test(path) || !visible(link)) continue;

      let card = link;
      for (let i = 0; i < 6 && card.parentElement && card.innerText.length < 120; i++) {
        card = card.parentElement;
      }

      const bodyText = norm(card.innerText);
      if (!bodyText) continue;

      // Skip already applied
      if (/\bapplied\b/i.test(bodyText)) continue;

      // Extract title
      const title = norm(link.innerText).split(/remote|hybrid|on-site|posted|\$|₹|€|·|•/i)[0].trim();
      if (!title) continue;

      // Check title keywords
      if (keywords.length && !keywords.some(word => title.toLowerCase().includes(word))) continue;

      // Check title blocklist
      if (blocked.some(word => title.toLowerCase().includes(word))) continue;

      // Extract company
      const companyImg = card.querySelector('img[alt*="logo" i]');
      const company = norm(companyImg?.alt || '').replace(/company logo/i, '').trim() ||
        norm(card.querySelector('a[href*="/company/"]')?.innerText || '');

      // Check company blocklist
      if (blockedCompanies.some(bc => company.toLowerCase().includes(bc))) continue;

      // Check post age (skip > 14 days old if specified)
      const postedMatch = bodyText.match(/posted (?:about )?(\d+)\+?\s*(day|week|month)s? ago/i);
      if (postedMatch) {
        const num = Number(postedMatch[1]) || 1;
        const multiplier = { day: 1, week: 7, month: 30 }[postedMatch[2].toLowerCase()] || 1;
        if (num * multiplier > 14) continue;
      }

      // Check for an explicit Apply button right on the card
      const applyBtn = [...card.querySelectorAll('button,[role="button"]')].find(b => {
        const txt = norm(b.innerText || b.getAttribute('aria-label') || '');
        return visible(b) && /^apply$|^quick apply$/i.test(txt);
      });

      found.set(path, {
        href,
        path,
        title,
        company: company || 'Company',
        description: bodyText.slice(0, 8000),
        link,
        applyBtn,
        card
      });
    }

    return [...found.values()];
  };

  // --- PROCESS SINGLE JOB APPLICATION ---
  const applyOne = async job => {
    updateStatus(`Opening application for ${job.title} at ${job.company}…`);

    // Click Apply button on card if present, else click title link
    const trigger = job.applyBtn || job.link;
    trigger.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(600);
    trigger.click();

    // Wait for the modal or drawer to open
    const panel = await waitFor(() => {
      const candidates = [...document.querySelectorAll('[role="dialog"],[data-test="JobApplicationModal"],[class*="modal" i],[class*="drawer" i]')];
      return candidates.find(el => visible(el) && (/apply to/i.test(el.innerText) || el.querySelector('textarea') || el.querySelector('button[type="submit"]')));
    }, 7000);

    if (!panel) {
      updateStatus(`Skipped ${job.title}: no application modal appeared.`, '#e06c75');
      return false;
    }

    // Check location restriction
    if (/not accepting applications from your (current )?location|not eligible in your region/i.test(panel.innerText)) {
      updateStatus(`Skipped ${job.title}: not accepting applications from your location.`, '#e06c75');
      closePanel(panel);
      return false;
    }

    updateStatus(`Populating details for ${job.title} at ${job.company}…`);

    // --- 1. HANDLE COVER LETTER / NOTE TEXTAREA ---
    const textareas = [...panel.querySelectorAll('textarea')].filter(visible);
    const coverTextarea = textareas.find(ta => /cover letter|cover note|application note/i.test(labelOf(ta)));
    if (coverTextarea && !coverTextarea.value.trim()) {
      const letter = generateCoverLetter(job.company, job.title);
      setValue(coverTextarea, letter);
    }

    // --- 2. HANDLE TEXT & NUMBER INPUTS ---
    const textInputs = [...panel.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="radio"]):not([type="checkbox"])')].filter(visible);
    let missingRequired = false;

    for (const input of textInputs) {
      const label = labelOf(input);
      if (/search/i.test(label)) continue;

      if (!input.value.trim()) {
        let answer = answerFor(label, job);

        // If numeric input and answer contains numbers, extract them
        if (input.type === 'number' && answer) {
          const numMatch = answer.match(/\d[\d,.]*/);
          answer = numMatch ? numMatch[0].replace(/,/g, '') : '';
        }

        if (answer) {
          setValue(input, answer);
        }
      }

      if (input.required && !input.value.trim()) {
        missingRequired = true;
      }
    }

    // --- 3. HANDLE RADIO BUTTONS ---
    const radioGroups = new Map();
    for (const radio of panel.querySelectorAll('input[type="radio"]')) {
      const name = radio.name || 'unnamed_group';
      if (!radioGroups.has(name)) radioGroups.set(name, []);
      radioGroups.get(name).push(radio);
    }

    for (const [name, radios] of radioGroups.entries()) {
      if (radios.some(r => r.checked)) continue;
      const groupText = norm(radios[0].closest('fieldset,div')?.innerText || name).toLowerCase();

      const configured = /sponsor/i.test(groupText) ? answers.visaSponsorship
        : /authorized|eligible|work permit|right to work/i.test(groupText) ? answers.workAuthorization
        : /relocat/i.test(groupText) ? answers.willingToRelocate : '';
      if (!configured) continue;
      const chosen = radios.find(r => choiceLabel(r).toLowerCase() === String(configured).toLowerCase());
      if (chosen) {
        chosen.click();
        chosen.checked = true;
        chosen.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // --- 5. HANDLE SELECT DROPDOWNS ---
    const selects = [...panel.querySelectorAll('select')].filter(visible);
    for (const sel of selects) {
      if (sel.value && !/^(select|choose|pick)/i.test(norm(sel.selectedOptions[0]?.innerText || ''))) continue;
      const selLabel = labelOf(sel).toLowerCase();

      const targetVal = /sponsor/i.test(selLabel) ? answers.visaSponsorship
        : /authorized|eligible|work permit|right to work/i.test(selLabel) ? answers.workAuthorization
        : /relocat/i.test(selLabel) ? answers.willingToRelocate
        : answerFor(selLabel, job);
      if (!targetVal) continue;
      const opt = [...sel.options].find(o => norm(o.text).toLowerCase() === String(targetVal).toLowerCase() || norm(o.value).toLowerCase() === String(targetVal).toLowerCase());

      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // --- 6. CHECK FOR MISSING REQUIRED FILE UPLOADS ---
    const missingFile = [...panel.querySelectorAll('input[type="file"][required]')].some(f => !f.files?.length);
    if (missingFile) {
      updateStatus(`Skipped ${job.title}: requires manual resume file upload.`, '#e06c75');
      closePanel(panel);
      return false;
    }

    const requiredControls = [...panel.querySelectorAll('input[required],textarea[required],select[required]')];
    const radioNames = new Set([...panel.querySelectorAll('input[type="radio"][required]')].map(r => r.name));
    const unfilledRequired = requiredControls.some(el => {
      if (el.type === 'file') return !el.files?.length;
      if (el.type === 'radio' || el.type === 'checkbox') return !el.checked;
      if (el.tagName === 'SELECT') return !el.value || /^(select|choose|pick)/i.test(norm(el.selectedOptions[0]?.textContent || ''));
      return !String(el.value || '').trim();
    }) || [...radioNames].some(name => ![...panel.querySelectorAll('input[type="radio"]')].some(r => r.name === name && r.checked));
    if (unfilledRequired) {
      updateStatus(`Skipped ${job.title}: a required question needs an answer from you.`, '#e06c75');
      closePanel(panel);
      return false;
    }

    // --- 7. FIND SUBMIT BUTTON ---
    const submitBtn = await waitFor(() => {
      const buttons = [...panel.querySelectorAll('button,[type="submit"]')].filter(visible);
      return buttons.find(b => {
        const txt = norm(b.innerText || b.getAttribute('aria-label') || '');
        return /^(apply|send|send application|submit|submit application)$/i.test(txt);
      });
    }, 3000);

    if (!submitBtn) {
      updateStatus(`Skipped ${job.title}: no submit button found in modal.`, '#e06c75');
      closePanel(panel);
      return false;
    }

    // --- 8. EXECUTION: DRY RUN VS LIVE RUN ---
    if (isDryRun) {
      // DRY RUN: Visual inspection mode - DO NOT click submit!
      submitBtn.style.outline = '3px dashed #f39c12';
      panel.style.border = '2px solid #f39c12';
      updateStatus(`[DRY RUN] Form filled for ${job.title} at ${job.company}! (Skipping submit)`, '#f39c12');
      await sleep(3500);
      closePanel(panel);

      submittedCount++;
      updateMetrics(submittedCount, skippedCount, seenCount);
      return true;
    }

    // LIVE RUN: Click Submit!
    updateStatus(`Submitting application for ${job.title} at ${job.company}…`);
    submitBtn.click();
    await sleep(2500);

    // Check challenge
    if (challengePresent()) {
      window.__applyDeskWellfoundStop = true;
      updateStatus('Verification challenge appeared! Automation paused.', '#e74c3c');
      return false;
    }

    // Update state
    state.count += 1;
    state.applications.push({
      id: `wellfound-${Date.now()}`,
      date: new Date().toISOString(),
      title: job.title,
      company: job.company,
      url: job.href,
      description: job.description
    });
    await setLocal(stateKey, state);

    submittedCount++;
    updateMetrics(submittedCount, skippedCount, seenCount);
    updateStatus(`Submitted ${job.title} at ${job.company}! (${state.count}/50 today)`, '#2ecc71');
    return true;
  };

  // --- MAIN LOOP ---
  try {
    if (!max) {
      updateStatus('Daily 50-application limit already reached for today.', '#f39c12');
      await sleep(4000);
      return;
    }

    if (!location.hostname.endsWith('wellfound.com') || !location.pathname.startsWith('/jobs')) {
      updateStatus('Please navigate to Wellfound Jobs feed to start.', '#e06c75');
      return;
    }

    updateStatus(`Run started (${modeLabel}). Up to ${max} applications.`);
    await sleep(2000);

    while (submittedCount < max && !window.__applyDeskWellfoundStop) {
      if (challengePresent()) {
        updateStatus('Verification challenge detected. Stopping runner.', '#e74c3c');
        break;
      }

      const availableJobs = getJobCards();
      const nextJob = availableJobs.find(item => !seen.has(item.path));

      if (nextJob) {
        seen.add(nextJob.path);
        seenCount++;
        updateMetrics(submittedCount, skippedCount, seenCount);

        const ok = await applyOne(nextJob);

        if (ok) {
          if (submittedCount >= max || window.__applyDeskWellfoundStop) break;

          // Delay after successful application
          const minWait = Math.max(60, Number(cfg.delayMin) || 60);
          const maxWait = Math.max(minWait, 60, Number(cfg.delayMax) || 150);
          const waitSecs = isDryRun ? 3 : Math.floor(minWait + Math.random() * (maxWait - minWait));

          for (let s = waitSecs; s > 0 && !window.__applyDeskWellfoundStop; s--) {
            if (timerEl) {
              timerEl.style.display = 'block';
              timerEl.textContent = `Pacing delay: ${s}s remaining…`;
            }
            await sleep(1000);
          }
          if (timerEl) timerEl.style.display = 'none';
        } else {
          skippedCount++;
          updateMetrics(submittedCount, skippedCount, seenCount);
          // BRIEF 2.5s pause after skip (eliminates frozen runner stoppage)
          await sleep(2500);
        }
        continue;
      }

      // Infinite scroll: scroll down to load more jobs
      updateStatus('Scrolling feed to load more matching jobs…');
      let grew = false;
      for (let i = 0; i < 4 && !grew && !window.__applyDeskWellfoundStop; i++) {
        window.scrollBy({ top: 1200, behavior: 'smooth' });
        await sleep(3500);
        const refreshed = getJobCards();
        grew = refreshed.some(item => !seen.has(item.path));
      }

      if (!grew) {
        updateStatus('All matching jobs on the feed have been processed.');
        break;
      }
    }
  } catch (error) {
    updateStatus(`Run error: ${error?.message || 'unexpected issue'}`, '#e74c3c');
  } finally {
    window.__applyDeskWellfoundBusy = false;
    updateStatus(`Finished! ${submittedCount} applications ${isDryRun ? 'tested' : 'submitted'}.`, '#d7f36a');
    if (stopBtn) stopBtn.style.display = 'none';

    // Broadcast finished event so Apply Desk tracker syncs records
    if (state.applications.length) {
      globalThis.chrome?.runtime?.sendMessage?.({
        type: 'wellfound-run-finished',
        applications: state.applications.slice(-50)
      })?.catch?.(() => {});
    }
  }
})();
