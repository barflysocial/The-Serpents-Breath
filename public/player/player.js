const APP_META = {
  templefeed: ['🕵️','Temple Feed'],
  phone: ['⌚','Oxygen Monitor'],
  messages: ['📡','Field Comms'],
  maps: ['🧭','Temple Map'],
  bank: ['⚖️','Balance'],
  photos: ['🔥','Torch View'],
  social: ['🐍','Serpent Glyphs'],
  contacts: ['🎓','Research Team'],
  notes: ['🔤','Translations'],
  files: ['📐','Physics Files'],
  browser: ['🌌','Astronomy'],
  archaeologistNotes: ['🗒️','Field Notes'],
  accuse: ['🚪','Escape']
};
const BARFLY_APP_URL = location.origin + '/player/';
const $ = id => document.getElementById(id);

let state = null;
let playerId = localStorage.getItem('archaeologistPlayerId') || '';
let currentApp = null;
let ws = null;
let pollTimer = null;
let previousCounts = {};
let previousHostMessageCount = 0;
let dialogQueue = [];
let dialogOpen = false;
let activeSessionKey = '';
let splashTimer = null;
let imageCache = {};
let lastBadgeKey = '';
let answerReviewOpen = false;
let templeLogicOpen = false;
let activeDialogAction = null;
let rsvpSessions = [];
let selectedRsvpSessionCode = '';
const TERMS_STORAGE_KEY = 'serpentsBreathTermsAccepted_v1';
let pendingTermsAction = null;
let pendingTermsOptions = { force: false, persist: true };
let termsAcceptedForCurrentAction = false;
let currentAccessPreviewIsDemo = false;
let currentAccessPreviewCode = '';
let lastStoryBriefingKey = '';
let archaeologistNotes = defaultArchaeologistNotes();
let archaeologistNotesLoadedFor = '';
let archaeologistNotesSaveTimer = null;
let archaeologistNotesSaveStatus = '';
let archaeologistNotesSaving = false;
let archaeologistNotesUiMountedKey = '';
let archaeologistNotesRemoteLoaded = false;
let serverClockOffsetMs = 0;
let lobbyCountdownTimer = null;
let lobbyTutorialAcknowledged = false;
let checkpointPopupQuestionId = '';
let checkpointPopupDismissed = {};
let checkpointPopupSelected = '';
let checkpointPopupSelections = {};
let checkpointPopupIsSubmitting = false;
const HOST_ISSUE_MAILTO = 'mailto:INFO@BARFLY.SOCIAL?subject=Serpents%20Breath%20Game%20Issue';

const params = new URLSearchParams(location.search);
if (params.get('access')) $('accessCode').value = params.get('access').toUpperTemple();
else $('accessCode').value = '';

if ($('rsvpFirstName') && localStorage.getItem('archaeologistFirstName')) $('rsvpFirstName').value = localStorage.getItem('archaeologistFirstName');
if ($('rsvpInstagram') && localStorage.getItem('archaeologistInstagram')) $('rsvpInstagram').value = localStorage.getItem('archaeologistInstagram');
if ($('rsvpContact') && localStorage.getItem('archaeologistContact')) $('rsvpContact').value = localStorage.getItem('archaeologistContact');

$('joinBtn').onclick = async () => {
  const isDemo = await isCurrentAccessDemo();
  requireTermsAcceptance(join, { force: isDemo, persist: !isDemo });
};
$('rsvpBtn').onclick = () => requireTermsAcceptance(() => { setIntroStage('rsvp'); loadRsvpSessions(); });
if ($('myRsvpBtn')) $('myRsvpBtn').onclick = () => setIntroStage('myRsvp');
if ($('myRsvpBackBtn')) $('myRsvpBackBtn').onclick = () => setIntroStage('title');
if ($('findMyRsvpBtn')) $('findMyRsvpBtn').onclick = findMyRsvp;
$('rsvpBackBtn').onclick = () => setIntroStage('title');
if ($('rsvpDateBackBtn')) $('rsvpDateBackBtn').onclick = () => setIntroStage('title');
$('submitRsvpBtn').onclick = () => requireTermsAcceptance(submitRsvp);
$('rsvpChangeSessionBtn').onclick = showRsvpBrowser;
document.addEventListener('click', event => {
  const copyBtn = event.target?.closest?.('[data-copy-code]');
  if (copyBtn) {
    copyRsvpCode(copyBtn.getAttribute('data-copy-code'));
    return;
  }
  const checkInBtn = event.target?.closest?.('[data-rsvp-checkin-code]');
  if (checkInBtn) {
    checkInNowFromRsvp(checkInBtn.getAttribute('data-rsvp-checkin-code'));
  }
});
['rsvpDateFilter'].forEach(id => { if ($(id)) $(id).addEventListener('change', renderRsvpBrowser); });
$('helpBtn').onclick = () => openHostIssuePopup();
$('accuseHelpBtn').onclick = () => openHostIssuePopup();
if ($('helpLobbyBtn')) $('helpLobbyBtn').onclick = () => openHostIssuePopup();
if ($('lobbyTutorialGotItBtn')) $('lobbyTutorialGotItBtn').onclick = acknowledgeLobbyTutorial;
if ($('lobbyTutorialReviewBtn')) $('lobbyTutorialReviewBtn').onclick = reviewLobbyTutorial;
if ($('hostIssueCloseBtn')) $('hostIssueCloseBtn').onclick = () => closeHostIssuePopup();
if ($('emailHostBtn')) $('emailHostBtn').href = HOST_ISSUE_MAILTO;
if ($('checkpointPopupClose')) $('checkpointPopupClose').onclick = closeCheckpointPopup;
if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').onclick = submitCheckpointPopup;
$('submitAccuseBtn').onclick = submitEscape;
$('dialogOkBtn').onclick = dismissDialog;
$('dialogViewBtn').onclick = () => { const action = activeDialogAction; dismissDialog(); if (typeof action === 'function') action(); };
if ($('enterInvestigationBtn')) $('enterInvestigationBtn').onclick = () => requireTermsAcceptance(() => setIntroStage('join'));
if ($('shareGameBtn')) $('shareGameBtn').onclick = openShareLinkModal;
if ($('closeShareLinkBtn')) $('closeShareLinkBtn').onclick = closeShareLinkModal;
if ($('copyShareLinkBtn')) $('copyShareLinkBtn').onclick = copyShareLink;
if ($('nativeShareBtn')) $('nativeShareBtn').onclick = nativeShareGameLink;
$('backToTitleBtn').onclick = () => setIntroStage('title');
$('detailHomeBtn').onclick = goHomeDashboard;
$('accuseHomeBtn').onclick = goHomeDashboard;
$('revealReturnBtn').onclick = returnToExternalApp;
$('findNewGameBtn').onclick = findNewGame;
if ($('reviewAnswersBtn')) $('reviewAnswersBtn').onclick = toggleAnswerReview;
if ($('reviewTempleLogicBtn')) $('reviewTempleLogicBtn').onclick = toggleTempleLogic;
$('shareBadgeBtn').onclick = shareBadge;
$('downloadBadgeBtn').onclick = downloadBadge;
if ($('termsAgreeBtn')) $('termsAgreeBtn').onclick = acceptTermsAndContinue;
if ($('termsCancelBtn')) $('termsCancelBtn').onclick = closeTermsOverlay;
$('accessCode').addEventListener('blur', () => { const code = $('accessCode').value.trim().toUpperTemple(); if (code.length >= 5) loadAccessPreview(code); });
$('accessCode').addEventListener('input', () => { const code = $('accessCode').value.trim().toUpperTemple(); if (code.length >= 5) loadAccessPreview(code); else updateLevelLabels(null); });
document.addEventListener('click', event => {
  const option = event.target?.closest?.('.choiceOption');
  if (!option) return;
  const input = option.querySelector('input[type="radio"]');
  if (!input || input.disabled) return;

  // Make the entire answer card reliably selectable on phones and desktop.
  // Prevent the label's default click behavior from fighting the manual selection.
  event.preventDefault();
  input.checked = true;

  if (option.classList.contains('checkpointPopupChoice')) {
    checkpointPopupSelected = input.value;
    rememberCheckpointPopupSelection(checkpointPopupQuestionId, input.value);
    syncCheckpointPopupSelection();
    return;
  }

  syncChoiceHighlights();
  saveQuestionAnswer(input).catch(() => {
    if ($('accuseResult')) $('accuseResult').textContent = 'Answer selected, but it could not be saved. Check your connection and try again.';
  });
});
document.addEventListener('change', event => {
  const name = String(event.target?.name || '');
  if (name.startsWith('checkpoint-popup-')) {
    checkpointPopupSelected = event.target.value;
    const qid = name.replace('checkpoint-popup-', '') || checkpointPopupQuestionId;
    rememberCheckpointPopupSelection(qid, event.target.value);
    syncCheckpointPopupSelection();
    return;
  }
  if (name.startsWith('accuse-')) {
    syncChoiceHighlights();
    saveQuestionAnswer(event.target).catch(() => {
      if ($('accuseResult')) $('accuseResult').textContent = 'Answer selected, but it could not be saved. Check your connection and try again.';
    });
  }
});

document.addEventListener('input', event => {
  const field = event.target?.dataset?.noteField;
  if (!field) return;
  archaeologistNotes[field] = event.target.value;
  saveArchaeologistNotesLocal();
  scheduleArchaeologistNotesSave();
});



function getGameShareUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function openShareLinkModal() {
  const shareUrl = getGameShareUrl();
  if ($('shareLinkInput')) $('shareLinkInput').value = shareUrl;
  if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Scan or share this link so players can open the game.';
  if ($('shareQrImg')) {
    $('shareQrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(shareUrl)}`;
  }
  $('shareLinkOverlay')?.classList.remove('hidden');
}

function closeShareLinkModal() {
  $('shareLinkOverlay')?.classList.add('hidden');
}

async function copyShareLink() {
  const shareUrl = getGameShareUrl();
  try {
    await navigator.clipboard.writeText(shareUrl);
    if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Link copied.';
  } catch (_err) {
    if ($('shareLinkInput')) {
      $('shareLinkInput').focus();
      $('shareLinkInput').select();
    }
    if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Copy the highlighted link manually.';
  }
}

async function nativeShareGameLink() {
  const shareUrl = getGameShareUrl();
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'The Serpent’s Breath',
        text: 'RSVP or join The Serpent’s Breath: A 30-Minute Digital Escape Room.',
        url: shareUrl
      });
      if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Share sheet opened.';
      return;
    } catch (_err) {}
  }
  await copyShareLink();
}

