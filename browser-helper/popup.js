const TRACKER = 'https://damnsunnyy.github.io/ApplyDesk/';
const DEFAULT = {
  name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '',
  summary: '', skills: '', experience: '', education: ''
};

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  return tab;
}

const say = s => {
  const msgEl = document.querySelector('#message');
  if (msgEl) msgEl.textContent = s;
};

// Update daily count and button states on open
async function refreshState() {
  const today = new Date().toLocaleDateString('en-CA');
  const { wellfoundApplyState = {} } = await chrome.storage.local.get('wellfoundApplyState');
  const count = wellfoundApplyState.date === today ? (Number(wellfoundApplyState.count) || 0) : 0;
  const countEl = document.querySelector('#daily-count');
  if (countEl) countEl.textContent = String(count);

  try {
    const tab = await currentTab();
    const [{ result: isBusy }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Boolean(window.__applyDeskWellfoundBusy)
    });
    const stopBtn = document.querySelector('#wellfound-stop');
    if (stopBtn) stopBtn.style.display = isBusy ? 'block' : 'none';
  } catch {}
}

async function startWellfound(dryRun = false) {
  try {
    const tab = await currentTab();
    const url = new URL(tab.url || '');
    if (!url.hostname.endsWith('wellfound.com')) {
      throw new Error('Please open your signed-in Wellfound jobs feed first (wellfound.com/jobs).');
    }
    if (!url.pathname.startsWith('/jobs')) {
      throw new Error('Open Wellfound Jobs (/jobs) with your preferred filters first.');
    }

    const { profile = {}, automation = {}, wellfoundApplyState = {} } = await chrome.storage.local.get(['profile', 'automation', 'wellfoundApplyState']);
    if (!profile.name || !profile.email) {
      throw new Error('Please save your name and email in Profile & Settings first.');
    }

    const today = new Date().toLocaleDateString('en-CA');
    const count = wellfoundApplyState.date === today ? (Number(wellfoundApplyState.count) || 0) : 0;
    const dailyCap = Math.min(50, Math.max(1, Number(automation.wellfoundDailyCap) || 50));
    const remaining = Math.max(0, dailyCap - count);

    if (!dryRun && remaining <= 0) {
      throw new Error(`The ${dailyCap} application daily cap has been reached for today.`);
    }

    const highlights = String(profile.experience || '').split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 6);
    const cv = {
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      currentRole: profile.summary,
      education: profile.education,
      skills: profile.skills,
      summary: profile.summary,
      highlights,
      linkedin: profile.linkedin,
      github: profile.github || '',
      portfolio: profile.website
    };

    const answers = {
      workAuthorization: automation.workAuthorization || '',
      visaSponsorship: automation.visaSponsorship || '',
      willingToRelocate: automation.willingToRelocate || '',
      salaryExpectation: automation.salaryExpectation || '',
      noticePeriod: automation.noticePeriod || '',
      yearsOfExperience: automation.yearsOfExperience || ''
    };

    const titleKeywords = (automation.wellfoundKeywords || []).map(x => x.trim()).filter(Boolean);
    const titleBlocklist = (automation.wellfoundBlocklist && automation.wellfoundBlocklist.length)
      ? automation.wellfoundBlocklist.map(x => x.trim()).filter(Boolean)
      : ['senior', 'principal', 'director', 'manager', 'lead', 'intern', 'staff', 'architect'];
    const companyBlocklist = (automation.wellfoundCompanyBlocklist || []).map(x => x.trim()).filter(Boolean);

    const runnerConfig = {
      CV: cv,
      answers,
      dryRun,
      maxApplications: remaining,
      titleKeywords,
      titleBlocklist,
      companyBlocklist,
      coverLetterTemplate: automation.wellfoundCoverTemplate || '',
      delayMin: Math.max(60, Number(automation.wellfoundDelayMin) || 60),
      delayMax: Math.max(Math.max(60, Number(automation.wellfoundDelayMin) || 60), Number(automation.wellfoundDelayMax) || 150)
    };

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: cfg => {
        window.__APPLY_CONFIG = cfg;
        window.__applyDeskWellfoundStop = false;
      },
      args: [runnerConfig]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['wellfound-auto-apply.js']
    });

    say(dryRun
      ? 'Dry run started! Testing forms without submitting. Watch the on-screen HUD.'
      : `Live runner started! Up to ${remaining} applications today. Keep this tab open.`);

    const stopBtn = document.querySelector('#wellfound-stop');
    if (stopBtn) stopBtn.style.display = 'block';
  } catch (e) {
    say(e.message || 'Could not start Wellfound automation.');
  }
}

document.querySelector('#wellfound-auto').addEventListener('click', () => startWellfound(false));
document.querySelector('#wellfound-dryrun').addEventListener('click', () => startWellfound(true));

document.querySelector('#wellfound-stop').addEventListener('click', async () => {
  try {
    const tab = await currentTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.__applyDeskWellfoundStop = true; }
    });
    say('Stop signal delivered to the Wellfound runner.');
    document.querySelector('#wellfound-stop').style.display = 'none';
  } catch (e) {
    say(e.message || 'Could not stop runner.');
  }
});

