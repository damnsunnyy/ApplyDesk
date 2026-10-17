import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, GOOGLE_OAUTH_CLIENT_ID } from './config.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const byId = (id) => document.getElementById(id);
const VIEWS = ['setup-view', 'auth-view', 'onboarding-view', 'desk-view'];
const STATUSES = ['interested', 'applied', 'interview', 'shortlisted', 'offer', 'rejected', 'archived'];
const DISPLAY_STATUS = { interested: 'Interested', applied: 'Applied', interview: 'Interview', shortlisted: 'Shortlisted', offer: 'Offer', rejected: 'Rejected', archived: 'Archived' };
const TERM_LIBRARY = ['project coordination','project management','requirement analysis','stakeholder coordination','task tracking','documentation','quality assurance','client communication','business analysis','data analysis','python','java','javascript','typescript','sql','html','css','react','django','fastapi','rest api','aws','azure','excel','power bi','pandas','scikit-learn','machine learning','generative ai','swift','swiftui','firebase','firestore','ios','agile','scrum','jira','communication','leadership','customer support','salesforce','tableau','wordpress','node.js','mongodb','mysql','api','testing','cloud','figma','git'];
const SHUBHAM_STARTER = {
  target_roles: ['Project Coordinator', 'Project Associate', 'Junior Web Developer', 'Business Analyst'],
  locations: ['Pune, India', 'Remote, India'],
  skills: ['Project coordination', 'Requirement analysis', 'Task and deliverable tracking', 'Client communication', 'Stakeholder coordination', 'Documentation', 'Quality assurance', 'Python', 'JavaScript', 'SQL', 'React', 'Django', 'FastAPI', 'Power BI', 'Excel', 'SwiftUI', 'Firebase'],
  summary: 'MCA candidate with practical experience in client-focused website delivery, responsive UI updates, technical documentation, and collaborative project workflows. Skilled at clarifying requirements, coordinating implementation, resolving issues, and checking deliverables.',
  resume_facts: 'EDUCATION\nMaster of Computer Applications (MCA), MIT World Peace University, Pune — Pursuing\nBachelor of Computer Applications (BCA), LNCT College, Bhopal\n\nEXPERIENCE\nWeb Design Intern — Poho (2 months)\nDesigned and customized WordPress websites to meet client requirements and responsive layout needs. Translated website change requests into implementation tasks. Reviewed layouts across screen sizes and refined UI details.\n\nPROJECTS\nStanford Dog Breed Recognition — Python, PyTorch, ResNet-18. 66.08% top-1 accuracy and 64.92% macro F1 on the official test partition; single-run baseline. https://github.com/damnsunnyy/stanford-dog-breed-recognition\nSANA / Echo — Local-first AI assistant prototype with speech transcription, Ollama, FastAPI and React dashboard. https://github.com/damnsunnyy/Echo\nRoadTrip — In-progress SwiftUI group-riding prototype with invite codes and Firestore-backed ride data. https://github.com/damnsunnyy/RoadTrip'
};

let supabase = null;
let session = null;
let profile = null;
let applications = [];
let emailEvents = [];
let searchResults = [];
let gmailToken = null;
let gmailTokenClient = null;
let gmailPoll = null;
let authMode = 'signin';
let pendingCapture = null;
let pendingEmail = null;

function showView(id) { for (const view of VIEWS) byId(view).hidden = view !== id; }
function setMessage(id, message, error = false) { const el = byId(id); if (!el) return; el.textContent = message; el.classList.toggle('error', error); }
function toast(message) { const el = byId('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function cleanText(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function splitList(value) { return String(value || '').split(/[,\n;]/).map(cleanText).filter(Boolean).slice(0, 40); }
function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function displayDate(value) { if (!value) return 'No date set'; const date = new Date(value + (String(value).length === 10 ? 'T00:00:00' : '')); return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function hideAll() { for (const view of VIEWS) byId(view).hidden = true; }

function matchJob(job) {
  const text = normalize(`${job.title || ''} ${job.description || ''}`);
  const known = [...new Set([...(profile?.skills || []), ...TERM_LIBRARY].map(normalize).filter(Boolean))];
  const requested = known.filter(term => (` ${text} `).includes(` ${term} `));
  const owned = (profile?.skills || []).map(normalize);
  const matched = requested.filter(term => owned.some(skill => skill === term || skill.includes(term) || term.includes(skill)));
  const uniqueMatched = [...new Set(matched)];
  return { score: requested.length ? Math.round(uniqueMatched.length / requested.length * 100) : 0, matched: uniqueMatched, missing: requested.filter(term => !matched.includes(term)) };
}

async function boot() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) { showView('setup-view'); return; }
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) { showView('auth-view'); setMessage('auth-message', error.message, true); }
    else await routeSession(data.session);
  } catch (error) { showView('auth-view'); setMessage('auth-message', error.message || 'Could not reach your account service.', true); }
  supabase.auth.onAuthStateChange((event, nextSession) => {
    session = nextSession;
    if (event === 'PASSWORD_RECOVERY') { queueMicrotask(openPasswordDialog); return; }
    queueMicrotask(() => routeSession(nextSession));
  });
  bindAuth();
}