function hasAcceptedTerms() {
  return termsAcceptedForCurrentAction || localStorage.getItem(TERMS_STORAGE_KEY) === 'yes';
}

async function isCurrentAccessDemo() {
  const code = $('accessCode')?.value?.trim?.().toUpperTemple() || '';
  if (!code) return false;
  if (currentAccessPreviewCode === code) return Boolean(currentAccessPreviewIsDemo);
  try {
    const preview = await api(`/api/access/${encodeURIComponent(code)}/preview`);
    currentAccessPreviewCode = code;
    currentAccessPreviewIsDemo = Boolean(preview.demoMode);
    updateLevelLabels(preview);
    return currentAccessPreviewIsDemo;
  } catch (_err) {
    currentAccessPreviewCode = code;
    currentAccessPreviewIsDemo = false;
    return false;
  }
}

function requireTermsAcceptance(nextAction, options = {}) {
  const opts = { force: false, persist: true, ...options };
  if (!opts.force && hasAcceptedTerms()) {
    if (typeof nextAction === 'function') nextAction();
    return;
  }
  pendingTermsAction = nextAction;
  pendingTermsOptions = opts;
  if ($('termsAcceptCheck')) $('termsAcceptCheck').checked = false;
  if ($('termsError')) $('termsError').textContent = '';
  $('termsOverlay').classList.remove('hidden');
}

function acceptTermsAndContinue() {
  if (!$('termsAcceptCheck')?.checked) {
    $('termsError').textContent = 'You must check the acknowledgment box before continuing.';
    return;
  }
  const opts = pendingTermsOptions || { force: false, persist: true };
  if (opts.persist) localStorage.setItem(TERMS_STORAGE_KEY, 'yes');
  termsAcceptedForCurrentAction = true;
  $('termsOverlay')?.classList.add('hidden');
  const next = pendingTermsAction;
  pendingTermsAction = null;
  pendingTermsOptions = { force: false, persist: true };
  if (typeof next === 'function') {
    Promise.resolve(next()).finally(() => { termsAcceptedForCurrentAction = false; });
  } else {
    termsAcceptedForCurrentAction = false;
  }
}

function closeTermsOverlay() {
  $('termsOverlay')?.classList.add('hidden');
  pendingTermsAction = null;
  pendingTermsOptions = { force: false, persist: true };
  termsAcceptedForCurrentAction = false;
}

startIntro();
if (params.get('access')) loadAccessPreview(params.get('access').toUpperTemple());

function startIntro() {
  clearTimeout(splashTimer);
  setIntroStage('splash');
  splashTimer = setTimeout(() => setIntroStage('title'), 2400);
}

function setIntroStage(stage) {
  toggleScreen('splashScreen', stage === 'splash');
  toggleScreen('titleScreen', stage === 'title');
  toggleScreen('rsvpScreen', stage === 'rsvp');
  toggleScreen('myRsvpScreen', stage === 'myRsvp');
  toggleScreen('joinScreen', stage === 'join');
}

function toggleScreen(id, yes) {
  $(id).classList.toggle('hidden', !yes);
  $(id).classList.toggle('visible', yes);
}

