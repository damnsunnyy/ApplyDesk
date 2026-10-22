import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

const defaultProfile = {
  name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '',
  summary: '', skills: '', experience: '', education: ''
};

const defaultAutomation = {
  wellfoundKeywords: [
    'software developer', 'software engineer', 'web developer', 'frontend', 'backend', 'full stack', 'react', 'javascript', 'typescript', 'python', 'business analyst', 'project coordinator'
  ],
  wellfoundBlocklist: ['senior', 'principal', 'director', 'manager', 'lead', 'intern', 'staff', 'architect'],
  wellfoundCompanyBlocklist: [],
  workAuthorization: 'Yes',
  visaSponsorship: 'No',
  willingToRelocate: 'Yes',
  yearsOfExperience: '3',
  salaryExpectation: 'Negotiable',
  noticePeriod: 'Immediately',
  wellfoundCoverTemplate: '',
  geminiApiKey: '',
  wellfoundDailyCap: 50,
  wellfoundDelayMin: 45,
  wellfoundDelayMax: 75,
  wellfoundAutoRun: false,
  wellfoundScheduleTime: '09:00',
  autoSubmit: false,
  domains: []
};

chrome.storage.local.get(['profile', 'automation'], ({ profile, automation }) => {
  const p = { ...defaultProfile, ...profile };
  const a = { ...defaultAutomation, ...automation };

  // Profile fields
  for (const [key, value] of Object.entries(p)) {
    const el = document.querySelector(`[name="${key}"]`);
    if (el) el.value = value || '';
  }

  // Automation fields
  const setVal = (name, val) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  };

  setVal('wellfoundKeywords', (a.wellfoundKeywords || []).join('\n'));
  setVal('wellfoundBlocklist', (a.wellfoundBlocklist || []).join('\n'));
  setVal('wellfoundCompanyBlocklist', (a.wellfoundCompanyBlocklist || []).join('\n'));
  setVal('workAuthorization', a.workAuthorization || 'Yes');
  setVal('visaSponsorship', a.visaSponsorship || 'No');
  setVal('willingToRelocate', a.willingToRelocate || 'Yes');
  setVal('yearsOfExperience', a.yearsOfExperience || '3');
  setVal('salaryExpectation', a.salaryExpectation || 'Negotiable');
  setVal('noticePeriod', a.noticePeriod || 'Immediately');
  setVal('wellfoundCoverTemplate', a.wellfoundCoverTemplate || '');
  setVal('geminiApiKey', a.geminiApiKey || '');
  setVal('wellfoundDailyCap', a.wellfoundDailyCap || 50);
  setVal('wellfoundDelayMin', a.wellfoundDelayMin || 45);
  setVal('wellfoundDelayMax', a.wellfoundDelayMax || 75);
  setVal('wellfoundScheduleTime', a.wellfoundScheduleTime || '09:00');
  setVal('domains', (a.domains || []).join('\n'));

  const autoRunEl = document.querySelector('[name="wellfoundAutoRun"]');
  if (autoRunEl) autoRunEl.checked = Boolean(a.wellfoundAutoRun);

  const autoSubmitEl = document.querySelector('[name="autoSubmit"]');
  if (autoSubmitEl) autoSubmitEl.checked = Boolean(a.autoSubmit);
});

const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
const status = document.querySelector('#resume-status');

function section(text, headingPatterns, maxLength) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const heading = line => headingPatterns.some(pattern => pattern.test(line));
  const start = lines.findIndex(heading);
  if (start < 0) return '';
  const content = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Z][A-Z\s&/()+-]{2,48}$/.test(line) && !line.includes('@')) break;
    content.push(line);
  }
  return content.join('\n').slice(0, maxLength).trim();
}

function extractResume(text) {
  const lines = text.split('\n').map(normalize).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const linkedinRaw = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Z0-9._%-]+/i)?.[0] || '';
  const linkedin = linkedinRaw ? `https://${linkedinRaw.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '';
  const githubRaw = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Z0-9._%-]+/i)?.[0] || '';
  const github = githubRaw ? `https://${githubRaw.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}` : '';
  const labelledWebsite = text.match(/(?:portfolio|personal website|website)\s*[:|–-]\s*((?:https?:\/\/)?(?:www\.)?[A-Z0-9.-]+\.[A-Z]{2,}(?:\/[^\s|]*)?)/i)?.[1] || '';
  const website = labelledWebsite ? (/^https?:\/\//i.test(labelledWebsite) ? labelledWebsite : `https://${labelledWebsite}`) : '';
  const phoneLine = lines.slice(0, 12).find(line => /phone|mobile|contact|\+?\d[\d\s().-]{7,}\d/i.test(line) && !line.includes('@')) || '';
  const phone = phoneLine.match(/\+?\d[\d\s().-]{7,}\d/)?.[0]?.trim() || '';
  const headerLine = lines.slice(0, 8).find(line => line.includes('@') || /\+?\d[\d\s().-]{7,}\d/.test(line)) || '';
  const location = (headerLine.split(/[|•·]/)[0] || '').trim();
  const name = lines.slice(0, 8).find(line => line.length < 70 && !/@|https?:\/\/|linkedin\.com|\+?\d[\d\s().-]{7,}\d/i.test(line) && !/resume|curriculum vitae/i.test(line)) || '';
  const summary = section(text, [/^PROFESSIONAL SUMMARY$/i, /^SUMMARY$/i, /^PROFILE$/i], 2400);
  const skills = section(text, [/^TECHNICAL SKILLS$/i, /^SKILLS$/i, /^CORE COMPETENCIES$/i], 2200);
  const experience = section(text, [/^(?:PROFESSIONAL )?EXPERIENCE$/i, /^WORK EXPERIENCE$/i, /^EMPLOYMENT HISTORY$/i], 4000);
  const education = section(text, [/^EDUCATION$/i, /^EDUCATION & QUALIFICATIONS$/i], 2200);
  return { name, email, phone, location, linkedin, website, github, summary, skills, experience, education };
}