async function routeSession(nextSession) {
  session = nextSession;
  if (!session) { stopGmailPoll(); showView('auth-view'); return; }
  showView('desk-view');
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      const name = session.user.user_metadata?.full_name || '';
      const isShubham = (session.user.email || '').toLowerCase() === 'shubham.meghani.work@gmail.com';
      const seed = isShubham ? SHUBHAM_STARTER : { target_roles: [], locations: [], skills: [], summary: '', resume_facts: '' };
      const { data: created, error: createError } = await supabase.from('profiles').insert({ user_id: session.user.id, full_name: name, ...seed }).select().single();
      if (createError) throw createError;
      profile = created;
    } else profile = data;
    if (!profile.full_name || !profile.target_roles?.length || !profile.skills?.length) { fillProfileForm(byId('profile-form'), profile, session.user.email); showView('onboarding-view'); return; }
    await importLegacyDataForOwner();
    showView('desk-view');
    await loadDesk();
    openPendingCapture();
    await savePendingEmail();
  } catch (error) { showView('desk-view'); toast(`Could not load your profile: ${error.message}`); }
}

async function importLegacyDataForOwner() {
  if ((session.user.email || '').toLowerCase() !== 'shubham.meghani.work@gmail.com') return;
  const importedKey = `applydesk-legacy-import-${session.user.id}`;
  if (localStorage.getItem(importedKey)) return;
  try {
    const oldJobs = JSON.parse(localStorage.getItem('shubham.applydesk.jobs.v1') || '[]');
    const oldEmails = JSON.parse(localStorage.getItem('shubham.applydesk.mail.v1') || '[]');
    const mapping = new Map();
    for (const old of oldJobs) {
      const status = String(old.status || 'Interested').toLowerCase();
      const legacyId = `legacy-${String(old.id || btoa(encodeURIComponent(`${old.title || ''}|${old.company || ''}|${old.url || ''}`))).slice(0, 120)}`;
      const { data: existing } = await supabase.from('applications').select('id').eq('user_id', session.user.id).eq('provider_job_id', legacyId).maybeSingle();
      let rowId = existing?.id;
      if (!rowId) {
        const row = { user_id: session.user.id, provider_job_id: legacyId, title: String(old.title || 'Role to review').slice(0, 180), company: String(old.company || 'Company to confirm').slice(0, 140), location: String(old.location || ''), url: safeUrl(old.url), description: String(old.text || '').slice(0, 15000), match_score: Number(old.score) || 0, matched_terms: Array.isArray(old.hits) ? old.hits : [], missing_terms: Array.isArray(old.unmatched) ? old.unmatched : [], status: STATUSES.includes(status) ? status : 'interested', applied_at: old.applied || null, follow_up_at: old.follow || null, notes: String(old.notes || '') };
        const { data, error } = await supabase.from('applications').insert(row).select('id').single();
        if (error) throw error;
        rowId = data.id;
      }
      if (old.id) mapping.set(old.id, rowId);
    }
    for (const email of oldEmails) {
      const { error } = await supabase.from('email_events').upsert({ user_id: session.user.id, application_id: mapping.get(email.jobId) || null, provider: 'manual', provider_message_id: `legacy-${String(email.id || btoa(encodeURIComponent(`${email.title || ''}|${email.date || ''}|${email.text || ''}`))).slice(0, 240)}`, subject: String(email.title || '').slice(0, 240), sender: String(email.from || '').slice(0, 240), snippet: String(email.text || '').slice(0, 800), status_signal: STATUSES.includes(String(email.suggested || '').toLowerCase()) ? String(email.suggested).toLowerCase() : null, received_at: email.date || null }, { onConflict: 'user_id,provider,provider_message_id', ignoreDuplicates: true });
      if (error) throw error;
    }
    localStorage.setItem(importedKey, '1');
  } catch (error) { console.warn('Apply Desk legacy import paused:', error); }
}