function goHomeDashboard() {
  currentApp = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function returnToExternalApp() {
  location.href = BARFLY_APP_URL;
}

function findNewGame() {
  try { if (ws) ws.close(); } catch (_err) {}
  ws = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  state = null;
  currentApp = null;
  activeSessionKey = '';
  $('appTopbar').classList.add('hidden');
  $('appMain').classList.add('hidden');
  $('introRoot').classList.remove('hidden');
  setIntroStage('rsvp');
  loadRsvpSessions();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateLevelLabels(s = state) {
  const label = s?.difficultyLabel || s?.levelLabel || 'DIFFICULTY SET BY HOST';
  const diff = s?.levelLabel || s?.difficulty || '';
  if ($('titleDifficultyBadge')) $('titleDifficultyBadge').textContent = label;
  if ($('topbarSubtitle')) $('topbarSubtitle').textContent = `Barfly Social Presents · Chichén Itzá${diff ? ` · ${diff}` : ''}`;
}

async function loadAccessPreview(code) {
  try {
    const normalizedCode = String(code || '').trim().toUpperTemple();
    const preview = await api(`/api/access/${encodeURIComponent(normalizedCode)}/preview`);
    currentAccessPreviewCode = normalizedCode;
    currentAccessPreviewIsDemo = Boolean(preview.demoMode);
    updateLevelLabels(preview);
  } catch (_err) {
    currentAccessPreviewCode = String(code || '').trim().toUpperTemple();
    currentAccessPreviewIsDemo = false;
  }
}


async function loadRsvpSessions() {
  const msg = $('rsvpMessage');
  msg.textContent = 'Loading available investigations...';
  selectedRsvpSessionCode = '';
  if ($('rsvpSession')) $('rsvpSession').value = '';
  showRsvpBrowser();
  try {
    rsvpSessions = await api('/api/rsvp-sessions');
    buildRsvpFilters();
    renderRsvpBrowser();
  } catch (err) {
    rsvpSessions = [];
    $('rsvpShowtimeList').innerHTML = '<p class="muted">Unable to load available investigations.</p>';
    msg.textContent = err.message || 'Unable to load RSVP sessions.';
  }
}

function buildRsvpFilters() {
  fillFilter('rsvpDateFilter', rsvpSessions.map(s => s.dateLabel || 'Date TBD'), 'Choose Date');
  const dateEl = $('rsvpDateFilter');
  if (dateEl && !dateEl.value && dateEl.options.length > 1) {
    dateEl.selectedIndex = 1;
  }
}

function fillFilter(id, values, allLabel) {
  const el = $(id);
  if (!el) return;
  const unique = [...new Set(values.filter(Boolean))];
  el.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>` + unique.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function renderRsvpBrowser() {
  const msg = $('rsvpMessage');
  const list = $('rsvpShowtimeList');
  const date = $('rsvpDateFilter')?.value || '';
  if (!rsvpSessions.length) {
    list.innerHTML = '<p class="muted">No RSVP dates are available yet. Check back after the host creates upcoming sessions.</p>';
    msg.textContent = 'No RSVP sessions are available yet.';
    return;
  }
  if (!date) {
    list.innerHTML = '<p class="muted">Choose a date to see available sessions.</p>';
    msg.textContent = 'Choose a date first.';
    return;
  }
  const filtered = rsvpSessions.filter(item => item.dateLabel === date);
  if (!filtered.length) {
    list.innerHTML = '<p class="muted">No sessions are available on this date. Choose another date.</p>';
    msg.textContent = 'No sessions are available for the selected date.';
    return;
  }
  const openCount = filtered.filter(item => item.status !== 'soldout' && Number(item.seatsAvailable ?? item.spotsAvailable ?? 0) > 0).length;
  list.innerHTML = `
    <div class="showtimeDateGroup activeDateGroup">
      <h3>${escapeHtml(date)}</h3>
      <p class="dateAvailabilitySummary">${openCount} available session${openCount === 1 ? '' : 's'} on this date</p>
      ${filtered.map(showtimeCardHtml).join('')}
    </div>`;
  msg.textContent = 'Tap an available time to reserve your archaeologist spot.';
  list.querySelectorAll('[data-session-code]').forEach(btn => {
    btn.addEventListener('click', () => selectRsvpSession(btn.dataset.sessionCode));
  });
}

function groupBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}

function showtimeCardHtml(item) {
  const left = Number(item.seatsAvailable ?? item.spotsAvailable ?? 0);
  const soldOut = item.status === 'soldout' || left <= 0;
  const status = soldOut ? 'Sold Out' : `${left} seats left`;
  const buttonLabel = soldOut ? 'Sold Out' : 'Select';
  const disabled = soldOut ? 'disabled' : '';
  const eventType = item.eventType === 'free' ? 'Free Event' : (item.ticketPrice ? `Paid Event · $${item.ticketPrice}` : 'Paid Event');
  return `<article class="showtimeCard">
    <div>
      <div class="time">${escapeHtml(item.timeLabel || 'Time TBD')}</div>
      <h4>${escapeHtml(item.mysteryTitle || item.mystery || 'The Serpent’s Breath')}</h4>
      <p>${escapeHtml(item.levelLabel || item.difficultyLabel || item.difficulty || 'Skill level TBD')} · ${escapeHtml(item.venue || 'Chichén Itzá')}</p>
      <div class="statusPills"><span class="pill ${soldOut ? '' : 'good'}">${escapeHtml(status)}</span><span class="pill">${escapeHtml(eventType)}</span><span class="pill">${escapeHtml(String(item.eventDurationMinutes || 45))} min</span><span class="pill">${escapeHtml(item.tableName || 'Session')}</span></div>
    </div>
    <button type="button" class="showtimeBtn" data-session-code="${escapeHtml(item.sessionCode)}" ${disabled}>${buttonLabel}</button>
  </article>`;
}

function selectRsvpSession(code) {
  const item = rsvpSessions.find(s => s.sessionCode === code);
  if (!item) return;
  selectedRsvpSessionCode = code;
  $('rsvpSession').value = code;
  $('selectedSessionCard').innerHTML = `<div class="time">Selected Showtime</div>
    <h3>${escapeHtml(item.mysteryTitle || item.mystery || 'The Serpent’s Breath')}</h3>
    <p><b>${escapeHtml(item.dateLabel || 'Date TBD')} · ${escapeHtml(item.timeLabel || 'Time TBD')}</b></p>
    <p>${escapeHtml(item.levelLabel || item.difficultyLabel || item.difficulty || 'Skill Level TBD')} · ${escapeHtml(item.venue || 'Chichén Itzá • Baton Rouge, Louisiana')}</p>
    <p class="mini">${escapeHtml(item.eventType === 'free' ? 'Free Event' : (item.ticketPrice ? `Paid Event · $${item.ticketPrice}` : 'Paid Event'))} · ${escapeHtml(String(item.eventDurationMinutes || 45))}-minute session · ${escapeHtml(String(item.seatsAvailable ?? item.spotsAvailable ?? 0))} seats left out of ${escapeHtml(String(item.playerCap || 25))}</p>`;
  $('rsvpBrowserPanel').classList.add('hidden');
  $('rsvpReservePanel').classList.remove('hidden');
  $('rsvpMessage').textContent = 'Enter your RSVP information. Instagram is optional.';
  setTimeout(() => $('rsvpFirstName')?.focus(), 80);
}

function showRsvpBrowser() {
  selectedRsvpSessionCode = '';
  if ($('rsvpSession')) $('rsvpSession').value = '';
  $('rsvpBrowserPanel').classList.remove('hidden');
  $('rsvpReservePanel').classList.add('hidden');
  $('rsvpMessage').textContent = 'Choose a date and select an available investigation.';
}

async function submitRsvp() {
  const msg = $('rsvpMessage');
  if (msg) msg.textContent = '';
  const sessionCode = selectedRsvpSessionCode || $('rsvpSession')?.value || '';
  const firstName = $('rsvpFirstName').value.trim();
  const contactRaw = $('rsvpContact').value.trim();
  const phone = normalizePhoneInput(contactRaw);
  const instagram = $('rsvpInstagram').value.trim();
  if (!sessionCode) { if (msg) msg.textContent = 'Choose a showtime before reserving.'; return; }
  if (!firstName || phone.length !== 10) { if (msg) msg.textContent = 'Enter your first name and a valid 10-digit phone number.'; return; }
  try {
    const data = await api('/api/rsvps', { method: 'POST', body: { sessionCode, firstName, phone, contact: phone, socialMedia: instagram, instagram, termsAccepted: hasAcceptedTerms() } });
    localStorage.setItem('archaeologistFirstName', firstName);
    localStorage.setItem('archaeologistContact', phone);
    localStorage.setItem('archaeologistInstagram', instagram);
    const code = data.rsvp?.accessCode || data.sharedAccessCode || '';
    renderRsvpCodeBox(code, data.eventType, data.ticketPrice, data.paymentPending);
    if (data.paymentPending) {
      msg.innerHTML = `✅ RSVP saved. Your archaeologist spot is reserved.<br><b>${escapeHtml(data.ticketPrice ? `Paid Event · $${data.ticketPrice}` : 'Paid Event')}</b><br>Please see the host to complete payment and receive your check-in code.`;
    } else if (code) {
      msg.innerHTML = `✅ RSVP saved. Your archaeologist spot is reserved.<br><b>${escapeHtml(data.eventType === 'free' ? 'Free Event' : 'Paid Event')}</b>`;
    } else {
      msg.innerHTML = '✅ RSVP saved. Your archaeologist spot is reserved. Please see the host for your check-in code.';
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

function normalizePhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.slice(0, 10);
}


function renderRsvpCodeBox(code, eventType = 'paid', ticketPrice = '', paymentPending = false) {
  const box = $('rsvpCodeBox');
  if (!box) return;
  box.classList.remove('hidden');
  if (paymentPending) {
    box.innerHTML = `
      <div class="time">RESERVATION SAVED</div>
      <h3>Paid Event${ticketPrice ? ` · $${escapeHtml(ticketPrice)}` : ''}</h3>
      <p class="notice">Your spot is reserved. Please see the host to complete payment and receive your 5-digit check-in code.</p>
    `;
    return;
  }
  if (!code) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="time">${eventType === 'free' ? 'FREE EVENT' : 'YOUR CHECK-IN CODE'}</div>
    <div class="bigRsvpCode">${escapeHtml(code)}</div>
    <div class="row" style="justify-content:center; gap:10px; flex-wrap:wrap;">
      <button class="secondary" type="button" data-copy-code="${escapeHtml(code)}">Copy Code</button>
      <button type="button" data-rsvp-checkin-code="${escapeHtml(code)}">Play Now</button>
    </div>
    <p class="mini">Tap Play Now to use this reservation automatically, or copy your 5-digit code and enter it later from My RSVP.</p>
  `;
}

async function copyRsvpCode(code) {
  const msg = $('rsvpMessage');
  try {
    await navigator.clipboard.writeText(code || '');
    if (msg) msg.textContent = 'Code copied.';
  } catch (_err) {
    if (msg) msg.textContent = 'Copy failed. Press and hold the code to copy it manually.';
  }
}

async function findMyRsvp() {
  const msg = $('myRsvpMessage');
  const result = $('myRsvpResult');
  const lookup = $('myRsvpLookup')?.value?.trim() || '';
  if (msg) msg.textContent = '';
  if (result) { result.classList.add('hidden'); result.innerHTML = ''; }
  if (!lookup) { if (msg) msg.textContent = 'Enter your phone number or check-in code.'; return; }
  try {
    const data = await api('/api/rsvps/lookup', { method: 'POST', body: { lookup } });
    const code = data.accessCode || data.rsvp?.accessCode || '';
    const session = data.session || {};
    const pending = Boolean(data.paymentPending);
    if (result) {
      result.classList.remove('hidden');
      result.innerHTML = `
        <div class="time">RSVP FOUND</div>
        <h3>${escapeHtml(data.rsvp?.displayName || data.rsvp?.firstName || 'Archaeologist')}</h3>
        <p><b>Session:</b> ${escapeHtml(session.tableName || session.truthPackTitle || 'The Serpent’s Breath')}</p>
        <p><b>Game Time:</b> ${escapeHtml([session.eventDateLabel, session.eventTimeLabel].filter(Boolean).join(' · ') || 'Time TBD')}</p>
        <p><b>Event:</b> ${escapeHtml(session.eventPriceLabel || (session.eventType === 'free' ? 'Free Event' : 'Paid Event'))}</p>
        <p><b>Status:</b> ${escapeHtml(data.rsvp?.status || 'RSVP’d')}</p>
        ${pending ? '<p class="notice">Payment is pending. Please see the host to complete payment and receive your 5-digit check-in code.</p>' : (code ? `<div class="time">YOUR CHECK-IN CODE</div><div class="bigRsvpCode">${escapeHtml(code)}</div>` : '<p class="notice">No check-in code is available yet. Please see the host.</p>')}
        <div class="row" style="justify-content:center; gap:10px; flex-wrap:wrap;">
          ${(!pending && code) ? `<button class="secondary" type="button" data-copy-code="${escapeHtml(code)}">Copy Code</button><button type="button" data-rsvp-checkin-code="${escapeHtml(code)}">Play Now</button>` : ''}
        </div>
      `;
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

async function checkInNowFromRsvp(code) {
  const msg = $('rsvpMessage');
  const cleanCode = String(code || '').trim().toUpperTemple();
  if (!cleanCode) {
    if (msg) msg.textContent = 'No check-in code is available yet.';
    return;
  }
  if ($('accessCode')) $('accessCode').value = cleanCode;
  if (msg) msg.textContent = 'Opening your game...';
  await join(cleanCode, msg);
}

function api(path, options = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  });
}

async function join(accessCodeOverride = '', messageEl = null) {
  const errorTarget = messageEl || $('joinError');
  if (errorTarget) errorTarget.textContent = '';
  if ($('joinError') && messageEl !== $('joinError')) $('joinError').textContent = '';
  const accessCode = String(accessCodeOverride || $('accessCode').value || '').trim().toUpperTemple();
  if (!accessCode) {
    if (errorTarget) errorTarget.textContent = 'Enter your phone number or check-in code.';
    return;
  }
  try {
    const data = await api('/api/access/join', { method: 'POST', body: { accessCode, playerId, termsAccepted: hasAcceptedTerms() } });
    playerId = data.playerId;
    localStorage.setItem('archaeologistPlayerId', playerId);
    localStorage.setItem('archaeologistAccessCode', accessCode);
    if (data.player?.firstName) localStorage.setItem('archaeologistFirstName', data.player.firstName);
    if (data.player?.lastName) localStorage.setItem('archaeologistLastName', data.player.lastName);
    if (data.player?.instagram) localStorage.setItem('archaeologistInstagram', data.player.instagram);
    state = data.state;
    syncServerClock(state);
    updateLevelLabels(state);
    activeSessionKey = `archaeologistAck:${state.sessionCode}`;
    archaeologistNotes = loadArchaeologistNotesLocal();
    archaeologistNotesLoadedFor = notesStorageKey();
    loadArchaeologistNotesRemote().catch(() => {});
    connectSocket(data.sessionCode || state.sessionCode);
    startPolling(data.sessionCode || state.sessionCode);
    detectNotifications(state, true);
    $('introRoot').classList.add('hidden');
    $('appTopbar').classList.remove('hidden');
    $('appMain').classList.remove('hidden');
    render();
    inspectDialogTriggers(state, true);
    inspectCountdown(state);
  } catch (err) {
    if (errorTarget) errorTarget.textContent = err.message;
  }
}

function connectSocket(code) {
  if (ws) ws.close();
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`);
  ws.onmessage = evt => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'state') receiveState(msg.state);
  };
  ws.onclose = () => setTimeout(() => state && connectSocket(state.sessionCode), 2500);
}

function startPolling(code) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const next = await api(`/api/sessions/${code}`);
      receiveState(next, true);
    } catch (_err) {}
  }, 4000);
}

function receiveState(next, fromPoll = false) {
  activeSessionKey = `archaeologistAck:${next.sessionCode}`;
  detectNotifications(next, fromPoll);
  state = next;
  syncServerClock(state);
  updateLevelLabels(state);
  render();
  inspectCountdown(next);
  inspectDialogTriggers(next, fromPoll);
}

function detectNotifications(next, silent) {
  // First state load should establish the baseline only.
  // After that, polling is allowed to trigger clue notifications because
  // timed clue unlocks usually arrive through polling, not only WebSocket pushes.
  if (!state) {
    previousHostMessageCount = next.hostMessages?.length || 0;
    previousCounts = clueCounts(next);
    return;
  }

  const newClues = findNewClues(state, next);
  const newHostMessage = (next.hostMessages?.length || 0) > previousHostMessageCount;

  if (newClues.length) {
    notify('New evidence unlocked');
    enqueueClueDialogs(newClues, next.sessionCode);
  }
  // Host messages can stay quiet during silent polling, but clue unlocks should not.
  if (newHostMessage && !silent) notify('Host message');

  previousCounts = clueCounts(next);
  previousHostMessageCount = next.hostMessages?.length || 0;
}

function allVisibleClues(s) {
  const clues = [];
  for (const c of (s.publicClues || [])) clues.push({ ...c, appKey: 'templefeed', appLabel: 'Temple Feed' });
  for (const [appKey, appClues] of Object.entries(s.apps || {})) {
    const label = APP_META[appKey]?.[1] || appKey;
    for (const c of (appClues || [])) clues.push({ ...c, appKey, appLabel: label });
  }
  return clues;
}

function findNewClues(oldState, newState) {
  // When the five-minute briefing ends, the first wave of clues may already be
  // visible at unlockSec 0. Treat the briefing → investigation transition as a
  // new evidence event so players still get the notification-only popups.
  const briefingJustEnded = oldState?.phase === 'briefing' && newState?.phase !== 'briefing';
  const oldIds = briefingJustEnded ? new Set() : new Set(allVisibleClues(oldState || {}).map(c => c.id));
  const ack = getAckForSession(newState.sessionCode);
  return allVisibleClues(newState)
    .filter(c => c.id && !oldIds.has(c.id) && !ack.clues.includes(c.id))
    .sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function enqueueClueDialogs(clues, sessionCode) {
  // Show one notification popup for each unlock wave. Do NOT reveal clue title/text here.
  // This prevents back-to-back alert windows if the host jumps the timer during testing.
  const clean = (clues || []).filter(clue => clue?.id);
  if (!clean.length) return;
  const appLabels = Array.from(new Set(clean.map(clue => clue.appLabel || APP_META[clue.appKey]?.[1] || 'Temple Feed')));
  const labelText = appLabels.length === 1 ? appLabels[0] : `${appLabels.slice(0, 3).join(', ')}${appLabels.length > 3 ? ' +' + (appLabels.length - 3) : ''}`;
  enqueueDialog({
    key: `clueNotify:${sessionCode}:${clean.map(clue => clue.id).join(',')}`,
    meta: 'New Evidence Unlocked',
    title: appLabels.length === 1 ? `${labelText} Updated` : 'Investigation Apps Updated',
    text: `New evidence has unlocked in ${labelText}. Check your investigation apps when ready.`,
    viewLabel: 'OK',
    viewAction: null,
    ackType: 'clues',
    ackValues: clean.map(clue => clue.id)
  });
}

function clueCounts(s) {
  const counts = { templefeed: s.publicClues?.length || 0 };
  for (const key of Object.keys(APP_META)) {
    if (key === 'templefeed') continue;
    counts[key] = key === 'accuse' ? getVisibleQuestionsForState(s).length : (s.apps?.[key]?.length || 0);
  }
  return counts;
}

function notify(text) {
  if (navigator.vibrate) navigator.vibrate(120);
  const oldTitle = document.title;
  document.title = `• ${text}`;
  setTimeout(() => { document.title = oldTitle; }, 1800);
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}


function storyBriefingKey(s = state) {
  return 'escape';
}

function storyBriefingBeats() {
  return [];
}


function renderStoryBriefingContent() {
  const el = $('storyBackstory');
  if (!el || !state) return;
  const beats = [
    ['0:00–0:45','The Call Beneath Chichén Itzá','You are Dr. Reyes, a Latin American archaeologist invited to review a new scan beneath Chichén Itzá. The surface team expected a storage hollow. The first images showed something impossible: a sealed passage lined with carved serpents, star marks, and oxygen pockets.','You step below the stone with one goal: document the chamber before anyone damages it. Then the entrance seals behind you.'],
    ['0:45–1:30','Thirty Minutes of Breath','Your wrist monitor flashes: O₂ ESTIMATE 30:00. The chamber is not instantly deadly, but the usable air is limited. Panic wastes breath. Fire wastes more.','A torch waits beside the entry. It can reveal pigment hidden in the carvings, but every second of flame burns oxygen faster.'],
    ['1:30–2:15','The Writing Is the Map','The walls, floors, and ceiling are covered with ancient symbols, sculpted faces, serpent bodies, and repeated glyphs for breath, shadow, current, and closed eyes.','The temple is communicating the way its builders intended: through writing, sculpture, placement, and motion. Decoration is instruction.'],
    ['2:15–3:30','A Temple Built on Physics','The first chamber reacts to light. The second weighs stone. The third listens with echoes. The fourth breathes through hidden air currents. The final gate waits for a shadow to align with a star.','This is not only archaeology. It is physics under pressure. Light, heat, oxygen, mass, torque, sound, and airflow decide whether you escape.'],
    ['3:30–4:15','The Serpent’s Warning','A carved serpent curls around a flame. Its mouth points toward a line of symbols: Light shows the road. The hunger of fire steals the sky from the lungs.','Use the torch in short bursts. Translate before choosing. Too many wrong turns will burn time and mindful oxygen.'],
    ['4:15–5:00','Your Mission','Escape from Chichén Itzá before the oxygen timer reaches zero. Move chamber by chamber, solve the physics puzzles, translate the carvings, and choose the living path.','The fastest escape wins. The smartest archaeologist leaves with breath still in their lungs.']
  ];
  el.innerHTML = beats.map(([time,title,p1,p2], idx) => `<article class="storyBeat" data-start="${idx === 0 ? 0 : [45,90,135,210,255][idx]}" data-end="${[45,90,135,210,255,300][idx]}"><div class="beatTime">${time}</div><h3>${title}</h3><p>${p1}</p><p>${p2}</p></article>`).join('');
}


function updateStoryBriefing() {
  if (!state || state.phase !== 'briefing') return;
  const total = Number(state.briefingTotalSec || 300);
  const remaining = Number(state.briefingRemainingSec || total);
  const elapsed = Math.max(0, total - remaining);
  document.querySelectorAll('.storyBeat').forEach((beat) => {
    const start = Number(beat.dataset.start || 0);
    const end = Number(beat.dataset.end || start + 45);
    const active = elapsed >= start && elapsed < end;
    beat.classList.toggle('activeStoryBeat', active);
    if (active && !beat.dataset.seenActive) {
      beat.dataset.seenActive = '1';
      beat.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function renderStoryTimerBar() {
  if (!state || state.phase !== 'briefing') return;
  const fill = document.getElementById('storyTimerFill');
  const label = document.getElementById('storyTimerLabel');
  if (!fill) return;
  const total = Math.max(1, Number(state.briefingTotalSec || 300));
  const remaining = Math.max(0, Number(state.briefingRemainingSec || 0));
  const elapsed = Math.max(0, total - remaining);
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  fill.style.width = `${pct}%`;
  if (label) label.textContent = 'Temple briefing in progress';
}

function renderProgressBar() {
  if (!state?.currentRound) return;
  const r = state.currentRound;
  const total = Math.max(1, Number(state.totalSec || 1));
  const pct = Math.max(0, Math.min(100, (Number(state.elapsedSec || 0) / total) * 100));
  $('progressRound').textContent = r.title || 'Current Round';
  $('progressTime').textContent = `${fmt(state.remainingSec)} left`;
  $('progressFill').style.width = `${pct}%`;
  $('progressObjective').textContent = r.objective || 'Review the evidence and connect the clues.';
  renderTempleBoardStats();
}

function renderTempleBoardStats() {
  if (!state) return;
  const rounds = state.rounds || [];
  const currentIndex = rounds.findIndex(r => r.id === state.currentRound?.id);
  const roundNumber = currentIndex >= 0 ? currentIndex + 1 : Math.min(rounds.length || 5, Math.max(1, Math.ceil(Number(state.elapsedSec || 0) / 300)));
  const totalRounds = rounds.length || 5;
  const visibleClues = allVisibleClues(state);
  const statements = visibleClues.filter(c => String(c.type || '').toLowerCase() === 'statement' || /translation clue|alibi/i.test(`${c.title || ''} ${c.text || ''}`));
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const checkpointQuestions = (state.accusation?.questions || []).filter(q => q.stage === 'checkpoint');
  const answeredCheckpoints = checkpointQuestions.filter(q => saved[q.id]).length;
  if ($('templeBoardRound')) $('templeBoardRound').textContent = `${roundNumber}/${totalRounds}`;
  if ($('templeBoardEvidence')) $('templeBoardEvidence').textContent = String(visibleClues.length);
  if ($('templeBoardStatements')) $('templeBoardStatements').textContent = String(statements.length);
  if ($('templeBoardCheckpoints')) $('templeBoardCheckpoints').textContent = `${answeredCheckpoints}/${checkpointQuestions.length || 5}`;
}

function isArchaeologistNotesOpen() {
  return currentApp === 'archaeologistNotes' && $('appDetailCard') && !$('appDetailCard').classList.contains('hidden');
}

function queuedUpdateCount() {
  let count = dialogQueue.length;
  try { if (nextUnansweredCheckpointQuestion()) count += 1; } catch (_err) {}
  return count;
}

function renderApps() {
  $('appGrid').innerHTML = Object.entries(APP_META).map(([key,[emoji,label]]) => {
    let count = 0;
    if (key === 'templefeed') count = state.publicClues?.length || 0;
    else if (key === 'accuse') count = getVisibleQuestions().length;
    else if (key === 'archaeologistNotes') count = archaeologistNotesWordCount();
    else count = state.apps?.[key]?.length || 0;
    return `<button class="appIcon" onclick="openApp('${key}')"><span class="badge">${count}</span><span class="emoji">${emoji}</span><b>${label}</b><small>${key === 'accuse' ? accusationMini() : (key === 'archaeologistNotes' ? `${count} words saved` : `${count} unlocked`)}</small></button>`;
  }).join('');
}

window.openApp = key => {
  const wasInNotes = currentApp === 'archaeologistNotes';
  currentApp = key;
  render();
  if (wasInNotes && key !== 'archaeologistNotes') {
    renderCheckpointPopup();
    renderDialog();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.closeArchaeologistNotes = () => {
  const wasInNotes = currentApp === 'archaeologistNotes';
  currentApp = null;
  render();
  if (wasInNotes) {
    renderCheckpointPopup();
    renderDialog();
  }
};

function renderAppDetail() {
  if (!currentApp || currentApp === 'accuse') return;
  if (currentApp === 'archaeologistNotes') {
    renderArchaeologistNotes();
    return;
  }
  const [emoji,label] = APP_META[currentApp];
  $('appTitle').textContent = `${emoji} ${label}`;
  const clues = currentApp === 'templefeed' ? (state.publicClues || []) : (state.apps?.[currentApp] || []);
  $('appEvidence').innerHTML = clues.length ? clues.map(clueHtml).join('') : '<p class="muted">No evidence has unlocked in this app yet.</p>';
}


function defaultArchaeologistNotes() {
  return {
    mainSuspect: '',
    possibleMotive: '',
    importantEvidence: '',
    alibis: '',
    finalTheory: '',
    scratchpad: ''
  };
}

function normalizeArchaeologistNotes(notes = {}) {
  const base = defaultArchaeologistNotes();
  for (const key of Object.keys(base)) base[key] = String(notes?.[key] || '').slice(0, 5000);
  return base;
}

function notesStorageKey() {
  const session = state?.sessionCode || 'no-session';
  const player = playerId || 'no-player';
  return `archaeologistNotes:${session}:${player}`;
}

function loadArchaeologistNotesLocal() {
  try {
    const raw = localStorage.getItem(notesStorageKey());
    return normalizeArchaeologistNotes(raw ? JSON.parse(raw) : {});
  } catch (_err) {
    return defaultArchaeologistNotes();
  }
}

function saveArchaeologistNotesLocal() {
  try { localStorage.setItem(notesStorageKey(), JSON.stringify(normalizeArchaeologistNotes(archaeologistNotes))); } catch (_err) {}
}

async function loadArchaeologistNotesRemote() {
  if (!state?.sessionCode || !playerId) return;
  const key = notesStorageKey();
  const data = await api(`/api/sessions/${state.sessionCode}/notes/${encodeURIComponent(playerId)}`);
  if (key !== notesStorageKey()) return;
  const remote = normalizeArchaeologistNotes(data.notes || {});
  const local = loadArchaeologistNotesLocal();
  archaeologistNotes = Object.values(local).some(Boolean) ? { ...remote, ...local } : remote;
  saveArchaeologistNotesLocal();
  archaeologistNotesLoadedFor = key;
  archaeologistNotesRemoteLoaded = true;

  // Do not rebuild the note form while the player is actively typing.
  // Rebuilding the panel during session polling makes the notes appear to close,
  // resets the cursor, and can interrupt autosave on mobile browsers.
  const activeField = document.activeElement?.dataset?.noteField;
  if (currentApp === 'archaeologistNotes' && !activeField) renderArchaeologistNotes({ force: true });
  else updateArchaeologistNotesStatus();
}

function archaeologistNotesWordCount() {
  return String(Object.values(archaeologistNotes || {}).join(' ')).trim().split(/\s+/).filter(Boolean).length;
}

function scheduleArchaeologistNotesSave() {
  archaeologistNotesSaveStatus = 'Saving...';
  updateArchaeologistNotesStatus();
  clearTimeout(archaeologistNotesSaveTimer);
  archaeologistNotesSaveTimer = setTimeout(saveArchaeologistNotesRemote, 650);
}

function updateArchaeologistNotesStatus() {
  const el = $('archaeologistNotesStatus');
  if (!el) return;
  const queued = dialogQueue.length;
  const base = archaeologistNotesSaveStatus || 'Autosave ready.';
  el.textContent = queued ? `${base} · ${queued} temple update${queued === 1 ? '' : 's'} waiting` : base;
}

async function saveArchaeologistNotesRemote() {
  if (!state?.sessionCode || !playerId || archaeologistNotesSaving) return;
  archaeologistNotesSaving = true;
  try {
    await api(`/api/sessions/${state.sessionCode}/notes`, { method: 'POST', body: { playerId, notes: normalizeArchaeologistNotes(archaeologistNotes) } });
    archaeologistNotesSaveStatus = `Saved · Last saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch (_err) {
    archaeologistNotesSaveStatus = 'Saved on this device · reconnect to sync';
  } finally {
    archaeologistNotesSaving = false;
    updateArchaeologistNotesStatus();
    renderApps();
  }
}

function noteField(label, key, placeholder, rows = 3) {
  return `<label class="noteField"><span>${escapeHtml(label)}</span><textarea data-note-field="${escapeHtml(key)}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(archaeologistNotes[key] || '')}</textarea></label>`;
}

function renderArchaeologistNotes(options = {}) {
  const [emoji,label] = APP_META.archaeologistNotes;
  $('appTitle').textContent = `${emoji} ${label}`;
  const key = notesStorageKey();
  const activeField = document.activeElement?.dataset?.noteField;

  if (archaeologistNotesLoadedFor !== key) {
    archaeologistNotes = loadArchaeologistNotesLocal();
    archaeologistNotesLoadedFor = key;
    archaeologistNotesRemoteLoaded = false;
    loadArchaeologistNotesRemote().catch(() => {});
  }

  // Keep Field Notes open during automatic polling/rerenders.
  // If the player is typing, never replace the textarea DOM; just update the status text.
  if (!options.force && activeField && $('appEvidence')?.querySelector('.archaeologistNotesPanel')) {
    updateArchaeologistNotesStatus();
    return;
  }
  if (!options.force && archaeologistNotesUiMountedKey === key && $('appEvidence')?.querySelector('.archaeologistNotesPanel')) {
    updateArchaeologistNotesStatus();
    return;
  }

  archaeologistNotesUiMountedKey = key;
  $('appEvidence').innerHTML = `<div class="archaeologistNotesPanel">
    <div class="notesHeaderBox">
      <div>
        <div class="time">Private Archaeologist Scratchpad</div>
        <h3>Track your theory before the final escape sequence.</h3>
        <p class="mini">These notes are private to this player and do not affect scoring.</p>
      </div>
      <div class="notesAutosave" id="archaeologistNotesStatus">${escapeHtml(archaeologistNotesSaveStatus || 'Autosave ready.')}</div>
    </div>
    <div class="notesGrid">
      ${noteField('Main Suspect', 'mainSuspect', 'Who do you think did it?')}
      ${noteField('Possible Motive', 'possibleMotive', 'Why would they need Lena stopped?')}
      ${noteField('Important Evidence', 'importantEvidence', 'Which clues actually prove something?')}
      ${noteField('Alibis That Do Not Add Up', 'alibis', 'Which statements feel inconsistent?')}
      ${noteField('Final Theory', 'finalTheory', 'Who, how, why, and what proves it?', 4)}
      ${noteField('Scratchpad', 'scratchpad', 'Jot anything you want to remember during the game.', 6)}
    </div>
    <div class="actions">
      <button class="secondary" type="button" onclick="closeArchaeologistNotes()">Close Notes</button>
    </div>
  </div>`;
  updateArchaeologistNotesStatus();
}

window.saveArchaeologistNotesRemote = saveArchaeologistNotesRemote;

function naturalEvidenceDetails(c) {
  const parts = [];
  if (c.weather) parts.push(c.weather);
  if (c.sight) parts.push(c.sight);
  if (c.sound) parts.push(c.sound);
  if (c.smell) parts.push(c.smell);
  if (c.physics) parts.push(c.physics);
  if (c.timelineNote) parts.push(c.timelineNote);
  if (!parts.length) return '';
  return ` ${parts.join(' ')}`;
}

function clueHtml(c) {
  const isStatement = String(c.type || '').toLowerCase() === 'statement' || /translation clue|alibi/i.test(`${c.title || ''} ${c.text || ''}`);
  const storyTime = c.evidenceTime || c.claimTime || '';
  const naturalText = `${c.text || ''}${naturalEvidenceDetails(c)}`.trim();
  if (isStatement) {
    const rawTitle = c.title || 'Translation Clue';
    const translationTitle = rawTitle.replace(/^Translation Clue:\s*/i, '').trim();
    return `<div class="feedItem translationCard"><div class="time">Translation Clue${storyTime ? ' · Story Time: ' + escapeHtml(storyTime) : ''}</div><h4>${escapeHtml(translationTitle || rawTitle)}</h4><p class="translationRole">Carving translation / path logic</p><p>${escapeHtml(naturalText)}</p></div>`;
  }
  return `<div class="feedItem"><div class="time">Evidence${storyTime ? ' · Story Time: ' + escapeHtml(storyTime) : ''}</div><h4>${escapeHtml(c.title || 'Evidence')}</h4><p>${escapeHtml(naturalText)}</p></div>`;
}

function accusationMini() {
  const visible = getVisibleQuestions().length;
  if (state.phase === 'accusation') return `${visible} questions open`;
  if (state.phase === 'accusation_locked') return 'Locked';
  return `${visible} unlocked · final in ${fmt(state.remainingToEscapeSec)}`;
}

function getVisibleQuestionsForState(s) {
  const questions = s?.accusation?.questions || [];
  const elapsed = Number(s?.elapsedSec || 0);
  const phase = s?.phase || 'lobby';
  return questions.filter(q => phase === 'revealed' || phase === 'accusation' || phase === 'accusation_locked' || elapsed >= Number(q.unlockSec || 0));
}

function getVisibleQuestions() {
  return getVisibleQuestionsForState(state);
}

function questionStageLabel(question) {
  return question.stage === 'final' ? 'Final Escape' : 'Round Checkpoint';
}

function getMySubmission() {
  return (state?.submissions || []).find(s => s.playerId === playerId) || null;
}

function getMyResult() {
  return (state?.results || []).find(r => r.playerId === playerId) || null;
}

function renderAccuse() {
  const open = state.phase === 'accusation';
  const locked = state.phase === 'accusation_locked';
  const config = state.accusation || { questions: [] };
  const visibleQuestions = getVisibleQuestions();
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const answeredVisible = visibleQuestions.filter(q => saved[q.id]).length;

  if ($('finalDramaBox')) $('finalDramaBox').classList.toggle('hidden', !open);
  if (open) $('accuseStatus').textContent = `Final escape sequence is open. Complete all ${config.questions.length} mystery questions before submitting.`;
  else if (locked) $('accuseStatus').textContent = 'The escape sequence window is now closed.';
  else $('accuseStatus').textContent = `${answeredVisible}/${visibleQuestions.length} unlocked questions answered. Final questions open in ${fmt(state.remainingToEscapeSec)}.`;

  show('accuseFormWrap', Boolean(visibleQuestions.length));
  $('submitAccuseBtn').disabled = !open;
  $('submitAccuseBtn').textContent = open ? 'Lock In Final Escape' : 'Final Submit Opens Later';

  $('accuseQuestions').innerHTML = visibleQuestions.length ? '<div class="miniActionRow"><button class="secondary compact" type="button" onclick="openApp(\'archaeologistNotes\')">Open Field Notes</button></div>' + visibleQuestions.map(question => {
    const selected = saved[question.id] || '';
    return `<div class="questionCard"><div class="time">${escapeHtml(questionStageLabel(question))}</div><h3>${escapeHtml(question.prompt)}</h3>${question.stage === 'checkpoint' && !selected ? `<div class="actions"><button class="secondary compact" type="button" onclick="openCheckpointQuestion('${escapeHtml(question.id)}')">Open Checkpoint Popup</button></div>` : ''}<div class="choiceList">${(question.options || []).map(opt => `
      <label class="choiceOption ${selected === opt.id ? 'selected' : ''}">
        <input type="radio" name="accuse-${escapeHtml(question.id)}" data-question-id="${escapeHtml(question.id)}" value="${escapeHtml(opt.id)}" ${selected === opt.id ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span>${escapeHtml(opt.label)}</span>
      </label>`).join('')}</div></div>`;
  }).join('') : '<p class="muted">No mystery questions have unlocked yet. Keep investigating.</p>';

  const total = config.questions?.length || 10;
  const answeredTotal = (config.questions || []).filter(q => saved[q.id]).length;
  const submittedText = submission?.finalSubmittedAt
    ? `Final mystery submitted at ${new Date(submission.finalSubmittedAt).toLocaleTimeString()}.`
    : `${answeredTotal}/${total} total mystery questions answered.`;
  $('accuseResult').textContent = submittedText;
  setTimeout(syncChoiceHighlights, 0);
}

function syncChoiceHighlights() {
  document.querySelectorAll('.choiceOption').forEach(label => label.classList.toggle('selected', Boolean(label.querySelector('input:checked'))));
}

function syncCheckpointPopupSelection() {
  const selectedInput = document.querySelector('#checkpointPopupChoices input[type="radio"]:checked');
  checkpointPopupSelected = selectedInput?.value || checkpointPopupSelected || '';
  if (checkpointPopupQuestionId && checkpointPopupSelected) rememberCheckpointPopupSelection(checkpointPopupQuestionId, checkpointPopupSelected);
  document.querySelectorAll('.checkpointPopupChoice').forEach(label => {
    label.classList.toggle('selected', Boolean(label.querySelector('input:checked')));
  });
  if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = !checkpointPopupSelected;
  if (checkpointPopupSelected && $('checkpointPopupStatus')) {
    $('checkpointPopupStatus').textContent = 'Answer selected. Submit when ready.';
  }
}

async function saveQuestionAnswer(input) {
  if (!state || !input?.dataset?.questionId || !input.value) return;
  const answers = { [input.dataset.questionId]: input.value };
  try {
    checkpointPopupIsSubmitting = true;
    if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = true;
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Submitting checkpoint answer...';
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, {
      method: 'POST',
      body: { playerId, answers }
    });
    state = data.state;
    const submission = getMySubmission();
    const total = state.accusation?.questions?.length || 10;
    const answeredTotal = (state.accusation?.questions || []).filter(q => submission?.answers?.[q.id]).length;
    $('accuseResult').textContent = `Saved. ${answeredTotal}/${total} total mystery questions answered.`;
  } catch (err) {
    $('accuseResult').textContent = err.message;
  }
}

async function submitEscape() {
  try {
    const config = state.accusation || { questions: [] };
    const submission = getMySubmission();
    const answers = { ...(submission?.answers || {}) };
    const missing = [];
    for (const question of config.questions || []) {
      const selected = document.querySelector(`input[name="accuse-${question.id}"]:checked`);
      if (selected) answers[question.id] = selected.value;
      if (!answers[question.id]) missing.push(question.prompt || question.id);
    }
    if (missing.length) {
      $('accuseResult').textContent = `Please answer all ${config.questions.length} mystery questions before submitting.`;
      return;
    }
    const data = await api(`/api/sessions/${state.sessionCode}/accuse`, {
      method: 'POST',
      body: { playerId, answers }
    });
    $('accuseResult').textContent = 'Final escape sequence submitted.';
    state = data.state;
    render();
  } catch (err) {
    $('accuseResult').textContent = err.message;
  }
}

function openHostIssuePopup() {
  if ($('emailHostBtn')) $('emailHostBtn').href = HOST_ISSUE_MAILTO;
  show('hostIssueOverlay', true);
}

function closeHostIssuePopup() {
  show('hostIssueOverlay', false);
}

async function requestHelp(text = '') {
  openHostIssuePopup();
}


function checkpointPopupKey(questionId) {
  return `${state?.sessionCode || 'session'}:${playerId || 'player'}:${questionId}`;
}

function rememberCheckpointPopupSelection(questionId, value) {
  if (!questionId || !value) return;
  checkpointPopupSelections[checkpointPopupKey(questionId)] = value;
}

function getRememberedCheckpointPopupSelection(questionId) {
  if (!questionId) return '';
  return checkpointPopupSelections[checkpointPopupKey(questionId)] || '';
}

function nextUnansweredCheckpointQuestion() {
  if (!state || !playerId || !['investigation','accusation'].includes(state.phase)) return null;
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const elapsed = Number(state.elapsedSec || 0);
  return (state.accusation?.questions || [])
    .filter(q => q.stage === 'checkpoint' && elapsed >= Number(q.unlockSec || 0) && !saved[q.id])
    .sort((a,b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0))[0] || null;
}

function renderCheckpointPopup(forceQuestion = null) {
  if (!forceQuestion && isArchaeologistNotesOpen()) {
    updateArchaeologistNotesStatus();
    return;
  }
  const q = forceQuestion || nextUnansweredCheckpointQuestion();
  if (!q) {
    if ($('checkpointOverlay')) show('checkpointOverlay', false);
    checkpointPopupQuestionId = '';
    checkpointPopupSelected = '';
    checkpointPopupIsSubmitting = false;
    return;
  }

  const savedAnswer = getMySubmission()?.answers?.[q.id] || '';
  if (savedAnswer && !forceQuestion) {
    if ($('checkpointOverlay')) show('checkpointOverlay', false);
    checkpointPopupQuestionId = '';
    checkpointPopupSelected = '';
    return;
  }

  const key = checkpointPopupKey(q.id);
  if (!forceQuestion && checkpointPopupDismissed[key]) return;

  const overlayIsOpen = $('checkpointOverlay') && !$('checkpointOverlay').classList.contains('hidden');
  const sameQuestionOpen = overlayIsOpen && checkpointPopupQuestionId === q.id && $('checkpointPopupChoices')?.children?.length;
  const preservedSelection = getRememberedCheckpointPopupSelection(q.id) || (checkpointPopupQuestionId === q.id ? checkpointPopupSelected : '') || '';

  checkpointPopupQuestionId = q.id;
  checkpointPopupSelected = preservedSelection;

  // Do not rebuild the popup while a player is actively answering it. Polling can refresh the
  // session state every few seconds, and a full rebuild would clear the selected answer before
  // the player can press Submit.
  if (sameQuestionOpen && !forceQuestion) {
    const selectedInput = checkpointPopupSelected
      ? document.querySelector(`#checkpointPopupChoices input[value="${CSS.escape(checkpointPopupSelected)}"]`)
      : null;
    if (selectedInput) selectedInput.checked = true;
    syncCheckpointPopupSelection();
    return;
  }

  const checkpointQuestions = (state.accusation?.questions || []).filter(x => x.stage === 'checkpoint');
  const roundNumber = (checkpointQuestions.findIndex(x => x.id === q.id) + 1) || '';
  if ($('checkpointPopupMeta')) $('checkpointPopupMeta').textContent = `Checkpoint ${roundNumber}`;
  if ($('checkpointPopupTitle')) $('checkpointPopupTitle').textContent = 'Round Decision Moment';
  if ($('checkpointPopupPrompt')) $('checkpointPopupPrompt').textContent = q.prompt || 'Submit your checkpoint answer.';
  if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = checkpointPopupSelected
    ? 'Answer selected. Submit when ready.'
    : 'Use only the carvings, physics clues, and translations from this chamber.';
  if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = !checkpointPopupSelected;
  if ($('checkpointPopupChoices')) $('checkpointPopupChoices').innerHTML = ((q.options || q.choices) || []).map(choice => {
    const checked = checkpointPopupSelected === choice.id;
    return `<label class="choiceOption checkpointPopupChoice ${checked ? 'selected' : ''}" tabindex="0" role="radio" aria-checked="${checked ? 'true' : 'false'}">
      <input type="radio" name="checkpoint-popup-${escapeHtml(q.id)}" value="${escapeHtml(choice.id)}" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(choice.label)}</span>
    </label>`;
  }).join('');
  document.querySelectorAll('.checkpointPopupChoice').forEach(label => {
    label.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const input = label.querySelector('input[type="radio"]');
      if (!input) return;
      input.checked = true;
      checkpointPopupSelected = input.value;
      rememberCheckpointPopupSelection(checkpointPopupQuestionId, input.value);
      syncCheckpointPopupSelection();
    });
  });
  syncCheckpointPopupSelection();
  show('checkpointOverlay', true);
}

function closeCheckpointPopup() {
  if (checkpointPopupQuestionId) checkpointPopupDismissed[checkpointPopupKey(checkpointPopupQuestionId)] = true;
  show('checkpointOverlay', false);
  renderDialog();
}

async function submitCheckpointPopup() {
  if (checkpointPopupIsSubmitting) return;
  const qid = checkpointPopupQuestionId;
  const checkedInput = Array.from(document.querySelectorAll('#checkpointPopupChoices input[type="radio"]')).find(input => input.checked);
  const selected = checkpointPopupSelected || checkedInput?.value || '';
  if (!qid || !selected) {
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Choose an answer before submitting.';
    return;
  }
  try {
    checkpointPopupIsSubmitting = true;
    if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = true;
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Submitting checkpoint answer...';
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, {
      method: 'POST',
      body: { playerId, answers: { [qid]: selected } }
    });
    state = data.state;
    checkpointPopupDismissed[checkpointPopupKey(qid)] = true;
    delete checkpointPopupSelections[checkpointPopupKey(qid)];
    checkpointPopupSelected = '';
    checkpointPopupIsSubmitting = false;
    show('checkpointOverlay', false);
    notify('Checkpoint answer submitted');
    render();
    renderDialog();
  } catch (err) {
    checkpointPopupIsSubmitting = false;
    if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = !checkpointPopupSelected;
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = err.message;
  }
}