// FULL-PERMISSION AUTO-FILL ENGINE (Works on Wellfound profiles, onboarding, application modals, and career sites)
async function triggerAutoFill() {
  try {
    const tab = await currentTab();
    const { profile = {}, automation = {} } = await chrome.storage.local.get(['profile', 'automation']);
    const p = { ...DEFAULT, ...profile };

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (p, automation) => {
        let filled = 0;
        const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

        const labelFor = el => {
          const label = [
            ...(el.labels || []).map(x => x.innerText),
            el.closest('label')?.innerText,
            el.getAttribute('aria-label'),
            el.placeholder,
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText),
            el.parentElement?.innerText,
            el.name,
            el.id
          ].filter(Boolean).join(' ');
          return norm(label);
        };
        const choiceLabel = el => norm([...(el.labels || []).map(x => x.innerText), el.closest('label')?.innerText, el.getAttribute('aria-label'), el.value].filter(Boolean).join(' '));

        const setVal = (el, val) => {
          if (!el || val === undefined || val === null || el.disabled || el.readOnly) return false;
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, String(val));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          el.style.outline = '2px solid #2ecc71';
          el.style.boxShadow = '0 0 8px rgba(46, 204, 113, 0.4)';
          setTimeout(() => { el.style.outline = ''; el.style.boxShadow = ''; }, 3500);
          return true;
        };

        const skillsList = p.skills || '';
        const skillsShort = skillsList.split(',').slice(0, 3).join(', ').trim();
        const primaryRole = (automation.wellfoundKeywords && automation.wellfoundKeywords[0]) || '';

        // 1. Textareas & Text Inputs
        const inputs = [...document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]), textarea')].filter(visible);

        for (const el of inputs) {
          if (el.value && el.value.trim().length > 0) continue;
          const key = labelFor(el);
          if (/search/i.test(key) && !/job|role|title/i.test(key)) continue;

          let val = '';

          // Next job / Ideal role / What you are looking for (Wellfound specific)
          if (/what (are you|you re) looking for|next (job|role)|ideal (role|team|environment)|looking for in your next/i.test(key)) {
            val = '';
          }
          else if (/primary role|desired title|current title|target role|job title/i.test(key)) {
            val = primaryRole;
          }
          else if (/bio\b|elevator pitch|about yourself|describe yourself|tell us about/i.test(key)) {
            val = p.summary || '';
          }
          else if (/first name/i.test(key)) {
            val = (p.name || '').trim().split(/\s+/)[0] || '';
          }
          else if (/last name|family name|surname/i.test(key)) {
            val = (p.name || '').trim().split(/\s+/).slice(1).join(' ');
          }
          else if (/full name|your name|^name\b/i.test(key)) {
            val = p.name || '';
          }
          else if (el.type === 'email' || /e-?mail/i.test(key)) {
            val = p.email || '';
          }
          else if (el.type === 'tel' || /phone|mobile|telephone|contact number/i.test(key)) {
            val = p.phone || '';
          }
          else if (/linkedin/i.test(key)) {
            val = p.linkedin || '';
          }
          else if (/github/i.test(key)) {
            val = p.github || '';
          }
          else if (/portfolio|personal website|website|url/i.test(key)) {
            val = p.website || '';
          }
          else if (/city|location|where are you based|address/i.test(key)) {
            val = p.location || '';
          }
          else if (/work authorization|authorized to work|legally authorized|eligible to work/i.test(key)) {
            val = automation.workAuthorization || '';
          }
          else if (/sponsor|visa/i.test(key)) {
            val = automation.visaSponsorship || '';
          }
          else if (/relocat/i.test(key)) {
            val = automation.willingToRelocate || '';
          }
          else if (/remote/i.test(key)) {
            val = '';
          }
          else if (/salary|compensation|expected pay|ctc/i.test(key)) {
            const salary = automation.salaryExpectation || '';
            val = el.type === 'number' ? (salary.match(/\d[\d,.]*/)?.[0]?.replace(/,/g, '') || '') : salary;
          }
          else if (/notice period|start date|availability|how soon/i.test(key)) {
            val = automation.noticePeriod || '';
          }
          else if (/years? of experience|years with|how many years/i.test(key)) {
            val = String(automation.yearsOfExperience || '');
          }
          else if (/skills|technologies|tech stack/i.test(key)) {
            val = skillsList;
          }
          else if (/cover letter|why are you interested|why this role|why do you want|pitch|note to/i.test(key)) {
            val = automation.wellfoundCoverTemplate || '';
          }
          else if (/education|degree|university|college/i.test(key)) {
            val = p.education || '';
          }
          else if (/experience|employment history/i.test(key)) {
            val = p.experience || p.summary || '';
          }

          if (val && setVal(el, val)) {
            filled++;
          }
        }

        // 2. Radio buttons
        const radioGroups = new Map();
        for (const radio of document.querySelectorAll('input[type="radio"]')) {
          if (!visible(radio)) continue;
          const name = radio.name || 'unnamed_group';
          if (!radioGroups.has(name)) radioGroups.set(name, []);
          radioGroups.get(name).push(radio);
        }

        for (const [name, radios] of radioGroups.entries()) {
          if (radios.some(r => r.checked)) continue;
          const groupText = norm(radios[0].closest('fieldset,div,section')?.innerText || name);

          const configured = /sponsor/i.test(groupText) ? automation.visaSponsorship
            : /authorized|eligib|work permit|right to work/i.test(groupText) ? automation.workAuthorization
            : /relocat/i.test(groupText) ? automation.willingToRelocate : '';
          if (!configured) continue;
          const chosen = radios.find(r => choiceLabel(r) === norm(configured));
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        }

        // 4. Select Dropdowns
        const selects = [...document.querySelectorAll('select')].filter(visible);
        for (const sel of selects) {
          if (sel.value && !/^(select|choose|pick)/i.test(norm(sel.selectedOptions[0]?.innerText || ''))) continue;
          const selLabel = labelFor(sel);

          const targetVal = /sponsor/i.test(selLabel) ? automation.visaSponsorship
            : /authorized|eligib|work permit|right to work/i.test(selLabel) ? automation.workAuthorization
            : /relocat/i.test(selLabel) ? automation.willingToRelocate
            : /salary|compensation|expected pay|ctc/i.test(selLabel) ? automation.salaryExpectation
            : /notice period|start date|availability/i.test(selLabel) ? automation.noticePeriod : '';
          if (!targetVal) continue;
          const opt = [...sel.options].find(o => norm(o.text) === norm(targetVal) || norm(o.value) === norm(targetVal));

          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        }

        // Floating toast on page
        let toast = document.querySelector('#applydesk-fill-toast');
        if (toast) toast.remove();
        toast = document.createElement('div');
        toast.id = 'applydesk-fill-toast';
        toast.style.cssText = `
          position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
          background: #11120f; color: #2ecc71; border: 1px solid #2ecc71;
          border-radius: 8px; padding: 12px 18px; font-weight: 600; font-size: 13px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5); font-family: -apple-system, sans-serif;
          display: flex; align-items: center; gap: 8px;
        `;
        toast.textContent = `✓ Auto-filled ${filled} field(s) across this page!`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);

        return { filled };
      },
      args: [p, automation]
    });

    if (result?.filled) {
      say(`⚡ Auto-filled ${result.filled} field(s) with full permission! Review the glowing fields.`);
    } else {
      say('No empty supported fields found on this page.');
    }
  } catch (e) {
    say(e.message || 'Could not auto-fill this page.');
  }
}