function setAuthMode(mode) {
  authMode = mode;
  $$('.auth-tab').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  byId('name-wrap').hidden = mode !== 'signup';
  byId('auth-eyebrow').textContent = mode === 'signup' ? 'START YOUR PRIVATE WORKSPACE' : 'WELCOME BACK';
  byId('auth-title').textContent = mode === 'signup' ? 'Create your account' : 'Sign in to your desk';
  byId('auth-intro').textContent = mode === 'signup' ? 'Your profile and application history belong to your account.' : 'Your application history is private to your account.';
  byId('auth-submit').innerHTML = mode === 'signup' ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
  byId('forgot-button').hidden = mode === 'signup';
  byId('auth-form').elements.password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  setMessage('auth-message', '');
}

function bindAuth() {
  $$('.auth-tab').forEach(button => button.addEventListener('click', () => setAuthMode(button.dataset.mode)));
  byId('auth-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const email = String(form.get('email')).trim().toLowerCase(); const password = String(form.get('password'));
    byId('auth-submit').disabled = true; setMessage('auth-message', authMode === 'signup' ? 'Creating your private account…' : 'Signing in…');
    try {
      if (authMode === 'signup') {
        const fullName = cleanText(form.get('name'));
        if (!fullName) throw new Error('Add your name to create a profile.');
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { setMessage('auth-message', 'Check your email for a confirmation link. Once confirmed, sign in to finish your profile.'); }
        else { setMessage('auth-message', 'Account created. Set up your personal search profile next.'); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error;
        setMessage('auth-message', 'Signed in. Loading your workspace…');
      }
    } catch (error) { setMessage('auth-message', friendlyAuthError(error.message), true); }
    finally { byId('auth-submit').disabled = false; }
  });
  byId('forgot-button').addEventListener('click', async () => {
    const email = byId('auth-form').elements.email.value.trim();
    if (!email) { setMessage('auth-message', 'Enter your email address first.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    setMessage('auth-message', error ? error.message : 'If that account exists, a reset link is on its way.');
  });
  byId('onboard-signout').addEventListener('click', signOut);
  byId('signout-button').addEventListener('click', signOut);
  byId('profile-form').addEventListener('submit', event => saveProfile(event, true));
  byId('edit-profile-form').addEventListener('submit', event => saveProfile(event, false));
  byId('new-application-button').addEventListener('click', openApplicationDialog);
  byId('application-dialog').querySelector('.dialog-close').addEventListener('click', () => byId('application-dialog').close());
  byId('password-dialog').querySelector('.dialog-close').addEventListener('click', () => byId('password-dialog').close());
  byId('password-form').addEventListener('submit', updatePassword);
  byId('application-form').addEventListener('submit', saveApplicationFromDialog);
  byId('search-button').addEventListener('click', findJobs);
  byId('status-filter').addEventListener('change', renderApplications);
  byId('export-button').addEventListener('click', exportCsv);
  byId('gmail-connect').addEventListener('click', connectGmail);
  byId('gmail-scan').addEventListener('click', () => syncGmail(false));
  $$('.nav-item[data-screen]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
  $$('[data-open-screen]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.openScreen)));
  byId('search-role').addEventListener('keydown', event => { if (event.key === 'Enter') findJobs(); });
}

function openPasswordDialog() { if (!byId('password-dialog').open) byId('password-dialog').showModal(); }
async function updatePassword(event) {
  event.preventDefault(); const password = new FormData(event.currentTarget).get('password');
  const { error } = await supabase.auth.updateUser({ password: String(password) });
  if (error) { setMessage('password-message', error.message, true); return; }
  byId('password-dialog').close(); event.currentTarget.reset(); toast('Password updated.');
}

function friendlyAuthError(message) {
  if (/invalid login credentials/i.test(message)) return 'Email or password did not match. Try again or reset your password.';
  if (/user already registered/i.test(message)) return 'That email already has an account. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'Use a password with at least 8 characters.';
  return message;
}

async function signOut() { stopGmailPoll(); gmailToken = null; await supabase.auth.signOut(); }

function profileRecord(form) {
  const data = new FormData(form);
  return {
    user_id: session.user.id,
    full_name: cleanText(data.get('full_name')).slice(0, 100),
    phone: cleanText(data.get('phone')).slice(0, 40),
    location: cleanText(data.get('location')).slice(0, 100),
    linkedin_url: safeUrl(data.get('linkedin_url')),
    portfolio_url: safeUrl(data.get('portfolio_url')),
    target_roles: splitList(data.get('target_roles')),
    locations: splitList(data.get('locations')),
    skills: splitList(data.get('skills')),
    summary: String(data.get('summary') || '').trim().slice(0, 3000),
    resume_facts: String(data.get('resume_facts') || '').trim().slice(0, 12000),
  };
}

async function saveProfile(event, onboarding) {
  event.preventDefault(); const form = event.currentTarget; const messageId = onboarding ? 'profile-message' : 'edit-profile-message';
  const values = profileRecord(form);
  if (!values.full_name || !values.target_roles.length || !values.skills.length) { setMessage(messageId, 'Name, at least one target role, and skills are needed for matching.', true); return; }
  const { data, error } = await supabase.from('profiles').upsert(values, { onConflict: 'user_id' }).select().single();
  if (error) { setMessage(messageId, error.message, true); return; }
  profile = data; setMessage(messageId, 'Saved to your private account.'); fillProfileForm(byId('edit-profile-form'), profile, session.user.email);
  if (onboarding) { await importLegacyDataForOwner(); showView('desk-view'); await loadDesk(); openPendingCapture(); await savePendingEmail(); } else { populateSearchDefaults(); toast('Profile updated.'); }
}

function fillProfileForm(form, data, email = '') {
  if (!form || !data) return;
  const values = { ...data, email, target_roles: (data.target_roles || []).join(', '), locations: (data.locations || []).join(', '), skills: (data.skills || []).join(', ') };
  for (const [key, value] of Object.entries(values)) if (form.elements[key]) form.elements[key].value = value ?? '';
}

async function loadDesk() {
  fillProfileForm(byId('edit-profile-form'), profile, session.user.email);
  byId('side-name').textContent = profile.full_name || 'Your desk'; byId('side-email').textContent = session.user.email || ''; byId('avatar').textContent = (profile.full_name || 'A').trim().charAt(0).toUpperCase();
  byId('greeting').textContent = `Good to see you, ${(profile.full_name || '').split(' ')[0] || 'there'}.`;
  const now = new Date(); byId('today-label').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase() + ' · YOUR SEARCH, AT A GLANCE';
  populateSearchDefaults();
  await Promise.all([loadApplications(), loadEmailEvents()]);
  const scanKey = `applydesk-last-search-${session.user.id}`;
  const lastScan = Number(localStorage.getItem(scanKey) || 0);
  if (Date.now() - lastScan > 12 * 60 * 60 * 1000 && profile.target_roles?.length && (profile.locations?.[0] || profile.location)) {
    localStorage.setItem(scanKey, String(Date.now()));
    await findJobs(true);
  }
}

function populateSearchDefaults() {
  const roles = profile?.target_roles || []; const locations = profile?.locations || [];
  if (!byId('search-role').value) byId('search-role').value = roles[0] || '';
  if (!byId('search-location').value) byId('search-location').value = locations[0] || profile?.location || '';
}

function showScreen(name) {
  $$('.screen').forEach(screen => screen.classList.toggle('active', screen.id === `screen-${name}`));
  $$('.nav-item[data-screen]').forEach(button => button.classList.toggle('active', button.dataset.screen === name));
  if (name === 'applications') renderApplications();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadApplications() {
  const { data, error } = await supabase.from('applications').select('*').order('created_at', { ascending: false }).limit(250);
  if (error) { toast(`Could not load applications: ${error.message}`); return; }
  applications = data || []; renderApplications(); renderStats();
}

async function loadEmailEvents() {
  const { data, error } = await supabase.from('email_events').select('*').order('received_at', { ascending: false }).limit(50);
  if (error) { setMessage('gmail-message', `Could not load email activity: ${error.message}`, true); return; }
  emailEvents = data || []; renderEmails(); renderStats();
}

async function savePendingEmail() {
  if (!pendingEmail) return;
  const payload = pendingEmail; pendingEmail = null;
  const subject = String(payload.title || '').replace(/\s*[-|·]\s*Gmail\s*$/i, '').slice(0, 240);
  const sender = String(payload.from || '').slice(0, 240);
  const snippet = String(payload.text || '').slice(0, 800);
  const match = matchEmailApplication(subject, sender, snippet);
  const { error } = await supabase.from('email_events').insert({
    user_id: session.user.id, application_id: match?.id || null, provider: 'manual',
    provider_message_id: `manual-${crypto.randomUUID?.() || Date.now()}`,
    subject, sender, snippet, status_signal: signalFromEmail(subject, snippet), received_at: new Date().toISOString(),
  });
  if (error) toast(`Could not save captured email: ${error.message}`);
  else { await loadEmailEvents(); toast('Email added to this account.'); }
}

function renderStats() {
  const total = applications.length;
  const applied = applications.filter(item => ['applied','interview','shortlisted','offer'].includes(item.status)).length;
  const signals = applications.filter(item => ['interview','shortlisted','offer'].includes(item.status)).length;
  const today = new Date().toISOString().slice(0, 10);
  const followUps = applications.filter(item => item.follow_up_at && item.follow_up_at <= today && !['rejected','offer','archived'].includes(item.status)).length;
  byId('stat-total').textContent = total; byId('stat-applied').textContent = applied; byId('stat-interviews').textContent = signals; byId('stat-followups').textContent = followUps;
  byId('nav-app-count').textContent = total;
}

function appCard(item) {
  const article = document.createElement('article'); article.className = 'application-card';
  const content = document.createElement('div'); content.className = 'application-content';
  const top = document.createElement('div'); top.className = 'app-topline';
  const title = document.createElement('h3'); title.textContent = item.title;
  const score = document.createElement('span'); score.className = 'score-chip'; score.textContent = `${item.match_score || 0}% overlap`;
  top.append(title, score); content.append(top);
  const details = document.createElement('p'); details.textContent = [item.company, item.location, item.follow_up_at ? `Follow up ${displayDate(item.follow_up_at)}` : ''].filter(Boolean).join(' · '); content.append(details);
  if (safeUrl(item.url)) { const link = document.createElement('a'); link.href = safeUrl(item.url); link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Open listing ↗'; content.append(link); }
  const status = document.createElement('select'); status.className = 'status-select'; status.setAttribute('aria-label', `Application status for ${item.title}`);
  for (const value of STATUSES) { const option = new Option(DISPLAY_STATUS[value], value); status.add(option); }
  status.value = item.status; status.addEventListener('change', async () => { const patch = { status: status.value }; if (status.value === 'applied' && !item.applied_at) patch.applied_at = new Date().toISOString().slice(0, 10); const { error } = await supabase.from('applications').update(patch).eq('id', item.id); if (error) toast(`Could not update status: ${error.message}`); else { item.status = patch.status; item.applied_at = patch.applied_at || item.applied_at; renderStats(); toast('Application status updated.'); } });
  const controls = document.createElement('div'); controls.className = 'application-controls';
  const resume = document.createElement('button'); resume.className = 'text-button'; resume.textContent = 'Tailor resume'; resume.addEventListener('click', () => tailorResume(item));
  const remove = document.createElement('button'); remove.className = 'text-button destructive'; remove.textContent = 'Delete'; remove.addEventListener('click', () => deleteApplication(item));
  controls.append(status, resume, remove); article.append(content, controls); return article;
}

async function deleteApplication(item) {
  if (!confirm(`Delete ${item.title} at ${item.company} from your account?`)) return;
  const { error } = await supabase.from('applications').delete().eq('id', item.id);
  if (error) toast(`Could not delete application: ${error.message}`);
  else { await loadApplications(); await loadEmailEvents(); toast('Application and linked email signals deleted.'); }
}

function renderApplications() {
  const recentRoot = byId('recent-applications'); const allRoot = byId('all-applications');
  recentRoot.replaceChildren(); allRoot.replaceChildren();
  const filter = byId('status-filter').value;
  const filtered = applications.filter(item => filter === 'all' || item.status === filter);
  const recent = applications.slice(0, 5);
  byId('applications-empty').hidden = applications.length > 0;
  byId('all-empty').hidden = filtered.length > 0;
  recent.forEach(item => recentRoot.append(appCard(item)));
  filtered.forEach(item => allRoot.append(appCard(item)));
}

function renderEmails() {
  const root = byId('recent-emails'); root.replaceChildren();
  for (const event of emailEvents.slice(0, 6)) {
    const card = document.createElement('article'); card.className = 'email-card'; const content = document.createElement('div'); content.className = 'email-content';
    const title = document.createElement('h3'); title.textContent = event.subject || '(no subject)'; const meta = document.createElement('p'); meta.textContent = [event.sender, displayDate(event.received_at)].filter(Boolean).join(' · '); content.append(title, meta);
    const badge = document.createElement('span'); badge.className = 'email-status'; badge.textContent = DISPLAY_STATUS[event.status_signal] || 'Email';
    const remove = document.createElement('button'); remove.className = 'text-button destructive'; remove.textContent = 'Remove'; remove.addEventListener('click', async () => { const { error } = await supabase.from('email_events').delete().eq('id', event.id); if (error) toast(`Could not remove email: ${error.message}`); else { await loadEmailEvents(); toast('Email signal removed.'); } });
    card.append(content, badge, remove);
    if (event.application_id && event.status_signal) { const apply = document.createElement('button'); apply.className = 'text-button'; apply.textContent = 'Update'; apply.addEventListener('click', () => applyEmailSignal(event)); card.append(apply); }
    root.append(card);
  }
}

async function findJobs(silent = false) {
  const role = byId('search-role').value.trim(); const location = byId('search-location').value.trim();
  if (!role || !location) { if (!silent) setMessage('search-message', 'Enter the role and location you want to search.', true); return; }
  byId('search-button').disabled = true; setMessage('search-message', silent ? 'Refreshing your first recommended search…' : 'Searching current listings…'); byId('search-results').replaceChildren();
  const { data, error } = await supabase.functions.invoke('find-jobs', { body: { role, location } });
  byId('search-button').disabled = false;
  if (error) { setMessage('search-message', error.message || 'Search service is not configured. See the setup guide.', true); return; }
  if (data?.error) { setMessage('search-message', data.error, true); return; }
  searchResults = (data?.jobs || []).map(job => ({ ...job, ...matchJob(job) })).sort((a, b) => b.score - a.score);
  renderSearchResults(); setMessage('search-message', searchResults.length ? `${searchResults.length} listings found. Compare the profile overlap and open the original listing before applying.` : 'No current listings found for that search. Try a broader role or location.');
}

function renderSearchResults() {
  const root = byId('search-results'); root.replaceChildren();
  for (const job of searchResults) {
    const card = document.createElement('article'); card.className = 'job-result';
    const title = document.createElement('h3'); title.textContent = job.title;
    const details = document.createElement('p'); details.textContent = [job.company, job.location].filter(Boolean).join(' · ');
    const desc = document.createElement('p'); desc.className = 'job-description'; desc.textContent = job.description || 'The provider did not include a description.';
    const foot = document.createElement('div'); foot.className = 'job-result-foot'; const chip = document.createElement('span'); chip.className = 'score-chip'; chip.textContent = `${job.score}% skill overlap`;
    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '10px';
    const link = document.createElement('a'); link.href = safeUrl(job.url) || '#'; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Open listing ↗';
    const save = document.createElement('button'); save.className = 'text-button'; save.textContent = 'Save'; save.addEventListener('click', () => saveFeedJob(job, save));
    actions.append(link, save); foot.append(chip, actions); card.append(title, details, desc, foot); root.append(card);
  }
}

async function saveFeedJob(job, button) {
  button.disabled = true; button.textContent = 'Saving…';
  const record = { user_id: session.user.id, provider_job_id: job.provider_job_id || null, title: job.title.slice(0, 180), company: job.company.slice(0, 140), location: job.location || '', url: safeUrl(job.url), description: job.description || '', match_score: job.score || 0, matched_terms: job.matched || [], missing_terms: job.missing || [], status: 'interested' };
  const { error } = await supabase.from('applications').upsert(record, { onConflict: 'user_id,provider_job_id', ignoreDuplicates: true });
  if (error) { button.disabled = false; button.textContent = 'Save'; toast(`Could not save listing: ${error.message}`); return; }
  button.textContent = 'Saved'; toast('Added to your private applications.'); await loadApplications();
}

function openApplicationDialog(job = null) {
  const form = byId('application-form'); form.reset();
  if (job) { form.elements.title.value = job.title; form.elements.company.value = job.company; form.elements.location.value = job.location; form.elements.url.value = safeUrl(job.url); form.elements.description.value = job.description; }
  setMessage('application-message', ''); byId('application-dialog').showModal();
}

async function saveApplicationFromDialog(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
  const title = cleanText(data.get('title')); const company = cleanText(data.get('company')); const url = safeUrl(data.get('url'));
  if (!title || !company) { setMessage('application-message', 'Add the role title and company.', true); return; }
  const description = String(data.get('description') || '').slice(0, 15000); const match = matchJob({ title, description });
  const status = String(data.get('status') || 'interested');
  const record = { user_id: session.user.id, title: title.slice(0, 180), company: company.slice(0, 140), location: cleanText(data.get('location')).slice(0, 120), url, description, match_score: match.score, matched_terms: match.matched, missing_terms: match.missing, status, applied_at: status === 'applied' ? new Date().toISOString().slice(0, 10) : null, follow_up_at: data.get('follow_up_at') || null };
  const { error } = await supabase.from('applications').insert(record);
  if (error) { setMessage('application-message', error.message, true); return; }
  byId('application-dialog').close(); await loadApplications(); toast('Application saved to your account.');
}

function exportCsv() {
  const columns = ['title','company','location','url','match_score','status','applied_at','follow_up_at','notes'];
  const rows = [columns, ...applications.map(item => columns.map(key => item[key] ?? ''))];
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); anchor.download = 'apply-desk-applications.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function signalFromEmail(subject, snippet) {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (/\b(offer letter|pleased to offer|offer of employment|job offer)\b/.test(text)) return 'offer';
  if (/\b(short.?listed|selected for the next|moved forward|advance to the next|progress to the next)\b/.test(text)) return 'shortlisted';
  if (/\b(interview|schedule a call|availability for a call|meet the team|technical round)\b/.test(text)) return 'interview';
  if (/\b(not moving forward|regret to inform|not been selected|application unsuccessful|not selected)\b/.test(text)) return 'rejected';
  if (/\b(application received|successfully submitted|thanks for applying|thank you for applying)\b/.test(text)) return 'applied';
  return null;
}

function matchEmailApplication(subject, sender, snippet) {
  const text = normalize(`${subject} ${sender} ${snippet}`);
  return applications.find(item => {
    const company = normalize(item.company); const title = normalize(item.title);
    return (company.length > 4 && text.includes(company)) || (title.length > 8 && text.includes(title));
  }) || null;
}

async function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.append(script);
  });
}

async function connectGmail() {
  if (!GOOGLE_OAUTH_CLIENT_ID) { setMessage('gmail-message', 'Gmail access needs a Google OAuth web client ID. Follow step 5 in the setup guide.', true); return; }
  try {
    await loadGoogleIdentity();
    gmailTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      callback: async response => {
        if (response.error) { setMessage('gmail-message', `Gmail connection failed: ${response.error}`, true); return; }
        gmailToken = response.access_token; byId('gmail-scan').disabled = false; byId('gmail-connect').textContent = 'Gmail connected';
        setMessage('gmail-message', 'Read-only Gmail connected. Checking application updates now.'); await syncGmail(true); startGmailPoll();
      },
    });
    gmailTokenClient.requestAccessToken({ prompt: gmailToken ? '' : 'consent' });
  } catch (error) { setMessage('gmail-message', error.message, true); }
}