window.openCheckpointQuestion = function(questionId) {
  const q = (state?.accusation?.questions || []).find(item => item.id === questionId);
  if (q) renderCheckpointPopup(q);
};

function renderReveal() {
  if (state.phase !== 'revealed') return;
  const result = getMyResult();
  const answer = state.answerKey || {};
  const escapeRoute = answer.escapeRoute || answer.culprit || answer.temple || 'Unknown';
  const method = answer.method || answer.weapon || '';
  const motive = answer.motive || '';
  const keyEvidence = answer.keyEvidence || '';
  const explanation = answer.explanation || '';

  if (result) {
    $('resultSummary').innerHTML = `
      <div class="resultBanner templeRevealBanner">
        <div>
          <div class="time">The Reveal</div>
          <h3>Escape Route: ${escapeHtml(escapeRoute)}</h3>
          ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
          ${method ? `<p><b>Method:</b> ${escapeHtml(method)}</p>` : ''}
          ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
          <p class="mini"><b>Your Rating:</b> ${escapeHtml(result.badge)} · <b>Score:</b> ${result.score} / ${result.total} · <b>Difficulty:</b> ${escapeHtml(state.difficultyLabel || 'ROOKIE DETECTIVE CASE')}</p>
        </div>
      </div>`;
    $('answerReviewPanel').innerHTML = `<div class="feedItem"><h4>Review My Answers</h4>${result.breakdown.map(item => `<p><b>${escapeHtml(item.prompt)}</b><br>Your answer: ${escapeHtml(item.selectedLabel)}${item.correct ? ' ✅' : ` ❌<br>Correct answer: ${escapeHtml(item.correctLabel)}`}</p>`).join('')}</div>`;
    $('templeLogicPanel').innerHTML = `
      <div class="feedItem"><h4>Full Temple Logic</h4>
        ${escapeRoute ? `<p><b>Escape Route:</b> ${escapeHtml(escapeRoute)}</p>` : ''}
        ${method ? `<p><b>Method:</b> ${escapeHtml(method)}</p>` : ''}
        ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
        ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
        ${explanation ? `<p><b>Explanation:</b> ${escapeHtml(explanation)}</p>` : ''}
      </div>`;
    $('shareCardWrap').classList.remove('hidden');
    renderBadgeCanvas(result);
  } else {
    $('resultSummary').innerHTML = `
      <div class="resultBanner templeRevealBanner">
        <div>
          <div class="time">The Reveal</div>
          <h3>Escape Route: ${escapeHtml(escapeRoute)}</h3>
          ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
          ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
        </div>
      </div>`;
    $('answerReviewPanel').innerHTML = '<div class="feedItem"><h4>Review My Answers</h4><p class="muted">No player result is available on this device.</p></div>';
    $('templeLogicPanel').innerHTML = `<div class="feedItem"><h4>Full Temple Logic</h4>${explanation ? `<p>${escapeHtml(explanation)}</p>` : '<p class="muted">Full temple logic is not available yet.</p>'}</div>`;
    $('shareCardWrap').classList.add('hidden');
  }
  $('answerReviewPanel')?.classList.toggle('hidden', !answerReviewOpen);
  $('templeLogicPanel')?.classList.toggle('hidden', !templeLogicOpen);
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = answerReviewOpen ? 'Hide My Answers' : 'Review My Answers';
  if ($('reviewTempleLogicBtn')) $('reviewTempleLogicBtn').textContent = templeLogicOpen ? 'Hide Full Temple Logic' : 'Review Full Temple Logic';
  $('answerKey').innerHTML = '';
}

