#!/usr/bin/env node
/**
 * Standalone Wellfound Auto-Apply CLI Runner
 * Inspired by https://github.com/ankitbaghel01/wellfound_autoApply
 *
 * Usage:
 *   node auto-apply-runner.js wellfound login     # One-time login to save session
 *   node auto-apply-runner.js wellfound           # Dry run (fills forms, tests flow)
 *   node auto-apply-runner.js wellfound --live    # Live mode (submits matching jobs)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables from .env if present
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = { ...process.env, ...loadEnv() };

const PROFILE_DIR = path.resolve(process.cwd(), '.wellfound-chrome-session');
const LOG_CSV = path.resolve(process.cwd(), 'applications.csv');

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

function appendCsv(job, status) {
  if (!fs.existsSync(LOG_CSV)) {
    fs.writeFileSync(LOG_CSV, 'Date,Title,Company,URL,Status\n');
  }
  const row = `"${new Date().toISOString()}","${(job.title || '').replace(/"/g, '""')}","${(job.company || '').replace(/"/g, '""')}","${job.url || ''}","${status}"\n`;
  fs.appendFileSync(LOG_CSV, row);
}

async function getBrowserContext() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    console.error('\n[Error] Playwright is required for the standalone CLI runner.');
    console.error('Run: npm install -D playwright\n');
    console.error('Alternatively, use the Apply Desk Chrome Extension helper in your browser without needing Node.js or Playwright.\n');
    process.exit(1);
  }

  const context = await playwright.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled']
  });

  return context;
}

async function runLogin() {
  log('Starting login session...');
  log(`Persistent Chrome profile located at: ${PROFILE_DIR}`);
  const context = await getBrowserContext();
  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://wellfound.com/login', { waitUntil: 'domcontentloaded' });
  console.log('\n======================================================');
  console.log('Log into your Wellfound account in the opened Chrome window.');
  console.log('Once you are fully signed in and on the jobs feed, come back here');
  console.log('and press ENTER to save your session.');
  console.log('======================================================\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press ENTER when login is complete...', () => { rl.close(); resolve(); }));

  log('Session stored successfully in .wellfound-chrome-session/');
  await context.close();
}

async function runAutoApply(isLive = false) {
  const keywords = (env.TARGET_KEYWORDS || 'software engineer, frontend, backend, full stack, web developer')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const blocklist = (env.BLOCKLIST_KEYWORDS || 'senior, principal, director, manager, lead, staff, architect, intern')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const companyBlocklist = (env.COMPANY_BLOCKLIST || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const dailyLimit = Number(env.DAILY_LIMIT) || 50;
  const minDelay = Number(env.MIN_DELAY_SECONDS) || 45;
  const maxDelay = Number(env.MAX_DELAY_SECONDS) || 75;

  log(`Mode: ${isLive ? '🔴 LIVE RUN (Submissions active)' : '🟡 DRY RUN (Testing mode, will not submit)'}`);
  log(`Target keywords: ${keywords.join(', ')}`);
  log(`Title blocklist: ${blocklist.join(', ')}`);
  log(`Daily limit: ${dailyLimit}`);

  const context = await getBrowserContext();
  const page = context.pages()[0] || await context.newPage();

  log('Navigating to Wellfound Jobs feed...');
  await page.goto('https://wellfound.com/jobs', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Check login
  if (page.url().includes('/login') || page.url().includes('/join')) {
    log('Not logged in! Run "node auto-apply-runner.js wellfound login" first.');
    await context.close();
    return;
  }

  // Inject helper script into the page
  const helperScript = fs.readFileSync(path.resolve(__dirname, 'browser-helper/wellfound-auto-apply.js'), 'utf8');

  const config = {
    CV: {
      name: env.FULL_NAME || '',
      email: env.EMAIL || '',
      phone: env.PHONE || '',
      location: env.LOCATION || '',
      linkedin: env.LINKEDIN_URL || '',
      portfolio: env.PORTFOLIO_URL || '',
      github: env.GITHUB_URL || '',
      summary: env.PROFESSIONAL_SUMMARY || '',
      skills: env.TECHNICAL_SKILLS || '',
      highlights: (env.PROFESSIONAL_SUMMARY || '').split('.').filter(Boolean)
    },
    answers: {
      workAuthorization: env.WORK_AUTHORIZATION || 'Yes',
      visaSponsorship: env.VISA_SPONSORSHIP || 'No',
      willingToRelocate: env.WILLING_TO_RELOCATE || 'Yes',
      yearsOfExperience: env.YEARS_OF_EXPERIENCE || '3',
      salaryExpectation: env.SALARY_EXPECTATION || 'Negotiable',
      noticePeriod: env.NOTICE_PERIOD || 'Immediately'
    },
    dryRun: !isLive,
    maxApplications: dailyLimit,
    titleKeywords: keywords,
    titleBlocklist: blocklist,
    companyBlocklist: companyBlocklist,
    coverLetterTemplate: env.COVER_LETTER_TEMPLATE || '',
    geminiApiKey: env.GEMINI_API_KEY || '',
    delayMin: minDelay,
    delayMax: maxDelay
  };

  log('Injecting Wellfound Auto-Apply engine into browser...');
  await page.evaluate(cfg => {
    window.__APPLY_CONFIG = cfg;
    window.__applyDeskWellfoundStop = false;
  }, config);

  await page.evaluate(helperScript);

  log('Auto-apply engine is executing. Keep the browser open.');
  log('You can also press Stop on the on-screen HUD at any time.');

  // Wait until runner finishes
  while (true) {
    await page.waitForTimeout(4000);
    const isBusy = await page.evaluate(() => Boolean(window.__applyDeskWellfoundBusy)).catch(() => false);
    if (!isBusy) break;
  }

  log('Run complete! Closing browser session.');
  await context.close();
}

async function main() {
  const args = process.argv.slice(2);
  const target = args[0];

  if (target !== 'wellfound') {
    console.log('\nApply Desk CLI Runner');
    console.log('Inspired by https://github.com/ankitbaghel01/wellfound_autoApply\n');
    console.log('Commands:');
    console.log('  node auto-apply-runner.js wellfound login    Save Wellfound session');
    console.log('  node auto-apply-runner.js wellfound          Test auto-apply in Dry Run mode');
    console.log('  node auto-apply-runner.js wellfound --live   Run Live auto-apply with submissions\n');
    process.exit(0);
  }

  if (args[1] === 'login') {
    await runLogin();
  } else if (args.includes('--live')) {
    await runAutoApply(true);
  } else {
    await runAutoApply(false);
  }
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});