document.querySelector('#resume-file').addEventListener('change', async event => {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  status.textContent = '';
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    status.textContent = 'Choose a PDF resume.';
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    status.textContent = 'This PDF is over 12 MB. Choose a smaller file.';
    return;
  }
  status.textContent = 'Reading this PDF on your device…';
  try {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 15); pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      let pageText = '';
      let previousY;
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const y = item.transform?.[5];
        if (previousY !== undefined && y !== undefined && Math.abs(y - previousY) > 3) pageText += '\n';
        else if (pageText && !pageText.endsWith('\n')) pageText += ' ';
        pageText += item.str;
        if (y !== undefined) previousY = y;
      }
      pages.push(pageText);
    }
    const text = pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    if (!text.trim()) throw new Error('No selectable text found. This may be a scanned image PDF.');
    const extracted = extractResume(text);
    let added = 0;
    for (const [key, value] of Object.entries(extracted)) {
      const field = document.querySelector(`[name="${key}"]`);
      if (field && value && !field.value.trim()) { field.value = value; added++; }
    }
    status.textContent = added
      ? `Found resume details for ${added} fields. Review and edit them, then save your profile.`
      : 'Resume text was read. Check the fields below and edit as needed.';
  } catch (error) {
    status.textContent = error.message || 'Could not read this PDF.';
  }
});

document.querySelector('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  const profile = {
    name: String(formData.get('name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    location: String(formData.get('location') || '').trim(),
    linkedin: String(formData.get('linkedin') || '').trim(),
    website: String(formData.get('website') || '').trim(),
    github: String(formData.get('github') || '').trim(),
    summary: String(formData.get('summary') || '').trim(),
    skills: String(formData.get('skills') || '').trim(),
    experience: String(formData.get('experience') || '').trim(),
    education: String(formData.get('education') || '').trim(),
  };

  const automation = {
    wellfoundKeywords: String(formData.get('wellfoundKeywords') || '')
      .split(/[\n,;]/).map(v => v.trim()).filter(Boolean),
    wellfoundBlocklist: String(formData.get('wellfoundBlocklist') || '')
      .split(/[\n,;]/).map(v => v.trim()).filter(Boolean),
    wellfoundCompanyBlocklist: String(formData.get('wellfoundCompanyBlocklist') || '')
      .split(/[\n,;]/).map(v => v.trim()).filter(Boolean),
    workAuthorization: String(formData.get('workAuthorization') || 'Yes'),
    visaSponsorship: String(formData.get('visaSponsorship') || 'No'),
    willingToRelocate: String(formData.get('willingToRelocate') || 'Yes'),
    yearsOfExperience: String(formData.get('yearsOfExperience') || '3'),
    salaryExpectation: String(formData.get('salaryExpectation') || 'Negotiable'),
    noticePeriod: String(formData.get('noticePeriod') || 'Immediately'),
    wellfoundCoverTemplate: String(formData.get('wellfoundCoverTemplate') || '').trim(),
    geminiApiKey: String(formData.get('geminiApiKey') || '').trim(),
    wellfoundDailyCap: Number(formData.get('wellfoundDailyCap')) || 50,
    wellfoundDelayMin: Number(formData.get('wellfoundDelayMin')) || 45,
    wellfoundDelayMax: Number(formData.get('wellfoundDelayMax')) || 75,
    wellfoundAutoRun: formData.has('wellfoundAutoRun'),
    wellfoundScheduleTime: String(formData.get('wellfoundScheduleTime') || '09:00'),
    autoSubmit: formData.has('autoSubmit'),
    domains: String(formData.get('domains') || '').split(/[\n,]/).map(v => v.trim().toLowerCase()).filter(Boolean),
  };

  await chrome.storage.local.set({ profile, automation });
  chrome.runtime.sendMessage({
    type: 'wellfound-schedule',
    enabled: automation.wellfoundAutoRun,
    time: automation.wellfoundScheduleTime
  });

  const savedMsg = document.querySelector('#saved');
  savedMsg.textContent = '✓ Profile & automation settings saved locally on this machine.';
  setTimeout(() => { savedMsg.textContent = ''; }, 4000);
});