function toggleAnswerReview() {
  const panel = $('answerReviewPanel');
  if (!panel) return;
  answerReviewOpen = !answerReviewOpen;
  panel.classList.toggle('hidden', !answerReviewOpen);
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = answerReviewOpen ? 'Hide My Answers' : 'Review My Answers';
}

function toggleTempleLogic() {
  const panel = $('templeLogicPanel');
  if (!panel) return;
  templeLogicOpen = !templeLogicOpen;
  panel.classList.toggle('hidden', !templeLogicOpen);
  if ($('reviewTempleLogicBtn')) $('reviewTempleLogicBtn').textContent = templeLogicOpen ? 'Hide Full Temple Logic' : 'Review Full Temple Logic';
}

function inspectDialogTriggers(next, silent = false) {
  if (!next) return;
  if (!activeSessionKey) activeSessionKey = `archaeologistAck:${next.sessionCode}`;

  const ack = getAck();
  const messages = next.hostMessages || [];
  const unseenMessages = messages.filter(m => !ack.messages.includes(m.id));
  if (!silent) {
    unseenMessages.forEach(m => enqueueDialog({
      key: `msg:${m.id}`,
      meta: m.kind === 'opening' ? 'Opening Briefing' : (m.kind === 'reveal' ? 'Temple Closed' : 'Host Dialogue'),
      title: m.title || 'Host',
      text: m.text,
      ackType: 'message',
      ackValue: m.id
    }));
  }

  const round = next.currentRound;
  if (round && !ack.rounds.includes(round.id) && !['lobby','briefing','revealed'].includes(next.phase)) {
    enqueueDialog({
      key: `round:${round.id}`,
      meta: 'Round Briefing',
      title: round.title,
      text: round.dialogue || round.objective || 'Review the newly unlocked evidence.',
      ackType: 'round',
      ackValue: round.id
    });
  }

  enqueueExcitementDialogues(next, ack);
  enqueueSponsorAds(next, ack);

  const myResult = (next.results || []).find(r => r.playerId === playerId);
  const resultKey = myResult ? `${myResult.playerId}:${myResult.updatedAt}` : '';
  if (myResult && next.phase === 'revealed' && !ack.results.includes(resultKey)) {
    enqueueDialog({
      key: `result:${resultKey}`,
      meta: 'Archaeologist Results',
      title: myResult.badge,
      text: `${myResult.playerName}, you scored ${myResult.score}/${myResult.total}. Your rating is ${myResult.badge}.`,
      ackType: 'result',
      ackValue: resultKey
    });
  }

  renderDialog();
}

