import { MEMBERS, FULL_NAMES, VOTERS, CATEGORIES, STAGES } from './shared.mjs';
import { RELAY_URL } from './config.mjs';
import { SIMCORP_LOGO } from './simcorp-logo.mjs';

const siteURL = new URL('./', location.href).href;
const apiOrigin = RELAY_URL.replace(/\/$/, '') || location.origin;
const app = document.querySelector('#app');
const connection = document.querySelector('#connection');
const notice = document.querySelector('#notice');
let session = null;
let current = null;
let events = null;
let busy = false;
let online = false;
let lastBackup = null;
let draft = Array(CATEGORIES.length).fill('');
let storageWarning = false;
let presentation = false;

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function announce(message) {
  notice.textContent = message;
  notice.hidden = !message;
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) {
    console.warn('Browser storage unavailable:', error);
    if (!storageWarning) announce('Browser storage is unavailable. Keep your invitation link and download recovery backups manually.');
    storageWarning = true;
  }
}
function load(key) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch (error) {
    console.warn('Could not read browser storage:', error);
    announce('Saved browser data could not be read. Use your invitation link or a downloaded backup.');
    return null;
  }
}
function setConnection(live, text) {
  online = live;
  connection.classList.toggle('live', live);
  connection.textContent = text;
}
async function request(path, method = 'GET', data, secret = session?.token) {
  if (!RELAY_URL && location.hostname.endsWith('.github.io')) {
    throw new Error('The voting relay is not configured. Set RELAY_URL in public/config.mjs to your Render HTTPS address, then redeploy GitHub Pages.');
  }
  if (RELAY_URL) {
    let url;
    try { url = new URL(RELAY_URL); }
    catch { throw new Error('RELAY_URL must be your Render HTTPS origin, without a path.'); }
    if (url.origin !== apiOrigin || url.protocol !== 'https:') {
      throw new Error('RELAY_URL must be your Render HTTPS origin, without a path.');
    }
  }
  const response = await fetch(`${apiOrigin}${path}`, {
    method,
    headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    let detail;
    try { detail = await response.json(); }
    catch { throw new Error(`Server returned ${response.status}. It may be waking up; please retry in a minute.`); }
    throw Object.assign(new Error(detail.error ?? `Request failed (${response.status}).`), { status: response.status });
  }
  return response.json();
}
const endpoint = action => `/api/rooms/${session.id}/${action}`;
const invitation = secret => `${siteURL}#room=${session.id}&key=${secret}`;
function setSession(value) {
  session = value;
  history.replaceState(null, '', `${siteURL}#room=${value.id}&key=${value.token}`);
}
async function confirmAction(title, text) {
  const dialog = document.querySelector('#confirmation');
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-text').textContent = text;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
function landing() {
  const saved = load('hygge-host');
  app.innerHTML = `
    <section class="hero">
      <div><p class="eyebrow">GOOD PEOPLE. GOOD THINGS. YEAR THREE.</p>
        <h1>Three years.<br>One <em>great</em><br>team.</h1>
        <p class="lede">Not just the things we’ve made.<br>The people we’ve become, together.<br>Let’s make a little room to celebrate Hygge.</p>
        <div class="button-row"><button data-action="create">Let’s celebrate <span aria-hidden="true">↗</span></button>${saved ? '<button class="secondary" data-action="resume">Resume as Ender</button>' : ''}</div>
        <p class="fine">9 good humans &nbsp; / &nbsp; 30 minutes together &nbsp; / &nbsp; 3 years of Hygge<br>Facilitated by Ender. Guests: open your personal invitation link.</p>
      </div>
      <div class="art" aria-label="Three years of Hygge"><span class="star one" aria-hidden="true">✳</span><span class="art-number">3</span><span class="star two" aria-hidden="true">✧</span><span class="art-label">YEARS OF HYGGE</span><span class="art-sticker">better<br>together</span></div>
    </section>
    <section class="agenda" aria-label="Our 30-minute celebration">${STAGES.map((stage, i) => `<div class="agenda-item"><span class="step">0${i + 1}</span><strong>${stage.name}</strong><p>${stage.minutes} minutes · ${['Settle in', 'Share a memory', 'Notice each other', 'A little applause', 'A wish for year four'][i]}</p></div>`).join('')}</section>
    <details class="restore"><summary>Recover a session from a backup</summary><p class="fine">Sessions live in server memory for up to 12 hours. If the server restarts, Ender can restore a downloaded JSON backup. Treat backups as private: they contain invitation keys and ballots.</p><label>Choose your recovery backup<input id="restore-file" type="file" accept=".json,application/json"></label></details>`;
}
function rules() {
  return `<details class="rules"><summary>How the awards work</summary><p>Choose one of the eight team members for every category. All nine of us can vote, including Ender. Self-voting is welcome; Ender is not an award recipient. You can revise and resubmit until voting closes.</p><p>The system chooses eight different categories and gives every eligible person exactly one award, maximizing the sum of votes for the eight selected person–category pairs. This is not fourteen independent popularity contests: someone may receive a category without having the most votes in that category. Six categories will go unawarded.</p><p>Equal-score outcomes use a random order fixed when the session begins. The result will not change on refresh or recovery. If votes are concentrated, a selected pair may have zero votes; the one-award-each guarantee takes priority. Ballots and vote counts are not shown to participants. This is a friendly, trust-based ceremony, not a secret-ballot election: the host’s recovery backup contains ballots. Keep personal invitation links private.</p></details>`;
}
function invitations() {
  return `<details class="panel"><summary>Host desk · personal invitations & recovery</summary>
    <p class="fine">Send each person only their own link in a private message. Open Ender’s link in a separate tab to cast your vote. Keep this host page and backups private; use the presentation view when sharing your screen.</p>
    <div class="invite-list">${VOTERS.map((name, i) => `<div class="invite"><strong>${name}</strong><div class="invite-actions"><button class="small secondary" data-action="invite" data-voter="${i}">Copy link<span class="sr-only"> for ${name}</span></button>${i === 8 ? `<a href="${invitation(current.backup.voterTokens[i])}" target="_blank" rel="noopener noreferrer">Vote ↗</a>` : ''}</div></div>`).join('')}</div>
    <div class="button-row recovery-actions"><button class="small secondary" data-action="backup">Download recovery backup</button><button class="small secondary" data-action="presentation">Presentation view</button><button class="small secondary" data-action="host-link">Copy host link</button></div>
    <p class="fine">Automatic recovery is saved in this browser after live updates. Download a backup before closing the tab. Server memory is temporary; sessions and recovery backups expire 12 hours after creation.</p>
    <div id="manual-link" class="manual-link" hidden><label>Link (select and copy)<input id="link-value" type="text" readonly></label></div>
    </details>`;
}
function gather() {
  return `<div class="stage-grid"><section class="panel green"><p class="eyebrow">THE PEOPLE MAKE THE PLACE</p><h2>Our kind of together.</h2><div class="names">${VOTERS.map(name => `<span class="name-chip">${name}</span>`).join('')}</div><p class="fine">Find your favourite drink. Put the to-do list down.<br>For the next half hour, this is the important thing.</p></section>
    <section class="panel"><p class="eyebrow">A SOFT LANDING</p><h2>One word to arrive.</h2><p>Go around the room: what’s one word that describes Hygge to you today?</p><p class="fine">Ender, start us off. There’s no perfect answer.<br>Allow about 15 seconds each, then raise a cup to year three.</p></section></div>`;
}
function remember() {
  return `<div class="prompts"><section class="prompt"><span class="symbol" aria-hidden="true">✦</span><h2>A moment that stayed.</h2><p>A small win, a shared laugh, or a day you still think about.</p></section><section class="prompt"><span class="symbol" aria-hidden="true">♡</span><h2>Someone who helped.</h2><p>When did a teammate make something a little easier?</p></section><section class="prompt"><span class="symbol" aria-hidden="true">↗</span><h2>Look how far we’ve come.</h2><p>What can we do together now that we couldn’t three years ago?</p></section></div><p class="fine">Take 2 minutes to think. Choose one prompt. Each person gets about 30 seconds to share, or pass.</p>`;
}
function tally() {
  return `<div class="vote-summary"><div><strong id="vote-count">${current.submitted} / 9</strong><p class="fine">ballots submitted · votes stay hidden</p></div><span class="fine">14 categories<br>8 unique awards</span></div>`;
}
function ballotStatus() {
  const matches = current.ballot && draft.every((person, i) => person === current.ballot[i]);
  return matches ? '✓ Your ballot is submitted. You may still revise it.' :
    `${draft.filter(p => p !== '').length} of 14 chosen · ${current.ballot ? 'changes not submitted' : 'not submitted yet'}`;
}
function vote() {
  if (current.host) return `${tally()}<section class="panel"><h2>A little noticing goes a long way.</h2><p>Everyone votes on their own device using their personal link. There’s no rush: think about the small, everyday things people do.</p><div class="names">${VOTERS.map((name, i) => `<span class="name-chip" data-attendance="${i}">${current.submittedVoters.includes(i) ? '✓ ' : '○ '}${name}</span>`).join('')}</div><p class="fine">Allow roughly six minutes for voting and two for final submissions. Ask for a thumbs-up before closing.</p></section>${rules()}`;
  const saved = load(`hygge-draft-${session.id}-${current.voter}`);
  const validDraft = value => Array.isArray(value) && value.length === CATEGORIES.length && value.every(p => p === '' || (Number.isInteger(p) && p >= 0 && p < MEMBERS.length));
  draft = validDraft(saved) ? saved : current.ballot ? [...current.ballot] : Array(CATEGORIES.length).fill('');
  return `${tally()}<p class="eyebrow">YOUR BALLOT · ${VOTERS[current.voter]}</p><p class="rules">Choose one person per category. You can nominate the same person in different categories and vote for yourself.</p>
    <form id="ballot"><div class="ballot-grid">${CATEGORIES.map(([name, description], i) => `<div class="ballot-item"><label for="category-${i}"><span class="category-number">${String(i + 1).padStart(2, '0')} / </span>${name}</label><p>${description}</p><select required id="category-${i}" name="category-${i}" data-category="${i}"><option value="">Choose someone…</option>${MEMBERS.map((person, p) => `<option value="${p}" ${draft[i] === p ? 'selected' : ''}>${person}</option>`).join('')}</select></div>`).join('')}</div>
    <div class="ballot-submit"><span id="ballot-status" class="fine">${ballotStatus()}</span><button type="submit">${current.ballot ? 'Update ballot' : 'Submit ballot'} ↗</button></div></form>${rules()}`;
}
function anniversaryLogo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="anniversary-logo" width="320" height="150" viewBox="0 0 320 150" role="img" aria-label="Hygge 3 Years, November 2026">
    <rect x="3" y="3" width="314" height="144" rx="72" fill="#f5f2e9" stroke="#a6b298" stroke-width="2"/>
    <rect x="10" y="10" width="300" height="130" rx="65" fill="none" stroke="#d2d8c7"/>
    <circle cx="76" cy="75" r="48" fill="#304d3d"/>
    <text x="76" y="90" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="64" fill="#f5f2e9">3</text>
    <path d="m112 29 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#b85636"/>
    <g fill="#304d3d" text-anchor="middle"><text x="204" y="65" font-family="Georgia,serif" font-size="39">Hygge</text>
    <text x="204" y="90" font-family="Arial,sans-serif" font-size="13" letter-spacing="5">YEARS</text>
    <path d="M149 103h110" stroke="#a6b298"/>
    <text x="204" y="121" font-family="Arial,sans-serif" font-size="11" letter-spacing="1">NOVEMBER 2026</text></g></svg>`;
}
function simcorpLogo() {
  return `<img class="simcorp-logo" src="${SIMCORP_LOGO}" alt="SimCorp" width="399" height="73">`;
}
function awardCard(award) {
  return `<article class="badge-card">${anniversaryLogo()}<p class="eyebrow">HYGGE HONOURS · YEAR THREE</p><h3>${FULL_NAMES[award.person]}</h3><p>${CATEGORIES[award.category][0]}</p>${simcorpLogo()}<button class="small secondary" data-action="svg" data-person="${award.person}">Save SVG</button><button class="small secondary" data-action="png" data-person="${award.person}">Save PNG</button></article>`;
}
function celebrate() {
  const award = current.awards.at(-1);
  return `${award ? `<section class="award-feature" aria-live="polite">${anniversaryLogo()}<p class="eyebrow">AWARD ${current.revealed} OF 8</p><h3>${CATEGORIES[award.category][0]}</h3><p>${CATEGORIES[award.category][1]}</p><h2>${FULL_NAMES[award.person]}</h2><p>A little more Hygge, because of you.</p>${simcorpLogo()}</section>` : `<section class="empty-awards"><p class="eyebrow">THE VOTES ARE IN</p><h2>Eight people. Eight moments to shine.</h2><p class="fine">Ender will reveal each award, one at a time.</p></section>`}
    ${current.host ? `<div class="button-row centred"><button data-action="reveal" ${current.revealed === 8 ? 'disabled' : ''}>${current.revealed === 0 ? 'Reveal the first award' : current.revealed === 8 ? 'Everyone celebrated ✓' : 'Reveal the next award'} ↗</button></div>` : ''}
    <section class="award-gallery" aria-label="Revealed awards">${current.awards.map(awardCard).join('')}</section>${rules()}`;
}
function closing() {
  return `<p class="closing-quote">“What’s one thing you hope we keep doing<br>in our next year together?”</p><p class="fine centre">One sentence each. Then a final toast from Ender.<br>Here’s to the work, the laughter, and looking out for each other.</p>
    <div class="button-row centred"><button data-action="sheet">Download all badges (SVG)</button><button class="secondary" data-action="print">Print / save as PDF</button></div>
    <h2 class="print-title">Hygge honours · Three years together</h2><section class="award-gallery" aria-label="All eight awards">${current.awards.map(awardCard).join('')}</section>`;
}
function render() {
  const stage = STAGES[current.stage];
  app.innerHTML = `<ol class="progress-nav" aria-label="Celebration progress">${STAGES.map((item, i) => `<li class="${i === current.stage ? 'active' : i < current.stage ? 'done' : ''}" ${i === current.stage ? 'aria-current="step"' : ''}><span>${i < current.stage ? '✓' : `0${i + 1}`}</span>${item.name}</li>`).join('')}</ol>
    <div class="stage-top"><div class="stage-heading"><p class="eyebrow">${stage.eyebrow}</p><h1 tabindex="-1">${stage.title}</h1><p class="lede">${stage.text}</p></div><div class="timer"><span id="timer">--:--</span><small>${stage.minutes}-minute chapter</small></div></div>
    ${[gather, remember, vote, celebrate, closing][current.stage]()}
    ${current.host ? `<div class="host-bar"><span class="fine">${['Start with a welcome, then move on when everyone has arrived.', 'Make space for everyone. A story can be one sentence.', 'Closing locks all ballots and assigns the eight unique awards.', 'Reveal all eight awards before moving to the final toast.', 'The badges are yours to keep. Download a recovery backup before leaving.'][current.stage]}</span>${current.stage < 4 ? `<button data-action="advance" ${current.stage === 3 && current.revealed < 8 ? 'disabled' : ''}>${current.stage === 2 ? 'Close voting & assign awards' : `Next: ${STAGES[current.stage + 1].name}`} ↗</button>` : ''}</div>
    ${presentation ? '<button class="secondary small presentation-toggle" data-action="presentation">Show host desk</button>' : invitations()}` : `<p class="fine participant-note">You’re here as ${VOTERS[current.voter]}. ${current.stage === 2 ? 'Your ballot is private in this interface.' : 'Your screen follows Ender’s presentation automatically.'}</p>`}`;
  tick();
}
function applyState(next) {
  const previous = current;
  if (previous?.id === next.id && previous.revision > next.revision) return;
  const stageChanged = previous && previous.stage !== next.stage;
  current = next;
  if (next.host) {
    lastBackup = next.backup;
    save(`hygge-backup-${session.id}`, lastBackup);
    save('hygge-host', session);
  }
  setConnection(true, next.host ? `Live · Ender’s host desk` : `Live · ${VOTERS[next.voter]}`);
  if (!previous || stageChanged || previous.revealed !== next.revealed) {
    render();
  } else if (next.stage === 2) {
    document.querySelector('#vote-count').textContent = `${next.submitted} / 9`;
    if (next.host) document.querySelectorAll('[data-attendance]').forEach(chip => {
      const voter = Number(chip.dataset.attendance);
      chip.textContent = `${next.submittedVoters.includes(voter) ? '✓ ' : '○ '}${VOTERS[voter]}`;
    });
    else document.querySelector('#ballot-status').textContent = ballotStatus();
  }
  if (stageChanged) {
    announce('');
    document.querySelector('h1')?.focus({ preventScroll: true });
    scrollTo({ top: 0, behavior: 'instant' });
  }
}
function tick() {
  if (!current) return;
  const node = document.querySelector('#timer');
  if (!node) return;
  const remaining = Math.max(0, STAGES[current.stage].minutes * 60 - Math.floor((Date.now() - current.stageStartedAt) / 1000));
  node.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  node.nextElementSibling.textContent = remaining ? `${STAGES[current.stage].minutes}-minute chapter` : 'Take your time';
}
function missingSession(message) {
  setConnection(false, 'Session needs recovery');
  events?.close();
  current = null;
  if (lastBackup?.id !== session.id) lastBackup = load(`hygge-backup-${session.id}`);
  const canRecover = lastBackup?.hostToken === session.token;
  app.innerHTML = `<section class="panel offline-panel"><p class="eyebrow">A SMALL PAUSE</p><h2>Let’s get everyone back together.</h2><p>${escape(message)}</p><p class="fine">The server may have restarted, or this invitation may be incorrect. Sessions expire after 12 hours. ${canRecover ? 'Your latest host backup is available in this browser. Restoring keeps the same invitation links.' : 'Ask Ender to restore the session. Your latest unsent ballot draft stays in this browser.'}</p><div class="button-row">${canRecover ? '<button data-action="recover">Restore latest browser backup</button><button class="secondary" data-action="backup">Download backup</button>' : ''}<button class="secondary" data-action="reconnect">Try reconnecting</button><a href="./">Return home</a></div></section>`;
}
async function synchronize() {
  if (!session) return;
  const activeSession = session;
  try {
    const next = await request(endpoint('state'));
    if (session !== activeSession) return false;
    applyState(next);
    return true;
  } catch (error) {
    if (session !== activeSession) return false;
    if (error.status === 404) missingSession(error.message);
    else {
      setConnection(false, 'Disconnected · retrying');
      announce(`${error.message} Your ballot draft is kept in this browser. Don’t close the host tab.`);
    }
    return false;
  }
}
async function connect() {
  events?.close();
  const activeSession = session;
  setConnection(false, 'Connecting…');
  if (!await synchronize()) return;
  if (session !== activeSession) return;
  events = new EventSource(`${apiOrigin}${endpoint('events')}?token=${encodeURIComponent(session.token)}`);
  events.onmessage = event => {
    if (session !== activeSession) return;
    try { applyState(JSON.parse(event.data)); }
    catch (error) {
      console.error('Live update failed:', error);
      announce('A live update could not be displayed. Reconnect or refresh the page.');
    }
  };
  events.onerror = () => {
    if (session === activeSession) setConnection(false, 'Disconnected · reconnecting…');
  };
}
async function copyLink(value) {
  try {
    await navigator.clipboard.writeText(value);
    announce('Link copied. Send it privately to the right person.');
  } catch (error) {
    console.warn('Clipboard unavailable:', error);
    const area = document.querySelector('#manual-link');
    if (area) {
      area.hidden = false;
      const input = document.querySelector('#link-value');
      input.value = value;
      input.focus();
      input.select();
    }
    announce('Clipboard access is unavailable. Select and copy the link shown in the host desk.');
  }
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function wrapped(text, limit = 30) {
  const lines = [''];
  for (const word of text.split(' ')) {
    if ((lines.at(-1) + ' ' + word).trim().length > limit) lines.push(word);
    else lines[lines.length - 1] = `${lines.at(-1)} ${word}`.trim();
  }
  return lines;
}
function badgeSVG(award) {
  const title = wrapped(CATEGORIES[award.category][0]);
  const name = FULL_NAMES[award.person];
  // Shrink long names so they stay inside the arch.
  const nameSize = Math.min(76, Math.floor(1050 / name.length));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760" viewBox="0 0 1000 760" role="img" aria-label="${escape(name)} — ${escape(CATEGORIES[award.category][0])}">
    <rect width="1000" height="760" rx="24" fill="#f5f2e9"/>
    <rect x="24" y="24" width="952" height="712" rx="16" fill="none" stroke="#a6b298" stroke-width="2"/>
    <rect x="36" y="36" width="928" height="688" rx="12" fill="none" stroke="#d2d8c7"/>
    <path d="M220 624V325a280 280 0 0 1 560 0v299" fill="#e6eada"/>
    <g transform="translate(340 55)">${anniversaryLogo()}</g>
    <g text-anchor="middle" fill="#304d3d"><text x="500" y="223" font-family="Arial,sans-serif" font-size="15" letter-spacing="5">HYGGE HONOURS · YEAR THREE</text>
    <text x="500" y="340" font-family="Georgia,serif" font-size="${nameSize}">${escape(name)}</text>
    <path d="M430 376h140" stroke="#a6b298"/>
    <text font-family="Georgia,serif" font-size="38">${title.map((line, i) => `<tspan x="500" y="${442 + i * 47}">${escape(line)}</tspan>`).join('')}</text>
    <text x="500" y="591" font-family="Georgia,serif" font-style="italic" font-size="23">A little more Hygge, because of you.</text>
    <text x="500" y="702" font-family="Arial,sans-serif" font-size="13" letter-spacing="4">THREE YEARS. ONE GREAT TEAM.</text></g>
    <image x="423" y="642" width="153" height="28" href="${SIMCORP_LOGO}"/>
    <g stroke="#879879" fill="none" stroke-width="3"><path d="M153 555q-46-85 0-170m-1 147q-38-4-36-34 31 0 36 34m-6-54q-31-11-21-37 28 6 21 37m-1-13q32-9 31-37-29 3-31 37m702 90q46-85 0-170m1 147q38-4 36-34-31 0-36 34m6-54q31-11 21-37-28 6-21 37m1-13q-32-9-31-37 29 3 31 37"/></g></svg>`;
}
async function badgeDownload(person, png) {
  const award = current.awards.find(item => item.person === person);
  if (!award) throw new Error('This award has not been revealed yet.');
  const blob = new Blob([badgeSVG(award)], { type: 'image/svg+xml' });
  const filename = `Hygge-${FULL_NAMES[person].replace(/[^a-z0-9]/gi, '-')}`;
  if (!png) return download(blob, `${filename}.svg`);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 1520;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image export is unavailable in this browser. Please use SVG.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!result) throw new Error('PNG export failed. Please use SVG.');
    download(result, `${filename}.png`);
  } finally { URL.revokeObjectURL(url); }
}
async function action(name, button) {
  if (name === 'create') {
    const value = await request('/api/rooms', 'POST', {});
    current = null;
    setSession(value);
    await connect();
  } else if (name === 'resume') {
    setSession(load('hygge-host'));
    await connect();
  } else if (name === 'reconnect') {
    await connect();
  } else if (name === 'recover') {
    const value = await request('/api/restore', 'POST', lastBackup, lastBackup.hostToken);
    current = null;
    setSession(value);
    await connect();
    announce('Session restored. Ask everyone to reconnect; the original invitations still work.');
  } else if (name === 'backup') {
    if (!lastBackup) throw new Error('No host backup is available yet.');
    download(new Blob([JSON.stringify(lastBackup, null, 2)], { type: 'application/json' }), `hygge-recovery-${lastBackup.id}.json`);
  } else if (name === 'invite' || name === 'host-link') {
    await copyLink(invitation(name === 'invite' ? current.backup.voterTokens[Number(button.dataset.voter)] : session.token));
  } else if (name === 'presentation') {
    presentation = !presentation;
    render();
  } else if (name === 'advance' || name === 'reveal') {
    if (!online) throw new Error('Reconnect before changing the presentation.');
    let confirmIncomplete = false;
    const expectedStage = current.stage;
    const expectedRevealed = current.revealed;
    if (name === 'advance' && current.stage === 2) {
      if (!current.submitted) throw new Error('At least one completed ballot is required.');
      confirmIncomplete = current.submitted < VOTERS.length;
      if (!await confirmAction('Close voting?', `${current.submitted} of 9 ballots are submitted. ${confirmIncomplete ? 'Some people have not submitted. ' : ''}This locks all votes and assigns exactly one award to each of the eight eligible people. Voting cannot be reopened.`)) return;
    }
    applyState(await request(endpoint(name), 'POST', { expectedStage, expectedRevealed, confirmIncomplete }));
  } else if (name === 'svg' || name === 'png') {
    await badgeDownload(Number(button.dataset.person), name === 'png');
  } else if (name === 'sheet') {
    const badges = current.awards.map((award, i) => `<g transform="translate(${(i % 2) * 1040},${Math.floor(i / 2) * 800})">${badgeSVG(award)}</g>`).join('');
    download(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="2080" height="3200" viewBox="0 0 2080 3200"><rect width="2080" height="3200" fill="#fff"/>${badges}</svg>`], { type: 'image/svg+xml' }), 'Hygge-all-eight-badges.svg');
  } else if (name === 'print') {
    print();
  }
}
app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || busy) return;
  busy = true;
  button.disabled = true;
  try { await action(button.dataset.action, button); }
  catch (error) { announce(error.message); }
  finally { busy = false; if (button.isConnected) button.disabled = false; }
});
app.addEventListener('change', async event => {
  if (event.target.matches('[data-category]')) {
    draft[Number(event.target.dataset.category)] = event.target.value === '' ? '' : Number(event.target.value);
    save(`hygge-draft-${session.id}-${current.voter}`, draft);
    document.querySelector('#ballot-status').textContent = ballotStatus();
  }
  if (event.target.id === 'restore-file') {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 65536) throw new Error('This backup is too large. Choose the original Hygge recovery JSON.');
      const backup = JSON.parse(await file.text());
      const value = await request('/api/restore', 'POST', backup, backup.hostToken);
      current = null;
      setSession(value);
      await connect();
      announce('Session restored. Original invitation links still work.');
    } catch (error) { announce(`Could not restore: ${error.message}`); }
  }
});
app.addEventListener('submit', async event => {
  if (event.target.id !== 'ballot') return;
  event.preventDefault();
  if (busy) return;
  busy = true;
  const button = event.target.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    if (!online) throw new Error('You are offline. Your draft is saved; reconnect and submit again.');
    const next = await request(endpoint('ballot'), 'POST', { ballot: draft });
    applyState(next);
    if (current.stage === 2) {
      document.querySelector('#ballot-status').textContent = '✓ Your ballot is submitted. You may still revise it.';
      button.textContent = 'Update ballot ↗';
    }
    announce('Ballot submitted. Thank you for noticing the good.');
  } catch (error) { announce(error.message); }
  finally { busy = false; button.disabled = false; }
});
setInterval(tick, 1000);
// A periodic inbound HTTP request also keeps an active free-hosted session awake.
setInterval(async () => {
  if (session && !busy) {
    const connected = await synchronize();
    if (connected && (!events || events.readyState === EventSource.CLOSED)) await connect();
  }
}, 25000);
async function openInvitation() {
  events?.close();
  current = null;
  session = null;
  lastBackup = null;
  presentation = false;
  const params = new URLSearchParams(location.hash.slice(1));
  if (/^[A-F0-9]{8}$/.test(params.get('room') ?? '') && /^[a-f0-9]{48}$/.test(params.get('key') ?? '')) {
    session = { id: params.get('room'), token: params.get('key') };
    app.innerHTML = '<section class="panel offline-panel"><h2>Making a little room…</h2><p>Connecting to Hygge. A free server may take a minute to wake up.</p><button class="secondary" data-action="reconnect">Retry connection</button></section>';
    await connect();
  } else {
    setConnection(false, 'A little room for us');
    landing();
    if (location.hash) announce('This invitation link looks incomplete. Please ask Ender to resend it.');
  }
}
addEventListener('hashchange', openInvitation);
await openInvitation();
