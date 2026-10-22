const TRACKER = 'https://damnsunnyy.github.io/ApplyDesk/';
const DEFAULT = { name: '', email: '', phone: '', location: '', linkedin: '', website: '', summary: '', skills: '', experience: '', education: '' };

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
    const dailyCap = Number(automation.wellfoundDailyCap) || 50;
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
      workAuthorization: automation.workAuthorization || 'Yes',
      visaSponsorship: automation.visaSponsorship || 'No',
      willingToRelocate: automation.willingToRelocate || 'Yes',
      salaryExpectation: automation.salaryExpectation || '$90,000 - $120,000',
      noticePeriod: automation.noticePeriod || 'Immediately',
      yearsOfExperience: automation.yearsOfExperience || '3'
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
      geminiApiKey: automation.geminiApiKey || '',
      delayMin: Number(automation.wellfoundDelayMin) || 45,
      delayMax: Number(automation.wellfoundDelayMax) || 75
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

document.querySelector('#fill').addEventListener('click', async () => {
  try {
    const tab = await currentTab();
    const { profile, automation = {} } = await chrome.storage.local.get(['profile', 'automation']);
    const p = { ...DEFAULT, ...profile };
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (p, automation) => {
        const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const risky = /work authorization|authorized to work|visa sponsorship|sponsorship|salary expectation|expected salary|gender|race|ethnicity|disability|veteran|criminal|conviction|legally|under penalty|assessment|consent|terms and conditions|agree to|background check|date of birth|nationality|citizenship|eeoc|equal opportunity/;
        const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const labelFor = el => {
          const label = [...(el.labels || [])].map(x => x.innerText).join(' ') || el.closest('label')?.innerText || '';
          return `${label} ${el.name} ${el.id} ${el.getAttribute('aria-label')} ${el.placeholder} ${el.autocomplete}`;
        };
        const submitSelector = 'button[type="submit"],input[type="submit"],button:not([type])';
        const forms = [...document.forms].filter(f => visible(f) && f.querySelector(submitSelector));
        const appContext = /application|apply for|apply to|careers|job opening|position|candidate/i.test(`${document.title} ${document.querySelector('h1,h2')?.innerText || ''}`);
        const appForms = forms.filter(f => {
          const fields = [...f.querySelectorAll('input,textarea,select')].map(el => `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label')}`).join(' ');
          const applicationFields = /application|applicant|candidate|resume|cv\b|cover letter|first name|last name|linkedin|phone/i.test(norm(fields));
          return /apply now|submit application|send application|apply for/i.test(f.innerText || '') || (appContext && applicationFields);
        });
        const form = appForms.length === 1 ? appForms[0] : forms.length === 1 ? forms[0] : null;
        if (!form) return { filled: 0, submitted: false, missing: [], reason: 'Could not identify one application form on this page.' };
        const controls = [...form.querySelectorAll('input:not([type="hidden"]):not([type="password"]),textarea,select')].filter(el => visible(el) || el.required);
        let filled = 0; const missing = []; const recognized = [];
        const fields = controls.filter(el => el.type !== 'radio');
        for (const el of fields) {
          if (el.disabled || el.readOnly || el.type === 'file') continue;
          const key = norm(labelFor(el));
          if (risky.test(key)) { if (el.required && !el.checkValidity()) missing.push('sensitive or declaration question'); continue; }
          const companyOrOrg = /company|employer|organization|organisation|recruiter|hiring manager/.test(key);
          let value = '';
          if (!companyOrOrg && /first name/.test(key)) value = (p.name || '').trim().split(/\s+/)[0] || '';
          else if (!companyOrOrg && /last name|family name|surname/.test(key)) value = (p.name || '').trim().split(/\s+/).slice(1).join(' ');
          else if (!companyOrOrg && /(full name|your name|legal name|^name\b)/.test(key)) value = p.name || '';
          else if (!companyOrOrg && /linkedin|linked in/.test(key)) value = p.linkedin || '';
          else if (!companyOrOrg && /portfolio|personal website|personal url/.test(key)) value = p.website || '';
          else if (!companyOrOrg && /city|location|address/.test(key)) value = p.location || '';
          else if (!companyOrOrg && /cover letter|why are you interested|why this role|why do you want to work/.test(key)) value = [p.summary, p.experience].filter(Boolean).join('\n\n');
          else if (!companyOrOrg && /professional summary|resume summary/.test(key)) value = p.summary || '';
          else if (!companyOrOrg && /technical skills|skills/.test(key)) value = p.skills || '';
          else if (!companyOrOrg && /professional experience|work experience|employment history/.test(key)) value = p.experience || '';
          else if (!companyOrOrg && /education|degree/.test(key)) value = p.education || '';
          else if (!companyOrOrg && (el.type === 'email' || /e mail|email address/.test(key))) value = p.email || '';
          else if (!companyOrOrg && (el.type === 'tel' || /phone|mobile|telephone|contact number/.test(key))) value = p.phone || '';
          if (value && !el.value) {
            if (el instanceof HTMLSelectElement) { const option = [...el.options].find(o => norm(o.value) === norm(value) || norm(o.text) === norm(value)); if (option) el.value = option.value; else value = ''; }
            else { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value); }
            if (value) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
          }
          if (value) recognized.push(el);
          if (el.required && !el.checkValidity()) missing.push(key || 'required field');
        }
        return { filled, submitted: false, missing: [...new Set(missing)], reason: missing.length ? 'Review required answers.' : 'Review filled fields, then submit.' };
      },
      args: [p, automation]
    });
    if (result.filled) say(`Filled ${result.filled} fields. ${result.reason || ''}`);
    else say(result.reason || 'No blank fields matched.');
  } catch (e) {
    say(e.message || 'Could not fill this page.');
  }
});

document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

refreshState();
