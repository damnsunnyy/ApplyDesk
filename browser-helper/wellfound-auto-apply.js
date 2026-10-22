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
  const saved = (await chrome.storage.local.get(stateKey))[stateKey] || { date: today, count: 0, applications: [] };
  const state = saved.date === today ? saved : { date: today, count: 0, applications: [] };

  const maxApplications = Number(cfg.maxApplications) || 50;
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

  // --- COVER LETTER GENERATOR ---
  function generateCoverLetter(company, title) {
    if (cfg.coverLetterTemplate && cfg.coverLetterTemplate.trim()) {
      return cfg.coverLetterTemplate
        .replace(/\{company\}/gi, company || 'your company')
        .replace(/\{title\}/gi, title || 'this role')
        .replace(/\{name\}/gi, profile.name || '')
        .replace(/\{email\}/gi, profile.email || '')
        .replace(/\{phone\}/gi, profile.phone || '')
        .replace(/\{skills\}/gi, profile.skills || 'software engineering')
        .replace(/\{summary\}/gi, profile.summary || '')
        .replace(/\{linkedin\}/gi, profile.linkedin || '')
        .replace(/\{portfolio\}/gi, profile.portfolio || profile.website || '');
    }

    const highlightsText = Array.isArray(profile.highlights) && profile.highlights.length
      ? `\n\nKey highlights:\n• ${profile.highlights.slice(0, 3).join('\n• ')}`
      : '';

    return `Hi ${company || 'Hiring'} team,

I am writing to express my strong interest in the ${title || 'open'} position at ${company || 'your company'}.

With my background in ${profile.skills || 'modern software development'}, I have built scalable web applications and solved critical engineering challenges. My experience aligns well with your team's goals, and I am excited about the opportunity to bring my skills to ${company || 'your startup'}.

${profile.summary || ''}${highlightsText}

I would welcome the opportunity to discuss how my background fits your team.

Best regards,
${profile.name || ''}
${profile.email || ''} | ${profile.phone || ''}
${profile.portfolio || profile.website || profile.linkedin || ''}`.trim();
  }

  // --- BUILT-IN Q&A ANSWER BANK (Inspired by ankitbaghel01/wellfound_autoApply) ---
  const answerFor = (label, job) => {
    const q = label.toLowerCase();

    // 1. Work authorization & legal eligibility
    if (/work authorization|authorized to work|legally authorized|eligible to work|legal right|work permit/.test(q)) {
      return answers.workAuthorization || 'Yes';
    }
    // 2. Visa sponsorship
    if (/sponsor|require sponsorship|need sponsorship|visa support|future sponsorship/.test(q)) {
      return answers.visaSponsorship || 'No';
    }
    // 3. Relocation & remote
    if (/relocat|willing to move|open to relocate/.test(q)) {
      return answers.willingToRelocate || 'Yes';
    }
    if (/remote|work from home|telecommute|distributed team/.test(q)) {
      return 'Yes';
    }
    // 4. Compensation / salary expectations
    if (/salary|compensation|ctc|pay expectation|expected pay|rate/.test(q)) {
      return answers.salaryExpectation || 'Negotiable';
    }
    // 5. Notice period / start date / availability
    if (/notice period|start date|how soon|when can you start|availability/.test(q)) {
      return answers.noticePeriod || 'Immediately';
    }
    // 6. Years of experience
    if (/years? of experience|years have you|how many years/.test(q)) {
      return String(answers.yearsOfExperience || '3');
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

    // 8. Common startup questions bank
    if (/why (this|are you|do you|work with|join)|interest in (this|our|the)|pitch/i.test(q)) {
      return `I am genuinely excited about ${job.company}'s mission and the chance to contribute to the ${job.title} role. My experience with ${profile.skills || 'modern development'} directly matches what your team is building.`;
    }
    if (/achievement|proudest|biggest project|accomplishment/i.test(q)) {
      return `One of my proudest achievements was architecting and delivering high-performance features, reducing latency, and delivering reliable software for users as highlighted in my experience.`;
    }
    if (/challenging (bug|problem|technical)|difficult issue/i.test(q)) {
      return `A key challenge I resolved involved diagnosing an intermittent state synchronization bottleneck in production, implementing rigorous regression testing, and optimizing data flow.`;
    }
    if (/what are you looking for|ideal (role|team|environment)/i.test(q)) {
      return `I thrive in an agile, collaborative environment with high engineering standards where I can build impactful products and continuously solve challenging problems.`;
    }

    // 9. General summary & background
    if (/summary|about yourself|describe yourself|tell us about|bio/.test(q)) {
      return profile.summary || [profile.name, profile.skills, ...(profile.highlights || [])].filter(Boolean).join('. ');
    }

    return '';
  };

  // --- GEMINI AI FALLBACK (If GEMINI_KEY is provided in cfg) ---
  async function askGeminiFallback(question, job) {
    if (!cfg.geminiApiKey) return null;
    try {
      const promptText = `You are a job applicant answering an application form question.
Company: ${job.company}
Role: ${job.title}
Applicant Name: ${profile.name}
Applicant Skills: ${profile.skills}
Applicant Summary: ${profile.summary}
Applicant Facts: ${(profile.highlights || []).join('; ')}

Question: "${question}"

Provide a concise, professional, 1-to-2 sentence answer in first person. Do not use markdown or quotes.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(cfg.geminiApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 0.2 }
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch {
      return null;
    }
  }

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
    const coverTextarea = textareas.find(ta => /note|pitch|cover|why|interest|message/i.test(labelOf(ta))) || textareas[0];
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
          answer = numMatch ? numMatch[0].replace(/,/g, '') : '90000';
        }

        // Optional Gemini fallback for unknown required fields
        if (!answer && input.required && cfg.geminiApiKey) {
          updateStatus(`Asking Gemini AI to generate answer for: "${label.slice(0, 40)}"…`);
          answer = await askGeminiFallback(label, job);
        }

        if (answer) {
          setValue(input, answer);
        } else if (input.required) {
          // Final fallback for required unknown input: supply brief tailored string
          const generic = `${profile.name} - ${profile.skills || 'experienced software engineer'}`;
          setValue(input, generic);
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

      // Determine ideal choice: Yes or No
      let targetOption = /sponsor/i.test(groupText)
        ? (answers.visaSponsorship === 'Yes' ? /yes/i : /no/i)
        : (/authorized|relocat|remote|eligib/i.test(groupText) ? /yes/i : /yes|agree|accept|prefer not/i);

      let chosen = radios.find(r => targetOption.test(labelOf(r))) || radios[0];
      if (chosen) {
        chosen.click();
        chosen.checked = true;
        chosen.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // --- 4. HANDLE CHECKBOXES (Agreements / Confirmations) ---
    const checkboxes = [...panel.querySelectorAll('input[type="checkbox"]')].filter(visible);
    for (const cb of checkboxes) {
      const cbLabel = labelOf(cb).toLowerCase();
      // Check agreement / declaration / consent / remote understanding checkboxes
      if (/agree|certify|confirm|acknowledge|understand|policy|terms|truthful/i.test(cbLabel) || cb.required) {
        if (!cb.checked) {
          cb.click();
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    // --- 5. HANDLE SELECT DROPDOWNS ---
    const selects = [...panel.querySelectorAll('select')].filter(visible);
    for (const sel of selects) {
      if (sel.value && !/^(select|choose|pick)/i.test(norm(sel.selectedOptions[0]?.innerText || ''))) continue;
      const selLabel = labelOf(sel).toLowerCase();

      let targetVal = /sponsor/i.test(selLabel) ? 'No' : (/authorized|relocat|eligib/i.test(selLabel) ? 'Yes' : '');
      const opt = [...sel.options].find(o => norm(o.text).toLowerCase().includes(targetVal.toLowerCase()) || norm(o.value).toLowerCase().includes(targetVal.toLowerCase())) ||
        [...sel.options].find(o => o.value && !/^(select|choose)/i.test(o.text));

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
    await chrome.storage.local.set({ [stateKey]: state });

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
          const waitSecs = isDryRun
            ? 3
            : Math.floor((cfg.delayMin || 45) + Math.random() * ((cfg.delayMax || 75) - (cfg.delayMin || 45)));

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
      chrome.runtime.sendMessage({
        type: 'wellfound-run-finished',
        applications: state.applications.slice(-50)
      }).catch(() => {});
    }
  }
})();
