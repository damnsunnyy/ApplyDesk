const TRACKER = 'https://damnsunnyy.github.io/ApplyDesk/';
const DAILY_ALARM = 'wellfound-daily-run';

function nextLocalRun(time) {
  const [hour, minute] = String(time || '09:00').split(':').map(Number);
  const next = new Date();
  next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

async function scheduleDaily(time) {
  await chrome.alarms.clear(DAILY_ALARM);
  if (time) chrome.alarms.create(DAILY_ALARM, { when: nextLocalRun(time) });
}

async function openTracker(applications) {
  if (!Array.isArray(applications) || !applications.length) return;
  const payload = JSON.stringify(applications.slice(-50));
  const encoded = btoa(unescape(encodeURIComponent(payload)));
  await chrome.tabs.create({ url: `${TRACKER}#wellfound=${encoded}` });
}

async function startScheduledRun() {
  const { profile = {}, automation = {}, wellfoundApplyState = {} } = await chrome.storage.local.get(['profile', 'automation', 'wellfoundApplyState']);
  if (!automation.wellfoundAutoRun || !profile.name || !profile.email) return;

  const today = new Date().toLocaleDateString('en-CA');
  const count = wellfoundApplyState.date === today ? Number(wellfoundApplyState.count) || 0 : 0;
  const dailyCap = Math.min(50, Math.max(1, Number(automation.wellfoundDailyCap) || 50));
  const remaining = Math.max(0, dailyCap - count);
  if (remaining <= 0) return;

  let [tab] = await chrome.tabs.query({ url: 'https://wellfound.com/jobs*' });
  if (!tab) {
    tab = await chrome.tabs.create({ url: 'https://wellfound.com/jobs', active: true });
  } else {
    await chrome.tabs.update(tab.id, { active: true });
  }

  if (tab.status !== 'complete') {
    await new Promise(resolve => {
      const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpdate); resolve(); }, 45000);
      const onUpdate = (id, info) => {
        if (id === tab.id && info.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(onUpdate);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdate);
    });
  }

  const cv = {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    currentRole: profile.summary,
    company: '',
    education: profile.education,
    skills: profile.skills,
    summary: profile.summary,
    highlights: String(profile.experience || '').split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 6),
    linkedin: profile.linkedin,
    github: profile.github || '',
    portfolio: profile.website,
  };

  const answers = {
    workAuthorization: automation.workAuthorization || '',
    visaSponsorship: automation.visaSponsorship || '',
    willingToRelocate: automation.willingToRelocate || '',
    salaryExpectation: automation.salaryExpectation || '',
    noticePeriod: automation.noticePeriod || '',
    yearsOfExperience: automation.yearsOfExperience || '',
  };

  const titleKeywords = (automation.wellfoundKeywords || []).map(x => x.trim()).filter(Boolean);
  const titleBlocklist = (automation.wellfoundBlocklist && automation.wellfoundBlocklist.length)
    ? automation.wellfoundBlocklist.map(x => x.trim()).filter(Boolean)
    : ['senior', 'principal', 'director', 'manager', 'lead', 'intern', 'staff', 'architect'];
  const companyBlocklist = (automation.wellfoundCompanyBlocklist || []).map(x => x.trim()).filter(Boolean);

  const runnerConfig = {
    CV: cv,
    answers,
    dryRun: false,
    maxApplications: remaining,
    titleKeywords,
    titleBlocklist,
    companyBlocklist,
    coverLetterTemplate: automation.wellfoundCoverTemplate || '',
    delayMin: Math.max(60, Number(automation.wellfoundDelayMin) || 60),
    delayMax: Math.max(Math.max(60, Number(automation.wellfoundDelayMin) || 60), Number(automation.wellfoundDelayMax) || 150),
  };

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: config => {
      window.__APPLY_CONFIG = config;
      window.__applyDeskWellfoundStop = false;
    },
    args: [runnerConfig]
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['wellfound-auto-apply.js']
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { automation = {}, wellfoundAnswerDefaultsMigrated = false } = await chrome.storage.local.get(['automation', 'wellfoundAnswerDefaultsMigrated']);
  if (!wellfoundAnswerDefaultsMigrated) {
    if (automation.workAuthorization === 'Yes' && automation.visaSponsorship === 'No' &&
        automation.willingToRelocate === 'Yes' && String(automation.yearsOfExperience) === '3' &&
        automation.salaryExpectation === 'Negotiable' && automation.noticePeriod === 'Immediately') {
      automation.workAuthorization = '';
      automation.visaSponsorship = '';
      automation.willingToRelocate = '';
      automation.yearsOfExperience = '';
      automation.salaryExpectation = '';
      automation.noticePeriod = '';
    }
    automation.wellfoundDailyCap = Math.min(50, Math.max(1, Number(automation.wellfoundDailyCap) || 50));
    automation.wellfoundDelayMin = Math.max(60, Number(automation.wellfoundDelayMin) || 60);
    automation.wellfoundDelayMax = Math.max(automation.wellfoundDelayMin, 60, Number(automation.wellfoundDelayMax) || 150);
    await chrome.storage.local.set({ automation, wellfoundAnswerDefaultsMigrated: true });
  }
  if (automation.wellfoundAutoRun) await scheduleDaily(automation.wellfoundScheduleTime || '09:00');
});

chrome.runtime.onStartup.addListener(async () => {
  const { automation = {} } = await chrome.storage.local.get('automation');
  if (automation.wellfoundAutoRun) await scheduleDaily(automation.wellfoundScheduleTime || '09:00');
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== DAILY_ALARM) return;
  const { automation = {} } = await chrome.storage.local.get('automation');
  if (automation.wellfoundAutoRun) {
    try {
      await startScheduledRun();
    } catch (error) {
      console.error('Apply Desk Wellfound scheduled run failed:', error);
    }
    await scheduleDaily(automation.wellfoundScheduleTime || '09:00');
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'wellfound-run-finished') openTracker(message.applications);
  if (message?.type === 'wellfound-schedule') scheduleDaily(message.enabled ? message.time || '09:00' : '');
});