function enqueueExcitementDialogues(next, ack) {
  if (!next || ['lobby','briefing','revealed'].includes(next.phase)) return;
  const elapsed = Number(next.elapsedSec || 0);
  const round = next.currentRound;
  if (round && elapsed >= Number(round.startSec || 0) + 20) {
    const id = `breaking:${next.sessionCode}:${round.id}`;
    if (!ack.messages.includes(id)) {
      const roundNum = (next.rounds || []).findIndex(r => r.id === round.id) + 1;
      enqueueDialog({
        key: id,
        meta: 'BREAKING CASE UPDATE',
        title: roundNum > 1 ? `Round ${roundNum} evidence has shifted the temple.` : 'The investigation is officially live.',
        text: round.breakingUpdate || `New information is now active for ${round.title || 'this round'}. Review the latest evidence before the next checkpoint.`,
        ackType: 'message',
        ackValue: id
      });
    }
  }
  const warnAt = Math.floor((Number(next.totalSec || 1800) || 1800) * 0.42);
  const warningId = `redherring:${next.sessionCode}`;
  if (elapsed >= warnAt && !ack.messages.includes(warningId)) {
    enqueueDialog({
      key: warningId,
      meta: 'Careful, Archaeologists',
      title: 'Not every suspicious detail points to the temple.',
      text: 'Some clues create pressure, not proof. Focus on what connects method, motive, opportunity, and the evidence that survives comparison.',
      ackType: 'message',
      ackValue: warningId
    });
  }
  const lockId = `final-lock:${next.sessionCode}`;
  if (next.phase === 'accusation' && !ack.messages.includes(lockId)) {
    enqueueDialog({
      key: lockId,
      meta: 'Final Escape Lock-In',
      title: 'The room goes quiet.',
      text: 'The evidence board is nearly complete. Choose carefully: once your final escape sequence is submitted, it cannot be changed.',
      ackType: 'message',
      ackValue: lockId
    });
  }
}

