const PORTAL_ORIGIN = 'https://damnsunnyy.github.io';

window.addEventListener('message', async (event) => {
  const message = event.data;
  let trustedOrigin = event.origin === PORTAL_ORIGIN;
  try {
    const origin = new URL(event.origin);
    trustedOrigin ||= ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.protocol === 'http:';
  } catch {}
  if (event.source !== window || !trustedOrigin || message?.type !== 'APPLYDESK_PROFILE_SYNC' || typeof message.requestId !== 'string') return;

  const source = message.profile || {};
  const profile = {
    name: String(source.name || '').slice(0, 100),
    email: String(source.email || '').slice(0, 240),
    phone: String(source.phone || '').slice(0, 40),
    location: String(source.location || '').slice(0, 100),
    linkedin: String(source.linkedin || '').slice(0, 300),
    website: String(source.website || '').slice(0, 300),
    github: String(source.github || '').slice(0, 300),
    summary: String(source.summary || '').slice(0, 3000),
    skills: String(source.skills || '').slice(0, 2400),
    experience: String(source.experience || '').slice(0, 8000),
    education: String(source.education || '').slice(0, 3000),
  };

  try {
    const automation = (await chrome.storage.local.get('automation')).automation || {};
    if (Array.isArray(source.targetRoles) && source.targetRoles.length) {
      automation.wellfoundKeywords = source.targetRoles.map(value => String(value).slice(0, 100)).slice(0, 30);
    }
    if (!automation.wellfoundBlocklist || !automation.wellfoundBlocklist.length) {
      automation.wellfoundBlocklist = ['senior', 'principal', 'director', 'manager', 'lead', 'intern', 'staff', 'architect'];
    }
    automation.wellfoundDailyCap ||= 50;
    automation.wellfoundDelayMin ||= 60;
    automation.wellfoundDelayMax ||= 150;
    if (typeof automation.wellfoundAutoRun !== 'boolean') automation.wellfoundAutoRun = true;
    automation.wellfoundScheduleTime ||= '09:00';

    await chrome.storage.local.set({ profile, automation });
    chrome.runtime.sendMessage({
      type: 'wellfound-schedule',
      enabled: automation.wellfoundAutoRun,
      time: automation.wellfoundScheduleTime
    });
    window.postMessage({ type: 'APPLYDESK_PROFILE_SYNC_RESULT', requestId: message.requestId, ok: true }, event.origin);
  } catch {
    window.postMessage({ type: 'APPLYDESK_PROFILE_SYNC_RESULT', requestId: message.requestId, ok: false }, event.origin);
  }
});