document.querySelector('#fill-all').addEventListener('click', triggerAutoFill);

document.querySelector('#capture').addEventListener('click', async () => {
  try {
    const tab = await currentTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const text = (document.querySelector('main')?.innerText || document.body?.innerText || '').slice(0, 18000);
        const clean = s => (s || '').replace(/\s+/g, ' ').trim();
        const title = clean(document.querySelector('h1')?.innerText) || clean(document.title).replace(/\s*[|·-]\s*Wellfound.*$/i, '');
        let company = '', locationText = '';
        if (location.hostname.endsWith('wellfound.com')) {
          const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
            try { return JSON.parse(s.textContent); } catch { return null; }
          }).flatMap(x => Array.isArray(x) ? x : [x]).find(x => x && (/JobPosting/i.test(x['@type'] || '')));
          company = clean(ld?.hiringOrganization?.name) || clean(document.querySelector('[data-test="StartupName"],a[href*="/company/"]')?.innerText);
          locationText = clean(ld?.jobLocation?.address?.addressLocality || ld?.jobLocationType === 'TELECOMMUTE' && 'Remote') || clean(document.querySelector('[data-test="JobLocation"], [class*="location"]')?.innerText);
        }
        return { url: location.href, title, company, location: locationText, text };
      }
    });
    if (!result?.text) throw new Error('No page text could be read.');
    const data = JSON.stringify(result);
    const encoded = btoa(unescape(encodeURIComponent(data)));
    await chrome.tabs.create({ url: TRACKER + '#capture=' + encoded });
    say('Job page captured. Review role details in Apply Desk.');
  } catch (e) {
    say(e.message || 'Could not capture this page.');
  }
});

document.querySelector('#log-email').addEventListener('click', async () => {
  try {
    const tab = await currentTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: location.href,
        title: document.querySelector('h2.hP')?.innerText || document.title,
        from: document.querySelector('[email]')?.getAttribute('email') || '',
        text: (document.querySelector('[role="main"]')?.innerText || document.querySelector('main')?.innerText || document.body?.innerText || '').slice(0, 6000)
      })
    });
    if (!result?.text) throw new Error('No message text found. Open one email first.');
    const data = JSON.stringify(result);
    const encoded = btoa(unescape(encodeURIComponent(data)));
    await chrome.tabs.create({ url: TRACKER + '#email=' + encoded });
    say('Message captured. Review in Apply Desk.');
  } catch (e) {
    say(e.message || 'Could not capture this message.');
  }
});

document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

refreshState();
