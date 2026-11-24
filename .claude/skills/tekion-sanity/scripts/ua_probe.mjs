#!/usr/bin/env node
// Headless browser probe for the UnifyApps platform (Tekion tenants).
// Loads a page with the user's session cookie, optionally runs a list of actions,
// and prints one JSON object describing what happened. Deterministic evidence for Claude.
//
// Usage:
//   node ua_probe.mjs --url <url> --cookie-file <path> [--actions <json-file>] [--out <dir>]
//                     [--wait-ms 4000] [--timeout-ms 60000] [--name <label>]
//
// --cookie-file holds the raw Cookie header string ("a=1; b=2") or one name=value per line.
// --actions is a JSON array of steps, run in order after the page loads:
//   {"type":"click","selector":"text=Send"}            css / text= / role= selectors
//   {"type":"fill","selector":"textarea","value":"hi"}
//   {"type":"press","selector":"textarea","key":"Enter"}
//   {"type":"wait","ms":5000}
//   {"type":"waitFor","selector":".message","timeoutMs":120000}
//   {"type":"waitForText","text":"done","timeoutMs":120000}
//   {"type":"goto","url":"https://..."}
//   {"type":"screenshot","name":"after-send"}
//   {"type":"text","selector":"main"}                   capture innerText of a selector into results.captures
//   {"type":"eval","js":"document.title"}               capture a JS expression result into results.captures
// Exit code: 0 = page reached and all actions ran, 2 = auth expired (login redirect / 401),
//            3 = navigation or action failure. The JSON is printed in every case.

import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // global install resolves via require, not ESM
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));

if (!args.url || !args['cookie-file']) {
  console.error('usage: ua_probe.mjs --url <url> --cookie-file <path> [--actions <json>] [--out <dir>]');
  process.exit(1);
}

const url = new URL(args.url);
const outDir = args.out || process.cwd();
const name = args.name || 'probe';
const waitMs = Number(args['wait-ms'] || 4000);
const timeoutMs = Number(args['timeout-ms'] || 60000);
fs.mkdirSync(outDir, { recursive: true });

function parseCookies(file, domain) {
  const raw = fs.readFileSync(file, 'utf8').trim().replace(/^Cookie:\s*/i, '');
  const parts = raw.includes('\n') ? raw.split(/\r?\n/) : raw.split(';');
  return parts.map(s => s.trim()).filter(Boolean).map(kv => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i).trim(), value: kv.slice(i + 1).trim(), domain, path: '/', secure: true, httpOnly: false, sameSite: 'Lax' };
  }).filter(c => c.name);
}

const result = {
  name, url: args.url, startedAt: new Date().toISOString(), status: 'UNKNOWN', finalUrl: null, title: null,
  httpStatus: null, authExpired: false, consoleErrors: [], failedRequests: [], apiErrors: [],
  visibleText: null, captures: [], screenshots: [], actionsRun: 0, error: null,
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: false });
await context.addCookies(parseCookies(args['cookie-file'], url.hostname));
const page = await context.newPage();
page.setDefaultTimeout(timeoutMs);

page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text().slice(0, 500)); });
page.on('requestfailed', r => result.failedRequests.push({ url: r.url().slice(0, 300), reason: r.failure()?.errorText }));
page.on('response', r => {
  const s = r.status();
  if (s === 401 || s === 403) result.authExpired = result.authExpired || r.url().startsWith(url.origin);
  if (s >= 400 && r.url().includes('/api/')) result.apiErrors.push({ status: s, url: r.url().slice(0, 300) });
});

async function shot(label) {
  const file = path.join(outDir, `${name}-${label}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false });
  result.screenshots.push(file);
}

function isLogin(u) { return /\/login(\?|$)/.test(u) || /returnTo=/.test(u); }

let exit = 0;
try {
  const resp = await page.goto(args.url, { waitUntil: 'domcontentloaded' });
  result.httpStatus = resp ? resp.status() : null;
  await page.waitForTimeout(waitMs);
  if (isLogin(page.url())) {
    result.authExpired = true;
  } else {
    const actions = args.actions ? JSON.parse(fs.readFileSync(args.actions, 'utf8')) : [];
    for (const a of actions) {
      switch (a.type) {
        case 'click': await page.locator(a.selector).first().click({ timeout: a.timeoutMs || timeoutMs }); break;
        case 'fill': await page.locator(a.selector).first().fill(a.value, { timeout: a.timeoutMs || timeoutMs }); break;
        case 'press': await page.locator(a.selector).first().press(a.key, { timeout: a.timeoutMs || timeoutMs }); break;
        case 'wait': await page.waitForTimeout(a.ms || 1000); break;
        case 'waitFor': await page.locator(a.selector).first().waitFor({ state: 'visible', timeout: a.timeoutMs || timeoutMs }); break;
        case 'waitForText': await page.getByText(a.text, { exact: false }).first().waitFor({ timeout: a.timeoutMs || timeoutMs }); break;
        case 'goto': await page.goto(a.url, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(waitMs); break;
        case 'screenshot': await shot(a.name || `step${result.actionsRun}`); break;
        case 'text': result.captures.push({ step: result.actionsRun, selector: a.selector, text: (await page.locator(a.selector).first().innerText()).slice(0, a.max || 8000) }); break;
        case 'eval': result.captures.push({ step: result.actionsRun, js: a.js, value: await page.evaluate(a.js) }); break;
        default: throw new Error(`unknown action type ${a.type}`);
      }
      result.actionsRun++;
      if (isLogin(page.url())) { result.authExpired = true; break; }
    }
  }
  result.finalUrl = page.url();
  result.title = await page.title().catch(() => null);
  result.visibleText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+\n/g, '\n').slice(0, 6000);
  await shot('final');
} catch (e) {
  result.error = String(e && e.message || e).slice(0, 1000);
  result.finalUrl = page.url();
  await shot('error').catch(() => {});
  exit = 3;
}

if (result.authExpired) { result.status = 'AUTH_EXPIRED'; exit = 2; }
else if (exit === 3) result.status = 'FAIL';
else result.status = 'OK';
result.finishedAt = new Date().toISOString();

await browser.close();
console.log(JSON.stringify(result, null, 2));
process.exit(exit);