async function syncGmail(quiet) {
  if (!gmailToken) { setMessage('gmail-message', 'Connect Gmail to check for replies.'); return; }
  if (!quiet) setMessage('gmail-message', 'Checking recent application-related email…');
  try {
    const query = new URLSearchParams({ q: 'newer_than:45d {interview shortlisted short-listed offer selected "application received" "application update"}', maxResults: '30' });
    const listed = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, { headers: { Authorization: `Bearer ${gmailToken}` } });
    if (listed.status === 401) { gmailToken = null; byId('gmail-scan').disabled = true; throw new Error('Gmail access expired. Reconnect to continue checking.'); }
    if (!listed.ok) throw new Error(`Gmail returned ${listed.status}. Check the Gmail API and OAuth settings.`);
    const result = await listed.json(); const ids = (result.messages || []).slice(0, 30);
    const records = [];
    for (const item of ids) {
      const params = new URLSearchParams({ format: 'metadata' });
      for (const headerName of ['Subject', 'From', 'Date']) params.append('metadataHeaders', headerName);
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?${params}`, { headers: { Authorization: `Bearer ${gmailToken}` } });
      if (!response.ok) continue;
      const message = await response.json(); const headers = message.payload?.headers || [];
      const header = name => headers.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value || '';
      const subject = header('Subject').slice(0, 240); const sender = header('From').slice(0, 240); const snippet = String(message.snippet || '').slice(0, 800);
      const signal = signalFromEmail(subject, snippet); const match = matchEmailApplication(subject, sender, snippet);
      records.push({ user_id: session.user.id, application_id: match?.id || null, provider: 'gmail', provider_message_id: message.id, subject, sender, snippet, status_signal: signal, received_at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null });
    }
    if (records.length) {
      const { error } = await supabase.from('email_events').upsert(records, { onConflict: 'user_id,provider,provider_message_id', ignoreDuplicates: true });
      if (error) throw error;
    }
    await loadEmailEvents();
    setMessage('gmail-message', `Checked ${ids.length} recent messages; saved ${records.filter(item => item.status_signal).length} application signals.`);
    if (!quiet) toast('Inbox check complete.');
  } catch (error) { setMessage('gmail-message', error.message, true); }
}

function startGmailPoll() {
  stopGmailPoll(); gmailPoll = setInterval(() => { if (gmailToken && session && !document.hidden) syncGmail(true); }, 15 * 60 * 1000);
}
function stopGmailPoll() { if (gmailPoll) clearInterval(gmailPoll); gmailPoll = null; }

async function applyEmailSignal(event) {
  const status = event.status_signal; if (!STATUSES.includes(status)) return;
  const { error } = await supabase.from('applications').update({ status }).eq('id', event.application_id);
  if (error) { toast(`Could not update application: ${error.message}`); return; }
  await loadApplications(); toast(`Application marked ${DISPLAY_STATUS[status].toLowerCase()}.`);
}

function tailorResume(item) {
  const facts = String(profile.resume_facts || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  const relevant = (profile.skills || []).filter(skill => normalize(`${item.title} ${item.description}`).includes(normalize(skill)));
  const orderedSkills = [...relevant, ...(profile.skills || []).filter(skill => !relevant.includes(skill))];
  const factsHtml = facts.map(line => `<p>${escapeHtml(line)}</p>`).join('');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(profile.full_name)} — Resume</title><style>@page{size:A4;margin:14mm 16mm}body{font:10pt/1.35 Georgia,serif;color:#171717;max-width:178mm;margin:0 auto}header{text-align:center;margin-bottom:15px}h1{font-size:20pt;letter-spacing:.04em;margin:0 0 5px}.contact{font-size:9pt}h2{font-size:11pt;border-bottom:1px solid #777;padding-bottom:3px;margin:13px 0 6px}p{margin:4px 0}section{break-inside:avoid}.skills{font-size:9pt}a{color:inherit;text-decoration:none}@media screen{body{padding:14mm;box-shadow:0 8px 35px #0002}}</style></head><body><header><h1>${escapeHtml(profile.full_name)}</h1><div class="contact">${escapeHtml(profile.location)}${profile.phone ? ` · ${escapeHtml(profile.phone)}` : ''} · ${escapeHtml(session.user.email)}${profile.linkedin_url ? `<br>${escapeHtml(profile.linkedin_url)}` : ''}${profile.portfolio_url ? ` · ${escapeHtml(profile.portfolio_url)}` : ''}</div></header><section><h2>SUMMARY</h2><p>${escapeHtml(profile.summary || '')}</p></section><section><h2>SKILLS</h2><p class="skills">${orderedSkills.map(escapeHtml).join(' · ')}</p></section><section><h2>EXPERIENCE, EDUCATION &amp; SELECTED WORK</h2>${factsHtml}</section><footer><p>Prepared for ${escapeHtml(item.title)} at ${escapeHtml(item.company)}. This document only uses facts from the account profile; verify it before sending.</p></footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),500))<\/script></body></html>`;
  const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); anchor.download = `${profile.full_name.replace(/[^a-z0-9]+/gi, '-')}-${item.company.replace(/[^a-z0-9]+/gi, '-')}-resume.html`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1500);
}

// The browser helper can open the desk with a captured listing in the URL fragment.
function consumeCapture() {
  if (!location.hash.startsWith('#capture=')) return;
  try {
    pendingCapture = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(9)))));
    history.replaceState(null, '', location.pathname + location.search);
  } catch { toast('Could not read the captured listing.'); }
}

function consumeEmail() {
  if (!location.hash.startsWith('#email=')) return;
  try { pendingEmail = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(7))))); history.replaceState(null, '', location.pathname + location.search); }
  catch { toast('Could not read the captured email.'); }
}

function openPendingCapture() {
  if (!pendingCapture) return;
  const form = byId('application-form'); form.elements.title.value = pendingCapture.title || ''; form.elements.url.value = safeUrl(pendingCapture.url); form.elements.description.value = pendingCapture.text || '';
  byId('application-dialog').showModal(); pendingCapture = null;
}

consumeCapture();
consumeEmail();
boot();