function sponsorAdTimingIsActive(ad, next) {
  const timing = String(ad?.timing || 'after_round_2');
  const elapsed = Number(next?.elapsedSec || 0);
  const total = Number(next?.totalSec || 1800) || 1800;
  if (timing === 'waiting_room') return ['lobby','briefing'].includes(next?.phase);
  if (timing === 'after_round_2') return next?.phase === 'investigation' && elapsed >= 10 * 60;
  if (timing === 'after_round_4') return next?.phase === 'investigation' && elapsed >= 20 * 60;
  if (timing === 'before_final') return ['investigation','accusation'].includes(next?.phase) && elapsed >= Math.max(0, Number(next?.accusationOpenSec || total) - 60);
  if (timing === 'temple_closed') return next?.phase === 'revealed';
  return false;
}

function enqueueSponsorAds(next, ack) {
  const ads = (next?.sponsorAds || []).filter(ad => ad && ad.enabled !== false && ad.message);
  if (!ads.length) return;
  for (const ad of ads) {
    const id = `sponsor:${next.sessionCode}:${ad.id}:${ad.timing}`;
    if (ack.messages.includes(id)) continue;
    if (!sponsorAdTimingIsActive(ad, next)) continue;
    enqueueDialog({
      key: id,
      meta: 'Sponsor Break',
      title: ad.title || 'Tonight’s Sponsor',
      text: ad.message,
      ackType: 'message',
      ackValue: id
    });
  }
}


function inspectCountdown(next) {
  if (isArchaeologistNotesOpen()) {
    show('countdownOverlay', false);
    updateArchaeologistNotesStatus();
    return;
  }
  if (!next || !Array.isArray(next.rounds) || ['lobby','briefing','revealed'].includes(next.phase)) {
    show('countdownOverlay', false);
    return;
  }

  const elapsed = Number(next.elapsedSec || 0);
  const checkpoint = (next.accusation?.questions || [])
    .filter(q => q.stage === 'checkpoint')
    .map(q => ({ ...q, unlockSec: Number(q.unlockSec || 0) }))
    .filter(q => q.unlockSec > elapsed && q.unlockSec - elapsed <= 30)
    .sort((a,b) => a.unlockSec - b.unlockSec)[0];
  if (checkpoint) {
    const secsUntilCheckpoint = Math.ceil(checkpoint.unlockSec - elapsed);
    $('countdownMeta').textContent = 'Checkpoint Countdown';
    $('countdownTitle').textContent = 'Checkpoint opens soon';
    $('countdownReview').textContent = 'Review the carvings, physics clues, and translations from this chamber only. The checkpoint will test what this chamber revealed.';
    $('countdownNumber').textContent = secsUntilCheckpoint;
    $('countdownNext').textContent = checkpoint.prompt || 'Prepare to submit your round answer.';
    show('countdownOverlay', true);
    return;
  }
  const currentIndex = next.rounds.findIndex(r => r.id === next.currentRound?.id);
  const upcoming = currentIndex >= 0 ? next.rounds[currentIndex + 1] : null;
  if (!upcoming) {
    show('countdownOverlay', false);
    return;
  }

  const secsUntil = Number(upcoming.startSec || 0) - elapsed;
  if (secsUntil > 0 && secsUntil <= 10) {
    $('countdownMeta').textContent = 'Inter-Round Countdown';
    $('countdownTitle').textContent = `Next: ${upcoming.title}`;
    $('countdownReview').textContent = next.currentRound?.countdownReview || next.currentRound?.objective || 'Review what you know so far and get ready for the next wave of evidence.';
    $('countdownNumber').textContent = secsUntil;
    $('countdownNext').textContent = `${upcoming.dialogue || upcoming.objective || 'A new round is about to begin.'}`;
    show('countdownOverlay', true);
  } else {
    show('countdownOverlay', false);
  }
}

function enqueueDialog(item) {
  if (dialogQueue.some(d => d.key === item.key)) return;
  dialogQueue.push(item);
}

function renderDialog() {
  if ($('checkpointOverlay') && !$('checkpointOverlay').classList.contains('hidden')) return;
  if (isArchaeologistNotesOpen()) {
    updateArchaeologistNotesStatus();
    return;
  }
  if (dialogOpen || !dialogQueue.length) return;
  dialogOpen = true;
  const current = dialogQueue[0];
  $('dialogMeta').textContent = current.meta || 'Host Dialogue';
  $('dialogTitle').textContent = current.title || 'Message';
  $('dialogText').textContent = current.text || '';
  activeDialogAction = current.viewAction || null;
  $('dialogViewBtn').textContent = current.viewLabel || 'View';
  $('dialogViewBtn').classList.toggle('hidden', !activeDialogAction);
  show('dialogOverlay', true);
}

function dismissDialog() {
  const current = dialogQueue.shift();
  if (current?.ackType === 'clues' && Array.isArray(current.ackValues)) {
    current.ackValues.forEach(id => rememberAck('clue', id));
  } else if (current?.ackType && current?.ackValue) {
    rememberAck(current.ackType, current.ackValue);
  }
  dialogOpen = false;
  activeDialogAction = null;
  show('dialogOverlay', false);
  if (dialogQueue.length) renderDialog();
}

function getAckForSession(sessionCode) {
  const key = `archaeologistAck:${sessionCode}`;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return { messages: parsed.messages || [], rounds: parsed.rounds || [], results: parsed.results || [], clues: parsed.clues || [] };
  } catch {
    return { messages: [], rounds: [], results: [], clues: [] };
  }
}

function getAck() {
  return getAckForSession((state && state.sessionCode) || activeSessionKey.replace('archaeologistAck:', ''));
}

function rememberAck(type, value) {
  const ack = getAck();
  if (type === 'message' && !ack.messages.includes(value)) ack.messages.push(value);
  if (type === 'round' && !ack.rounds.includes(value)) ack.rounds.push(value);
  if (type === 'result' && !ack.results.includes(value)) ack.results.push(value);
  if (type === 'clue' && !ack.clues.includes(value)) ack.clues.push(value);
  localStorage.setItem(activeSessionKey, JSON.stringify(ack));
}

async function renderBadgeCanvas(result) {
  if (!result) return;
  const renderKey = `cleanBadgeV3:${result.playerId}:${result.updatedAt}:${result.badge}:${result.score}:${state?.difficultyLabel || ''}`;
  if (renderKey === lastBadgeKey) return;
  lastBadgeKey = renderKey;
  const canvas = $('badgeCanvas');
  const ctx = canvas.getContext('2d');
  const bg = await loadImage('/assets/serpents-breath-title-bg.png');
  const logo = await loadImage('/assets/barfly-social-logo.png').catch(() => null);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.filter = 'blur(5px)';
  drawCoverImage(ctx, bg, canvas.width, canvas.height);
  ctx.restore();

  const bgShade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgShade.addColorStop(0, 'rgba(3,5,12,0.76)');
  bgShade.addColorStop(0.48, 'rgba(3,5,12,0.62)');
  bgShade.addColorStop(1, 'rgba(3,5,12,0.88)');
  ctx.fillStyle = bgShade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(37,211,255,0.30)';
  ctx.lineWidth = 8;
  roundedRect(ctx, 44, 44, canvas.width - 88, canvas.height - 88, 34);
  ctx.stroke();

  if (logo) {
    const maxW = 210;
    const ratio = Math.min(maxW / logo.width, 86 / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    ctx.globalAlpha = 0.86;
    ctx.drawImage(logo, 74, 76, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#25d3ff';
  ctx.font = '800 34px Arial';
  ctx.fillText('CASE CLOSED', canvas.width / 2, 230);

  const centerX = canvas.width / 2;
  const emblemY = 520;
  const grd = ctx.createRadialGradient(centerX, emblemY, 60, centerX, emblemY, 260);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.58, 'rgba(255,57,185,0.20)');
  grd.addColorStop(1, 'rgba(37,211,255,0.10)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(centerX, emblemY, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = '#ffd166';
  ctx.font = '900 170px Arial';
  ctx.fillText('★', centerX, 585);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 62px Arial';
  wrapCenteredText(ctx, result.playerName || 'Archaeologist', centerX, 830, canvas.width - 250, 70);

  ctx.fillStyle = '#ffd166';
  ctx.font = '900 74px Arial';
  wrapCenteredText(ctx, result.badge || 'Archaeologist', centerX, 1000, canvas.width - 220, 82);

  ctx.fillStyle = '#f8fbff';
  ctx.font = '800 48px Arial';
  ctx.fillText(`${result.score} / ${result.total} Correct`, centerX, 1190);

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundedRect(ctx, 116, 1305, canvas.width - 232, 250, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,57,185,0.26)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px Arial';
  ctx.fillText('The Serpent’s Breath', centerX, 1398);
  ctx.fillStyle = '#ffd7f4';
  ctx.font = '700 31px Arial';
  ctx.fillText('Chichén Itzá', centerX, 1454);
  ctx.fillStyle = '#dbe7ff';
  ctx.font = '700 28px Arial';
  ctx.fillText(state?.difficultyLabel || 'Archaeologist Mystery', centerX, 1506);

  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = '700 26px Arial';
  ctx.fillText('Share your badge and challenge your friends.', centerX, 1690);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCenteredText(ctx, text, centerX, startY, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let y = startY;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, centerX, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, centerX, y);
}

function drawCoverImage(ctx, img, w, h) {
  const ir = img.width / img.height;
  const tr = w / h;
  let dw, dh, dx, dy;
  if (ir > tr) {
    dh = h;
    dw = h * ir;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / ir;
    dx = 0;
    dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function loadImage(src) {
  if (imageCache[src]) return imageCache[src];
  imageCache[src] = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  return imageCache[src];
}

async function canvasBlob() {
  const canvas = $('badgeCanvas');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function shareBadge() {
  const result = getMyResult();
  if (!result) return;
  await renderBadgeCanvas(result);
  const blob = await canvasBlob();
  if (!blob) return;
  const safeName = (result.playerName || 'archaeologist').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'archaeologist';
  const file = new File([blob], `pelican-to-escape-${safeName}.png`, { type: 'image/png' });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: 'The Serpent’s Breath', text: `${result.playerName} earned the ${result.badge} badge.`, files: [file] });
    } else {
      await downloadBadge();
    }
  } catch (_err) {}
}

async function downloadBadge() {
  const result = getMyResult();
  if (!result) return;
  await renderBadgeCanvas(result);
  const canvas = $('badgeCanvas');
  const safeName = (result.playerName || 'archaeologist').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'archaeologist';
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `pelican-to-escape-${safeName}.png`;
  link.click();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

// Build marker: archaeologist-notes-stays-open-training-level-1-002

ensureLobbyCountdownTimer();
