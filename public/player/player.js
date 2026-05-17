const APP_META = {
  archaeologistNotes: ['🗒️','Notes'],
  hint: ['💡','Hint']
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
let titleHoldReady = false;
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
let torchPointerBound = false;
let torchIsDragging = false;
let levelSummaryOpen = false;
let activeLevelSummaryRoundId = '';
let pendingForcedLevelSummaryRoundId = '';
let levelSummaryPauseInFlight = false;
let lastTorchApiActive = false;
let lastTorchApiAt = 0;
let localTorchActive = false;
let lobbyCountdownTimer = null;
let lobbyTutorialAcknowledged = false;
let checkpointPopupQuestionId = '';
let checkpointPopupDismissed = {};
let checkpointPopupSelected = '';
let checkpointPopupSelections = {};
let checkpointPopupIsSubmitting = false;
let templePuzzleState = { roundId: '', selected: {}, sequence: [], message: '', solved: false };
const HOST_ISSUE_MAILTO = 'mailto:INFO@BARFLY.SOCIAL?subject=Serpents%20Breath%20Game%20Issue';

const params = new URLSearchParams(location.search);
if (params.get('access')) $('accessCode').value = params.get('access').toUpperCase();
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
if ($('myRsvpBackBtn')) $('myRsvpBackBtn').onclick = () => setIntroStage('experience');
if ($('findMyRsvpBtn')) $('findMyRsvpBtn').onclick = findMyRsvp;
$('rsvpBackBtn').onclick = () => setIntroStage('experience');
if ($('rsvpDateBackBtn')) $('rsvpDateBackBtn').onclick = () => setIntroStage('experience');
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
if ($('enterChamberBtn')) {
  $('enterChamberBtn').onclick = enterChamberFromSummary;
  $('enterChamberBtn').addEventListener('touchend', (event) => { event.preventDefault(); enterChamberFromSummary(); }, { passive: false });
}
$('dialogViewBtn').onclick = () => { const action = activeDialogAction; dismissDialog(); if (typeof action === 'function') action(); };
if ($('enterInvestigationBtn')) $('enterInvestigationBtn').onclick = () => requireTermsAcceptance(() => setIntroStage('join'));
if ($('shareGameBtn')) $('shareGameBtn').onclick = openShareLinkModal;
function acknowledgeLobbyTutorial() {
  lobbyTutorialAcknowledged = true;
  try { localStorage.setItem('serpentsBreathLobbyTutorialAcknowledged', 'yes'); } catch (_err) {}
  if ($('lobbyTutorialBox')) $('lobbyTutorialBox').classList.add('hidden');
  if ($('lobbyTutorialReady')) $('lobbyTutorialReady').classList.remove('hidden');
}

function reviewLobbyTutorial() {
  lobbyTutorialAcknowledged = false;
  if ($('lobbyTutorialReady')) $('lobbyTutorialReady').classList.add('hidden');
  if ($('lobbyTutorialBox')) $('lobbyTutorialBox').classList.remove('hidden');
}

function restoreLobbyTutorialState() {
  try {
    lobbyTutorialAcknowledged = localStorage.getItem('serpentsBreathLobbyTutorialAcknowledged') === 'yes';
  } catch (_err) {
    lobbyTutorialAcknowledged = false;
  }
  if (lobbyTutorialAcknowledged) acknowledgeLobbyTutorial();
  else reviewLobbyTutorial();
}

function continueFromTitle() {
  if (!titleHoldReady) return;
  setIntroStage('experience');
}

if ($('titleScreen')) {
  $('titleScreen').addEventListener('click', continueFromTitle);
  $('titleScreen').addEventListener('touchend', (event) => {
    event.preventDefault();
    continueFromTitle();
  }, { passive: false });
  $('titleScreen').setAttribute('tabindex', '0');
  $('titleScreen').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') continueFromTitle();
  });
}

if ($('titleGraphicImage')) {
  $('titleGraphicImage').addEventListener('error', () => {
    // Fallback for unusual hosting paths.
    if (!$('titleGraphicImage').dataset.absoluteTried) {
      $('titleGraphicImage').dataset.absoluteTried = 'yes';
      $('titleGraphicImage').src = '../assets/serpents-breath-title-bg.png';
    }
  });
}

if ($('torchToggleBtn')) {
  $('torchToggleBtn').onclick = () => {
    if ($('visualChamber')) $('visualChamber').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}
if ($('closeShareLinkBtn')) $('closeShareLinkBtn').onclick = closeShareLinkModal;
if ($('copyShareLinkBtn')) $('copyShareLinkBtn').onclick = copyShareLink;
if ($('nativeShareBtn')) $('nativeShareBtn').onclick = nativeShareGameLink;
$('backToTitleBtn').onclick = () => setIntroStage('experience');
$('detailHomeBtn').onclick = goHomeDashboard;
$('accuseHomeBtn').onclick = goHomeDashboard;
$('revealReturnBtn').onclick = returnToExternalApp;
if ($('findNewGameBtn')) $('findNewGameBtn').onclick = findNewGame;
if ($('openHintBtn')) $('openHintBtn').onclick = () => openApp('hint');
if ($('openNotesBtn')) $('openNotesBtn').onclick = () => openApp('archaeologistNotes');
$('shareBadgeBtn').onclick = shareBadge;
$('downloadBadgeBtn').onclick = downloadBadge;
if ($('termsAgreeBtn')) $('termsAgreeBtn').onclick = acceptTermsAndContinue;
if ($('termsCancelBtn')) $('termsCancelBtn').onclick = closeTermsOverlay;
$('accessCode').addEventListener('blur', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 5) loadAccessPreview(code); });
$('accessCode').addEventListener('input', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 5) loadAccessPreview(code); else updateLevelLabels(null); });
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
  if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Scan the QR code or copy the link.';
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
    const temp = document.createElement('textarea');
    temp.value = shareUrl;
    temp.setAttribute('readonly', '');
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
      if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Link copied.';
    } catch (copyErr) {
      if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Copy failed. Use your browser share menu.';
    }
    document.body.removeChild(temp);
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
  const code = $('accessCode')?.value?.trim?.().toUpperCase() || '';
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

restoreLobbyTutorialState();
startIntro();
if (params.get('access')) loadAccessPreview(params.get('access').toUpperCase());

function startIntro() {
  clearTimeout(splashTimer);
  titleHoldReady = false;
  setIntroStage('splash');
  splashTimer = setTimeout(() => {
    setIntroStage('title');
  }, 2000);
}

function setIntroStage(stage) {
  titleHoldReady = stage === 'title';
  toggleScreen('splashScreen', stage === 'splash');
  toggleScreen('titleScreen', stage === 'title');
  toggleScreen('experienceScreen', stage === 'experience');
  toggleScreen('rsvpScreen', stage === 'rsvp');
  toggleScreen('myRsvpScreen', stage === 'myRsvp');
  toggleScreen('joinScreen', stage === 'join');
  if (stage === 'title') {
    document.body.classList.add('onTitleGraphic');
  } else {
    document.body.classList.remove('onTitleGraphic');
  }
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
    const normalizedCode = String(code || '').trim().toUpperCase();
    const preview = await api(`/api/access/${encodeURIComponent(normalizedCode)}/preview`);
    currentAccessPreviewCode = normalizedCode;
    currentAccessPreviewIsDemo = Boolean(preview.demoMode);
    updateLevelLabels(preview);
  } catch (_err) {
    currentAccessPreviewCode = String(code || '').trim().toUpperCase();
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
    <p>${escapeHtml(item.levelLabel || item.difficultyLabel || item.difficulty || 'Skill Level TBD')} · ${escapeHtml(item.venue || 'Chichén Itzá • Mexico')}</p>
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
  const myRsvpVisible = $('myRsvpScreen') && !$('myRsvpScreen').classList.contains('hidden');
  const msg = myRsvpVisible ? $('myRsvpMessage') : $('rsvpMessage');
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) {
    if (msg) msg.textContent = 'No check-in code is available yet.';
    return;
  }
  if ($('accessCode')) $('accessCode').value = cleanCode;
  if (msg) msg.textContent = 'Opening your game...';
  try { await loadAccessPreview(cleanCode); } catch (_err) {}
  requireTermsAcceptance(() => join(cleanCode, msg), { force: false, persist: true });
}

function syncServerClock(nextState) {
  const serverTime = Number(nextState?.serverTime || 0);
  if (!Number.isFinite(serverTime) || serverTime <= 0) {
    serverClockOffsetMs = 0;
    return;
  }
  serverClockOffsetMs = Date.now() - serverTime;
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
  const accessCode = String(accessCodeOverride || $('accessCode').value || '').trim().toUpperCase();
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
  maybeOpenLevelSummary(next);
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

  // Escape-room levels are unlocked by chamber progression, not timed clue drops.
  // Keep internal counters updated without showing old clue-update notifications.
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
    title: appLabels.length === 1 ? `${labelText} Updated` : 'Temple Tools Updated',
    text: `A new chamber detail has shifted in ${labelText}. Return to the temple tools when ready.`,
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

function show(id, yes = true) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !yes);
}

function render() {
  if (!state) return;

  const phase = state.phase || 'lobby';
  const inLobby = phase === 'lobby';
  const inBriefing = phase === 'briefing';
  const inReveal = phase === 'revealed';
  const inGame = !inLobby && !inBriefing && !inReveal;

  show('lobbyCard', inLobby);
  show('briefingCard', inBriefing);
  show('progressCard', inGame);
  show('homeCard', inGame && !currentApp);
  show('appDetailCard', inGame && currentApp && currentApp !== 'accuse');
  show('accuseCard', inGame && currentApp === 'accuse');
  show('revealCard', inReveal);

  if ($('phasePill')) $('phasePill').textContent = phase === 'accusation_locked' ? 'Locked' : phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if ($('timerPill')) $('timerPill').textContent = state.levelSummaryPaused ? `${fmt(state.remainingSec)} PAUSED` : fmt(state.remainingSec);
  if ($('oxygenModePill')) $('oxygenModePill').textContent = state.torchActive ? 'O₂ x2' : 'O₂ x1';
  if ($('torchToggleBtn')) {
    $('torchToggleBtn').textContent = state.torchActive ? '🔥 Torch On' : '🔥 Torch Off';
    $('torchToggleBtn').classList.toggle('torchOn', Boolean(state.torchActive));
  }

  const currentRound = state.currentRound || {};
  if ($('roundPill')) {
    $('roundPill').classList.toggle('hidden', inLobby || inBriefing || inReveal || !currentRound.title);
    $('roundPill').textContent = currentRound.shortTitle || currentRound.title || 'Chamber';
  }

  if (inLobby) {
    const playerCount = Array.isArray(state.players) ? state.players.length : 0;
    if ($('lobbyLevel')) $('lobbyLevel').textContent = state.difficultyLabel || state.difficulty || 'Temple Escape';
    if ($('lobbyStatusText')) $('lobbyStatusText').textContent = 'Waiting for Host';
    if ($('lobbyAccessCode')) $('lobbyAccessCode').textContent = localStorage.getItem('archaeologistAccessCode') || '—';
    if ($('lobbyCode')) $('lobbyCode').textContent = state.sessionCode || '';
    if ($('lobbyPlayers')) $('lobbyPlayers').textContent = String(playerCount);
    if ($('lobbyCountdown')) $('lobbyCountdown').textContent = state.scheduledStartAt ? lobbyCountdownText(state.scheduledStartAt) : '--:--';
    if ($('lobbyCountdownNote')) $('lobbyCountdownNote').textContent = state.scheduledStartLabel ? `Scheduled start: ${state.scheduledStartLabel}` : 'Waiting for the host to begin.';
    restoreLobbyTutorialState();
    return;
  }

  if (inBriefing) {
    renderStoryBriefingContent();
    if ($('storyCountdown')) $('storyCountdown').textContent = fmt(state.briefingRemainingSec || 0);
    updateStoryBriefing();
    renderStoryTimerBar();
    return;
  }

  if (inReveal) {
    renderReveal();
    return;
  }

  renderProgressBar();
  if (!currentApp) renderTorchChamber();
  if (!currentApp) renderTemplePuzzleModule();
  if (!currentApp) renderChamberControls();
  else if (currentApp === 'accuse') renderAccuse();
  else renderAppDetail();
  renderCheckpointPopup();
  renderDialog();
}

function lobbyCountdownText(startMs) {
  const diff = Math.max(0, Number(startMs || 0) - Date.now() - serverClockOffsetMs);
  if (!diff) return '00:00';
  return fmt(Math.ceil(diff / 1000));
}

function countSolvedTempleGates(totalRounds = 5) {
  const rounds = Array.isArray(state?.rounds) ? state.rounds : [];
  const ids = rounds.length ? rounds.map((r, i) => r.id || `r${i + 1}`) : Array.from({ length: totalRounds }, (_, i) => `r${i + 1}`);
  return ids.filter(id => isPuzzleStoredSolved(id)).length;
}

function renderProgressBar() {
  if (!state?.currentRound) return;
  const r = state.currentRound;
  const total = Math.max(1, Number(state.totalSec || 1));
  const pct = Math.max(0, Math.min(100, (Number(state.elapsedSec || 0) / total) * 100));
  $('progressRound').textContent = r.title || 'Current Chamber';
  $('progressTime').textContent = state.levelSummaryPaused ? `${fmt(state.remainingSec)} left · paused` : `${fmt(state.remainingSec)} left`;
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
  const solvedGates = countSolvedTempleGates(totalRounds);
  if ($('templeBoardRound')) $('templeBoardRound').textContent = `${roundNumber}/${totalRounds}`;
  if ($('templeBoardEvidence')) $('templeBoardEvidence').textContent = String(visibleClues.length);
  if ($('templeBoardStatements')) $('templeBoardStatements').textContent = String(statements.length);
  if ($('templeBoardCheckpoints')) $('templeBoardCheckpoints').textContent = `${solvedGates}/${totalRounds}`;
}

function isArchaeologistNotesOpen() {
  return currentApp === 'archaeologistNotes' && $('appDetailCard') && !$('appDetailCard').classList.contains('hidden');
}

function queuedUpdateCount() {
  let count = dialogQueue.length;
  try { if (nextUnansweredCheckpointQuestion()) count += 1; } catch (_err) {}
  return count;
}


function getDifficultyLevelNumber() {
  const raw = `${state?.difficulty || ''} ${state?.difficultyLabel || ''} ${state?.title || ''}`.toLowerCase();
  if (/master|level\s*5|5/.test(raw)) return 5;
  if (/senior|level\s*4|4/.test(raw)) return 4;
  if (/field|level\s*3|3/.test(raw)) return 3;
  if (/explorer|level\s*2|2/.test(raw)) return 2;
  return 1;
}

function getTorchDiameter() {
  const level = getDifficultyLevelNumber();
  return ({ 1: 160, 2: 145, 3: 130, 4: 115, 5: 100 })[level] || 130;
}

function getTorchSizeLabel() {
  const level = getDifficultyLevelNumber();
  return ({ 1: 'Large', 2: 'Medium-Large', 3: 'Standard', 4: 'Small', 5: 'Very Small' })[level] || 'Standard';
}

function currentChamberVisualData() {
  const r = state?.currentRound || {};
  const title = r.shortTitle || r.title || 'Temple Chamber';
  const idx = currentChamberIndex();
  const level = getDifficultyLevelNumber();
  const hard = level >= 4;
  const master = level >= 5;
  const byChamber = [
    {
      title,
      mode: 'translationChamber',
      objective: 'Use the torch to uncover the wall glyphs first. The translation buttons below unlock only after the carvings are found in the chamber.',
      glyphs: [
        { cls: 'glyph translationGlyph serpentReveal', text: '🐍', label: 'Serpent glyph', hint: 'First living carving', discover: 'serpent' },
        { cls: 'glyph translationGlyph sunReveal', text: '☉', label: 'Sun glyph', hint: 'Bright decoy', discover: 'sun' },
        { cls: 'glyph translationGlyph breathReveal', text: '≈', label: 'Breath glyph', hint: 'Air line carving', discover: 'breath' },
        { cls: 'glyph translationGlyph stoneReveal', text: '◆', label: 'Stone glyph', hint: 'Heavy decoy', discover: 'stone' },
        { cls: 'glyph translationGlyph eastReveal', text: '➜', label: 'East glyph', hint: 'Exit direction', discover: 'east' }
      ]
    },
    {
      title,
      mode: 'shadowChamber',
      objective: 'Drag the torch across the serpent wall. When the shadow points to a seal, choose the matching seal below.',
      glyphs: [
        { cls: 'glyph shadowSerpentGlyph', text: '🐍', label: 'Serpent carving', hint: 'The serpent points with shadow, not its head', discover: 'shadow-serpent' },
        { cls: 'glyph shadowEyeGlyph', text: '◉', label: 'Eye carving', hint: 'The eye sees only by fire', discover: 'shadow-eye' },
        { cls: 'glyph shadowSealGlyph shadowSealObsidian', text: '◒', label: 'Obsidian Mouth seal', hint: 'A sealed mouth holds still air', action: 'seal', value: 'obsidian', discover: 'obsidian' },
        { cls: 'glyph shadowSealGlyph shadowSealJade', text: '◆', label: 'Jade Eye seal', hint: 'This seal breathes when the shadow finds it', action: 'seal', value: 'jade-eye', discover: 'jade-eye' },
        { cls: 'glyph shadowSealGlyph shadowSealSun', text: '☉', label: 'Sun Disk seal', hint: 'Bright, but too direct', action: 'seal', value: 'sun', discover: 'sun-seal' },
        { cls: 'shadowCastMarker', text: '', label: 'Serpent shadow', hint: '' }
      ]
    },
    {
      title,
      mode: 'balanceChamber',
      objective: 'Reveal the lever arm, stone weights, and floor distance marks before solving the balance puzzle below.',
      glyphs: [
        { cls: 'glyph balanceLeverReveal', text: '⚖', label: 'Lever arm', hint: 'Fixed left torque: Jaguar 3 × 2', discover: 'lever' },
        { cls: 'glyph jaguarWeightReveal', text: '🐆', label: 'Jaguar stone', hint: 'Weight 3', discover: 'jaguar' },
        { cls: 'glyph serpentWeightReveal', text: '🐍', label: 'Serpent stone', hint: 'Weight 2', discover: 'serpent-weight' },
        { cls: 'glyph featherWeightReveal', text: '🪶', label: 'Feather stone', hint: 'Weight 1', discover: 'feather' },
        { cls: 'glyph distanceReveal', text: hard ? 'Ⅱ Ⅲ' : '2 → 3', label: 'Floor distance marks', hint: master ? 'Distance marks are broken, but 3 is readable' : 'Third notch balances the serpent', discover: 'distance-3' }
      ]
    },
    {
      title,
      mode: 'pathChamber',
      objective: 'Reveal each tunnel entrance with the torch. Choose only after the chamber shows which path still breathes.',
      glyphs: [
        { cls: 'glyph tunnelGlyph northTunnelReveal', text: '◓', label: 'North tunnel', hint: 'Closed eye · stale air', action: 'path', value: 'north', discover: 'north' },
        { cls: 'glyph tunnelGlyph westTunnelReveal', text: ')))', label: 'West tunnel', hint: 'Loud echo · heavy dust', action: 'path', value: 'west', discover: 'west' },
        { cls: 'glyph tunnelGlyph southeastTunnelReveal', text: '≈🐍', label: 'Southeast tunnel', hint: 'Moving air · breath serpent', action: 'path', value: 'southeast', discover: 'southeast' }
      ]
    },
    {
      title,
      mode: 'gateChamber',
      objective: 'Search wall, floor, ceiling, and gate. The final seal buttons unlock only after their carvings are revealed here.',
      glyphs: [
        { cls: 'glyph gateStarReveal', text: '✦', label: 'Ceiling star', hint: 'First seal', discover: 'star' },
        { cls: 'glyph gateSerpentReveal', text: '🐍', label: 'Wall serpent', hint: 'Second seal', discover: 'serpent' },
        { cls: 'glyph gateBreathReveal', text: '≈', label: 'Floor breath line', hint: 'Third seal', discover: 'breath' },
        { cls: 'glyph gateJadeReveal', text: '◆', label: 'Living jade seal', hint: 'Final seal', discover: 'jade' },
        { cls: 'glyph gateSunReveal', text: '☉', label: 'Sun disk', hint: 'Old decoy', discover: 'sun' }
      ]
    }
  ];
  return byChamber[idx] || byChamber[0];
}

function currentChamberIndex() {
  const rid = state?.currentRound?.id || '';
  const rounds = Array.isArray(state?.rounds) ? state.rounds : [];
  const idx = rounds.findIndex(r => r.id === rid);
  if (idx >= 0) return Math.min(idx, 4);
  const elapsed = Number(state?.elapsedSec || 0);
  if (elapsed >= 1200) return 4;
  if (elapsed >= 900) return 3;
  if (elapsed >= 600) return 2;
  if (elapsed >= 300) return 1;
  return 0;
}

function resetPuzzleStateIfNeeded(roundId) {
  if (templePuzzleState.roundId === roundId) return;
  templePuzzleState = { roundId, selected: {}, sequence: [], message: '', solved: false };
}

function puzzleSolvedStorageKey(roundId) {
  return `serpent-puzzle-solved:${state?.sessionCode || 'local'}:${roundId}`;
}

function isPuzzleStoredSolved(roundId) {
  try { return localStorage.getItem(puzzleSolvedStorageKey(roundId)) === 'yes'; } catch (_err) { return false; }
}

function markPuzzleSolved(roundId, message) {
  templePuzzleState.solved = true;
  templePuzzleState.message = message || 'Puzzle solved. The gate is opening.';
  try { localStorage.setItem(puzzleSolvedStorageKey(roundId), 'yes'); } catch (_err) {}
  notify('Chamber puzzle solved');
  renderTemplePuzzleModule();
  advanceAfterPuzzleSolved(roundId);
}

async function advanceAfterPuzzleSolved(roundId) {
  if (!state?.sessionCode || !roundId) return;
  if (templePuzzleState.advanceInFlight) return;
  templePuzzleState.advanceInFlight = true;
  templePuzzleState.message = 'The gate is opening. Preparing the next chamber...';
  renderTemplePuzzleModule();
  try {
    const data = await api(`/api/sessions/${state.sessionCode}/chamber/complete`, {
      method: 'POST',
      body: { roundId, playerId }
    });
    if (data?.state) {
      if (data.nextRoundId) pendingForcedLevelSummaryRoundId = data.nextRoundId;
      receiveState(data.state, true);
      if (data.nextRoundId && !levelSummaryOpen) {
        const nextRound = (state?.rounds || []).find(r => r.id === data.nextRoundId) || state?.currentRound;
        if (nextRound) openLevelSummary(nextRound, state);
      }
    }
  } catch (err) {
    console.warn('Unable to advance chamber automatically', err);
    templePuzzleState.message = err?.message || 'The chamber is solved, but the next gate did not open automatically. Ask the host to refresh the session.';
    renderTemplePuzzleModule();
  } finally {
    templePuzzleState.advanceInFlight = false;
  }
}

function getPuzzleData() {
  const idx = currentChamberIndex();
  const round = state?.currentRound || {};
  const rid = round.id || `r${idx + 1}`;
  resetPuzzleStateIfNeeded(rid);
  if (isPuzzleStoredSolved(rid)) templePuzzleState.solved = true;
  const difficulty = getDifficultyLevelNumber();
  const hard = difficulty >= 4;
  const master = difficulty >= 5;
  const list = [
    {
      type: 'glyph-sequence',
      title: 'Puzzle 1: Translation Wall',
      subtitle: 'Reveal the carvings before you translate them.',
      prompt: 'The wall inscription is unreadable until the torch finds each carving. Search the black chamber first, then tap only the revealed glyphs in the order the wall suggests.',
      answer: ['serpent','breath','east'],
      items: [
        ['serpent','🐍','Serpent'], ['sun','☉','Sun'], ['breath','≈','Breath'], ['stone','◆','Stone'], ['east','➜','East']
      ],
      clue: hard ? 'Harder levels split the reading order across wall and floor. Watch where each revealed carving faces.' : 'Use the torch to find the glyphs and their reading direction before pressing anything.'
    },
    {
      type: 'shadow-align',
      title: 'Puzzle 2: Shadow Wall',
      subtitle: 'Use the torch inside the chamber, not a slider.',
      prompt: 'The serpent does not point with its head. It points with its shadow. Drag the torch across the black chamber until the shadow reveals which seal still breathes, then tap that seal.',
      answer: 'jade-eye',
      clue: master ? 'The shadow reveals itself only near a narrow torch position beside the upper-right wall.' : 'Move the torch across the serpent wall until the Jade Eye seal catches the shadow.'
    },
    {
      type: 'balance',
      title: 'Puzzle 3: Balance Chamber',
      subtitle: 'Solve the lever using torque, not guesswork.',
      prompt: 'The balance mechanism cannot be solved from the panel alone. Reveal the lever inscription, stone weights, and distance marks in the black chamber, then choose the right-side stone and distance.',
      answerStone: 'serpent',
      answerDistance: '3',
      clue: hard ? 'Torque equals weight × distance from pivot. The missing numbers are carved into the chamber.' : 'Reveal the lever and floor marks before choosing a weight and distance.'
    },
    {
      type: 'path-choice',
      title: 'Puzzle 4: Three Paths',
      subtitle: 'Choose the route with evidence of breathable air.',
      prompt: 'The tunnel names are not enough. Reveal each doorway with the torch and choose the entrance with evidence of moving air and breath-serpent markings.',
      answer: 'southeast',
      paths: [
        ['north','North Tunnel','Closed-eye glyph · stale air'],
        ['west','West Tunnel','Long echo · heavy dust'],
        ['southeast','Southeast Tunnel','Moving air · breath serpent marks']
      ],
      clue: master ? 'Do not trust the loudest echo. Use the torch to find evidence of outward air.' : 'Use the black chamber to inspect every tunnel before choosing.'
    },
    {
      type: 'seal-sequence',
      title: 'Puzzle 5: The Serpent Gate',
      subtitle: 'Combine wall, floor, ceiling, and airflow clues.',
      prompt: 'The final sequence is written across the chamber itself. Search wall, floor, ceiling, and gate with the torch before pressing any seals.',
      answer: ['star','serpent','breath','jade'],
      items: [['star','✦','Star'], ['jade','◆','Jade'], ['serpent','🐍','Serpent'], ['sun','☉','Sun'], ['breath','≈','Breath']],
      clue: master ? 'The order is hidden across ceiling, wall, floor, and gate. Reveal each surface before deciding.' : 'Search the chamber surfaces with the torch; the panel will only activate seals you have found.'
    }
  ];
  return { ...list[idx], roundId: rid, chamberNumber: idx + 1 };
}

function renderTemplePuzzleModule() {
  const el = $('templePuzzleModule');
  if (!el || !state) return;
  if (!['investigation','accusation','accusation_locked'].includes(state.phase)) { el.innerHTML = ''; return; }
  const pz = getPuzzleData();
  const solved = templePuzzleState.solved;
  const status = solved ? `<div class="puzzleSolvedBanner">✓ Chamber puzzle solved. The next chamber can unlock.</div>` : `<div class="puzzleHintBanner">Torch clue: ${escapeHtml(pz.clue)}</div>`;
  let body = '';
  if (pz.type === 'glyph-sequence') body = renderGlyphSequencePuzzle(pz);
  if (pz.type === 'shadow-align') body = renderShadowAlignPuzzle(pz);
  if (pz.type === 'balance') body = renderBalancePuzzle(pz);
  if (pz.type === 'path-choice') body = renderPathChoicePuzzle(pz);
  if (pz.type === 'seal-sequence') body = renderSealSequencePuzzle(pz);
  el.innerHTML = `
    <div class="puzzleHeader">
      <div><span class="time">Chamber ${pz.chamberNumber} Puzzle</span><h3>${escapeHtml(pz.title)}</h3><p>${escapeHtml(pz.subtitle)}</p></div>
      <span class="puzzleBadge">Interactive</span>
    </div>
    <p class="puzzlePrompt">${escapeHtml(pz.prompt)}</p>
    ${body}
    ${templePuzzleState.message ? `<p class="puzzleMessage ${solved ? 'good' : 'bad'}">${escapeHtml(templePuzzleState.message)}</p>` : ''}
    ${status}
  `;
  bindPuzzleControls();
}

function renderGlyphSequencePuzzle(pz) {
  const seq = templePuzzleState.sequence || [];
  const discovered = getDiscoveredClues();
  const unlocked = pz.items.filter(([id]) => discovered.includes(id));
  return `
    <div class="discoveryNotice ${unlocked.length >= 3 ? 'ready' : ''}">${unlocked.length ? `${unlocked.length} glyph carving(s) revealed by torch.` : 'Drag the torch across the black chamber wall to reveal glyphs before translating.'}</div>
    <div class="glyphPuzzleWall">
      ${pz.items.map(([id,symbol,label]) => {
        const found = discovered.includes(id);
        return `<button class="carvedTile ${found ? 'discoveredChoice' : 'lockedChoice'}" data-puzzle-action="seq" data-value="${id}" type="button" ${found ? '' : 'disabled'}><b>${found ? symbol : '▒'}</b><span>${found ? escapeHtml(label) : 'Unrevealed carving'}</span></button>`;
      }).join('')}
    </div>
    <div class="sequenceTray"><b>Your translation:</b> <span>${seq.length ? seq.map(x => escapeHtml(labelForPuzzleValue(pz, x))).join(' → ') : 'Reveal and tap glyphs to build the phrase'}</span></div>
    <div class="miniActionRow"><button class="secondary compact" data-puzzle-action="reset-seq" type="button">Reset</button><button class="compact" data-puzzle-action="check-seq" type="button">Check Translation</button></div>
  `;
}

function renderSealSequencePuzzle(pz) {
  const seq = templePuzzleState.sequence || [];
  const discovered = getDiscoveredClues();
  return `
    <div class="discoveryNotice ${['star','serpent','breath','jade'].every(k => discovered.includes(k)) ? 'ready' : ''}">Search the final chamber. Seals activate only after their carvings are revealed by torchlight.</div>
    <div class="finalSealGate">
      ${pz.items.map(([id,symbol,label]) => {
        const found = discovered.includes(id);
        return `<button class="sealButton ${found ? 'discoveredChoice' : 'lockedChoice'}" data-puzzle-action="seq" data-value="${id}" type="button" ${found ? '' : 'disabled'}><b>${found ? symbol : '▒'}</b><span>${found ? escapeHtml(label) : 'Hidden seal'}</span></button>`;
      }).join('')}
    </div>
    <div class="sequenceTray"><b>Seal sequence:</b> <span>${seq.length ? seq.map(x => escapeHtml(labelForPuzzleValue(pz, x))).join(' → ') : 'Reveal and press seals in order'}</span></div>
    <div class="miniActionRow"><button class="secondary compact" data-puzzle-action="reset-seq" type="button">Reset</button><button class="compact" data-puzzle-action="check-seq" type="button">Open Gate</button></div>
  `;
}

function renderShadowAlignPuzzle(pz) {
  const selected = templePuzzleState.selected.seal || '';
  const revealed = templePuzzleState.selected.shadowRevealed === 'yes';
  const seals = [['obsidian','Obsidian Mouth'],['jade-eye','Jade Eye'],['sun','Sun Disk']];
  return `
    <div class="shadowPuzzleStage ${revealed ? 'shadowReady' : ''}">
      <div class="shadowInstructionCard">
        <b>${revealed ? 'Shadow found.' : 'Search the chamber wall.'}</b>
        <span>${revealed ? 'The serpent shadow points toward one breathing seal. Choose carefully.' : 'Press and drag the torch inside the black chamber view until the serpent shadow points to a seal.'}</span>
      </div>
      <div class="sealChoices shadowSealChoices">
        ${seals.map(([id,label]) => `<button class="stoneChoice ${selected === id ? 'selected' : ''} ${revealed && id === pz.answer ? 'shadowRevealedSeal' : ''}" data-puzzle-action="seal" data-value="${id}" type="button">${escapeHtml(label)}</button>`).join('')}
      </div>
      <button class="compact" data-puzzle-action="check-shadow" type="button">Test Shadow Seal</button>
    </div>
  `;
}

function renderBalancePuzzle(pz) {
  const stone = templePuzzleState.selected.stone || '';
  const distance = templePuzzleState.selected.distance || '';
  const discovered = getDiscoveredClues();
  const stones = [['jaguar','Jaguar Stone · weight 3','jaguar'], ['serpent','Serpent Stone · weight 2','serpent-weight'], ['feather','Feather Stone · weight 1','feather']];
  const distances = ['1','2','3','4'];
  const torque = stone === 'jaguar' ? 3 * Number(distance || 0) : stone === 'serpent' ? 2 * Number(distance || 0) : stone === 'feather' ? Number(distance || 0) : 0;
  const leverFound = discovered.includes('lever');
  const distanceFound = discovered.includes('distance-3');
  return `
    <div class="discoveryNotice ${leverFound && distanceFound ? 'ready' : ''}">${leverFound ? 'Lever inscription revealed.' : 'Find the lever inscription in the chamber.'} ${distanceFound ? 'Floor distance marks revealed.' : 'Find the floor distance marks.'}</div>
    <div class="balanceStage">
      <div class="leverBar"><span class="leftWeight">${leverFound ? 'Jaguar 3 × 2 = 6' : 'Left torque hidden'}</span><span class="pivot">▲</span><span class="rightWeight">${torque ? `Right torque = ${torque}` : 'Choose right side'}</span></div>
      <div class="choiceGroup"><b>Right-side stone</b>${stones.map(([id,label,key]) => {
        const found = discovered.includes(key);
        return `<button class="stoneChoice ${stone === id ? 'selected' : ''} ${found ? 'discoveredChoice' : 'lockedChoice'}" data-puzzle-action="balance-stone" data-value="${id}" type="button" ${found ? '' : 'disabled'}>${found ? escapeHtml(label) : 'Unrevealed stone'}</button>`;
      }).join('')}</div>
      <div class="choiceGroup"><b>Distance from pivot</b>${distances.map(d => `<button class="stoneChoice ${distance === d ? 'selected' : ''} ${distanceFound ? 'discoveredChoice' : 'lockedChoice'}" data-puzzle-action="balance-distance" data-value="${d}" type="button" ${distanceFound ? '' : 'disabled'}>${distanceFound ? d : '?'}</button>`).join('')}</div>
      <button class="compact" data-puzzle-action="check-balance" type="button">Test Balance</button>
    </div>
  `;
}

function renderPathChoicePuzzle(pz) {
  const selected = templePuzzleState.selected.path || '';
  const discovered = getDiscoveredClues();
  return `
    <div class="discoveryNotice ${['north','west','southeast'].every(k => discovered.includes(k)) ? 'ready' : ''}">Reveal tunnel carvings inside the black chamber before choosing a route.</div>
    <div class="pathStage">
      ${pz.paths.map(([id,name,detail]) => {
        const found = discovered.includes(id);
        return `<button class="tunnelDoor ${selected === id ? 'selected' : ''} ${found ? 'discoveredChoice' : 'lockedChoice'}" data-puzzle-action="path" data-value="${id}" type="button" ${found ? '' : 'disabled'}><b>${found ? escapeHtml(name) : 'Hidden Tunnel'}</b><span>${found ? escapeHtml(detail) : 'Use the torch to inspect this entrance'}</span></button>`;
      }).join('')}
    </div>
    <button class="compact" data-puzzle-action="check-path" type="button">Choose Route</button>
  `;
}

function labelForPuzzleValue(pz, value) {
  const item = (pz.items || []).find(row => row[0] === value);
  return item ? item[2] : value;
}

function bindPuzzleControls() {
  const el = $('templePuzzleModule');
  if (!el || el.dataset.bound === 'yes') return;
  el.dataset.bound = 'yes';
  el.addEventListener('click', event => {
    const btn = event.target.closest('[data-puzzle-action]');
    if (!btn) return;
    const action = btn.dataset.puzzleAction;
    const value = btn.dataset.value || '';
    handlePuzzleAction(action, value);
  });
  el.addEventListener('input', event => {
    const input = event.target.closest('[data-puzzle-action="angle"]');
    if (!input) return;
    templePuzzleState.selected.angle = input.value;
    templePuzzleState.message = '';
    renderTemplePuzzleModule();
  });
}

function handlePuzzleAction(action, value) {
  const pz = getPuzzleData();
  if (templePuzzleState.solved && !['reset-seq'].includes(action)) return;
  if (action === 'seq') {
    templePuzzleState.sequence = [...(templePuzzleState.sequence || []), value].slice(0, (pz.answer || []).length);
    templePuzzleState.message = '';
    renderTemplePuzzleModule();
    return;
  }
  if (action === 'reset-seq') {
    templePuzzleState.sequence = [];
    templePuzzleState.solved = false;
    templePuzzleState.message = 'Sequence cleared.';
    try { localStorage.removeItem(puzzleSolvedStorageKey(pz.roundId)); } catch (_err) {}
    renderTemplePuzzleModule();
    return;
  }
  if (action === 'check-seq') {
    const ok = JSON.stringify(templePuzzleState.sequence || []) === JSON.stringify(pz.answer || []);
    if (pz.type === 'seal-sequence') {
      return ok ? markPuzzleSolved(pz.roundId, 'The Serpent Gate opens. You found the living exit sequence.') : failPuzzle('The final gate stays sealed. The order must combine ceiling, serpent, breath, and living seal.');
    }
    return ok ? markPuzzleSolved(pz.roundId, 'Translation accepted: Serpent → Breath → East. The entry seal loosens.') : failPuzzle('The wall does not move. Recheck the glyph order before wasting more oxygen.');
  }
  if (action === 'seal') { templePuzzleState.selected.seal = value; templePuzzleState.message = ''; renderTemplePuzzleModule(); return; }
  if (action === 'check-shadow') {
    const ok = templePuzzleState.selected.shadowRevealed === 'yes' && templePuzzleState.selected.seal === pz.answer;
    return ok ? markPuzzleSolved(pz.roundId, 'The torch shadow points true. The Jade Eye seal clicks open.') : failPuzzle('The seal does not move. Use the torch inside the black chamber until the serpent shadow reveals the correct seal before testing.');
  }
  if (action === 'balance-stone') { templePuzzleState.selected.stone = value; templePuzzleState.message = ''; renderTemplePuzzleModule(); return; }
  if (action === 'balance-distance') { templePuzzleState.selected.distance = value; templePuzzleState.message = ''; renderTemplePuzzleModule(); return; }
  if (action === 'check-balance') {
    const ok = templePuzzleState.selected.stone === pz.answerStone && templePuzzleState.selected.distance === pz.answerDistance;
    return ok ? markPuzzleSolved(pz.roundId, 'The lever balances: 3×2 equals 2×3. The floor plate releases.') : failPuzzle('The chamber groans. Torque is not balanced yet. Match weight × distance to 6.');
  }
  if (action === 'path') { templePuzzleState.selected.path = value; templePuzzleState.message = ''; renderTemplePuzzleModule(); return; }
  if (action === 'check-path') {
    return templePuzzleState.selected.path === pz.answer ? markPuzzleSolved(pz.roundId, 'You chose the breathing tunnel. Fresh air brushes the torch flame.') : failPuzzle('Wrong route. This path does not show moving air with breath-serpent markings.');
  }
  if (action === 'check-seal') {
    const ok = JSON.stringify(templePuzzleState.sequence || []) === JSON.stringify(pz.answer || []);
    return ok ? markPuzzleSolved(pz.roundId, 'The Serpent Gate opens. You found the living exit sequence.') : failPuzzle('The final gate stays sealed. The order must combine ceiling, serpent, breath, and living seal.');
  }
  if (action === 'open-gate') {}
  if (action === 'check-seq' && pz.type === 'seal-sequence') {}
}

function failPuzzle(message) {
  templePuzzleState.message = message;
  templePuzzleState.solved = false;
  renderTemplePuzzleModule();
}

function renderTorchChamber() {
  const chamber = $('visualChamber');
  if (!chamber || !state) return;
  const data = currentChamberVisualData();
  const diameter = getTorchDiameter();
  chamber.style.setProperty('--torch-size', `${diameter}px`);
  if ($('visualChamberName')) $('visualChamberName').textContent = data.title;
  if ($('visualTorchSize')) $('visualTorchSize').textContent = `Torch: ${getTorchSizeLabel()} · ${diameter}px`;
  if ($('visualChamberInstruction')) $('visualChamberInstruction').textContent = data.objective;
  if ($('visualTorchStatus')) $('visualTorchStatus').textContent = (state.torchActive || localTorchActive) ? 'Torch On · O₂ burning faster' : 'Torch Off · O₂ normal';
  ['translationChamber','shadowChamber','balanceChamber','pathChamber','gateChamber'].forEach(cls => chamber.classList.remove(cls));
  chamber.classList.add(data.mode || 'translationChamber');
  if ($('chamberGlyphLayer')) {
    const discovered = getDiscoveredClues();
    $('chamberGlyphLayer').innerHTML = data.glyphs.map(g => {
      if ((g.cls || '').includes('shadowCastMarker')) return `<div class="${g.cls}" aria-hidden="true"></div>`;
      const found = !g.discover || discovered.includes(g.discover);
      const attrs = [
        g.action ? `data-puzzle-action="${escapeHtml(g.action)}" data-value="${escapeHtml(g.value || '')}"` : '',
        g.discover ? `data-discover="${escapeHtml(g.discover)}"` : '',
        g.action && !found ? 'disabled' : ''
      ].filter(Boolean).join(' ');
      const foundClass = g.discover && discovered.includes(g.discover) ? ' discoveredTorchClue' : '';
      return `<button class="${g.cls}${foundClass}" type="button" aria-label="${escapeHtml(g.label)}" ${attrs}><span>${escapeHtml(g.text)}</span><small>${escapeHtml(g.hint)}</small></button>`;
    }).join('');
  }
  setupTorchPointer();
}

function getDiscoveredClues() {
  const raw = templePuzzleState.selected?.discovered;
  return Array.isArray(raw) ? raw : [];
}

function hasDiscoveredClue(key) {
  return getDiscoveredClues().includes(key);
}

function discoverTorchClue(key) {
  if (!key) return;
  const list = getDiscoveredClues();
  if (list.includes(key)) return;
  templePuzzleState.selected.discovered = [...list, key];
  const node = document.querySelector(`[data-discover="${cssEscapeValue(key)}"]`);
  if (node) node.classList.add('discoveredTorchClue');
  templePuzzleState.message = `Torch discovery added: ${humanizeDiscoveryKey(key)}.`;
  renderTemplePuzzleModule();
}

function cssEscapeValue(value) {
  try { return CSS.escape(value); } catch (_err) { return String(value).replace(/"/g, '\\"'); }
}

function humanizeDiscoveryKey(key) {
  return String(key).replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}


function updateShadowWallFromTorch(x, y, rect) {
  if (currentChamberIndex() !== 1) return;
  const nx = rect.width ? x / rect.width : 0;
  const ny = rect.height ? y / rect.height : 0;
  const difficulty = getDifficultyLevelNumber();
  const widthPad = difficulty >= 5 ? 0.07 : difficulty >= 4 ? 0.10 : 0.14;
  const heightPad = difficulty >= 5 ? 0.10 : difficulty >= 4 ? 0.13 : 0.17;
  const targetX = 0.72;
  const targetY = 0.42;
  const aligned = Math.abs(nx - targetX) <= widthPad && Math.abs(ny - targetY) <= heightPad;
  const chamber = $('visualChamber');
  if (chamber) {
    chamber.classList.toggle('shadowAligned', aligned || templePuzzleState.selected.shadowRevealed === 'yes');
    chamber.style.setProperty('--shadow-origin-x', `${Math.round(nx * 100)}%`);
    chamber.style.setProperty('--shadow-origin-y', `${Math.round(ny * 100)}%`);
  }
  if (aligned && templePuzzleState.roundId === getPuzzleData().roundId) {
    templePuzzleState.selected.shadowRevealed = 'yes';
    const panel = document.querySelector('.shadowPuzzleStage');
    if (panel && !panel.classList.contains('shadowReady')) {
      panel.classList.add('shadowReady');
      const card = panel.querySelector('.shadowInstructionCard');
      if (card) card.innerHTML = '<b>Shadow found.</b><span>The serpent shadow points toward one breathing seal. Choose carefully.</span>';
      const jade = panel.querySelector('[data-value="jade-eye"]');
      if (jade) jade.classList.add('shadowRevealedSeal');
    }
  }
}


function updateChamberDiscoveryFromTorch(x, y, rect) {
  const chamber = $('visualChamber');
  if (!chamber || !localTorchActive) return;
  const radius = getTorchDiameter() * 0.52;
  chamber.querySelectorAll('[data-discover]').forEach(node => {
    const box = node.getBoundingClientRect();
    const cx = (box.left + box.width / 2) - rect.left;
    const cy = (box.top + box.height / 2) - rect.top;
    const dist = Math.hypot(cx - x, cy - y);
    if (dist <= radius) discoverTorchClue(node.dataset.discover);
  });
}


function setupTorchPointer() {
  const chamber = $('visualChamber');
  if (!chamber || torchPointerBound) return;
  torchPointerBound = true;

  const moveTorch = (event) => {
    const rect = chamber.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    chamber.style.setProperty('--torch-x', `${x}px`);
    chamber.style.setProperty('--torch-y', `${y}px`);
    const cursor = $('torchCursor');
    if (cursor) {
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
    }
    updateShadowWallFromTorch(x, y, rect);
    updateChamberDiscoveryFromTorch(x, y, rect);
  };

  const start = (event) => {
    if (levelSummaryOpen) return;
    if (!state || !['investigation','accusation','accusation_locked'].includes(state.phase)) return;
    event.preventDefault();
    torchIsDragging = true;
    localTorchActive = true;
    chamber.classList.add('torchActive');
    $('torchCursor')?.classList.remove('hidden');
    $('torchHint')?.classList.add('hidden');
    moveTorch(event);
    updateTorchVisualStatus(true);
    setRemoteTorch(true).catch(() => {});
    try { chamber.setPointerCapture(event.pointerId); } catch (_err) {}
  };

  const move = (event) => {
    if (!torchIsDragging) return;
    event.preventDefault();
    moveTorch(event);
  };

  const end = (event) => {
    if (!torchIsDragging) return;
    event.preventDefault();
    torchIsDragging = false;
    localTorchActive = false;
    chamber.classList.remove('torchActive');
    $('torchCursor')?.classList.add('hidden');
    $('torchHint')?.classList.remove('hidden');
    updateTorchVisualStatus(false);
    setRemoteTorch(false).catch(() => {});
    try { chamber.releasePointerCapture(event.pointerId); } catch (_err) {}
  };

  chamber.addEventListener('pointerdown', start, { passive: false });
  chamber.addEventListener('pointermove', move, { passive: false });
  chamber.addEventListener('pointerup', end, { passive: false });
  chamber.addEventListener('pointercancel', end, { passive: false });
  chamber.addEventListener('pointerleave', end, { passive: false });
  chamber.addEventListener('click', event => {
    const btn = event.target.closest('[data-puzzle-action]');
    if (!btn || currentChamberIndex() !== 1) return;
    const action = btn.dataset.puzzleAction;
    const value = btn.dataset.value || '';
    handlePuzzleAction(action, value);
  });
}

function updateTorchVisualStatus(active) {
  if ($('visualTorchStatus')) $('visualTorchStatus').textContent = active ? 'Torch On · O₂ burning faster' : 'Torch Off · O₂ normal';
  if ($('oxygenModePill')) $('oxygenModePill').textContent = active ? 'O₂ x2' : 'O₂ x1';
  if ($('torchToggleBtn')) {
    $('torchToggleBtn').textContent = active ? '🔥 Torch On' : '🔥 Torch Off';
    $('torchToggleBtn').classList.toggle('torchOn', active);
  }
}

async function setRemoteTorch(active) {
  if (!state?.sessionCode) return;
  const now = Date.now();
  if (active === lastTorchApiActive && now - lastTorchApiAt < 600) return;
  lastTorchApiActive = active;
  lastTorchApiAt = now;
  try {
    const data = await api(`/api/sessions/${state.sessionCode}/torch`, { method: 'POST', body: { active } });
    if (data?.state) {
      state = data.state;
      syncServerClock(state);
      updateTorchVisualStatus(Boolean(state.torchActive));
      if ($('timerPill')) $('timerPill').textContent = fmt(state.remainingSec);
      if ($('progressTime')) $('progressTime').textContent = `${fmt(state.remainingSec)} left`;
    }
  } catch (err) {
    // If the host has not started the timer yet, keep the visual drag harmless and local.
    console.warn('Torch state could not sync:', err?.message || err);
  }
}

function renderChamberControls() {
  const hintBtn = $('openHintBtn');
  if (hintBtn) {
    const used = templeHintAlreadyUsed();
    hintBtn.textContent = used ? '💡 Hint Used' : '💡 Hint · -2:00 O₂';
    hintBtn.disabled = used;
    hintBtn.classList.toggle('hintUsed', used);
  }
  const notesBtn = $('openNotesBtn');
  if (notesBtn) notesBtn.textContent = `🗒️ Notes${archaeologistNotesWordCount() ? ` · ${archaeologistNotesWordCount()} words` : ''}`;
}

function renderApps() {
  renderChamberControls();
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
  const [emoji,label] = APP_META[currentApp] || ['','Temple Tool'];
  $('appTitle').textContent = `${emoji} ${label}`;
  $('appEvidence').innerHTML = renderEscapeToolDetail(currentApp);
  bindEscapeToolDetailControls();
}

function renderEscapeToolDetail(key) {
  const pz = getPuzzleData();
  if (key === 'hint') {
    const used = templeHintAlreadyUsed();
    return `
      <div class="escapeToolPanel">
        <h3>Temple Hint</h3>
        <p>Hints are emergency help. Using one costs oxygen because you stop to study the chamber under pressure.</p>
        ${used ? '<div class="puzzleSolvedBanner">Hint already used for this chamber. The oxygen penalty has been applied.</div>' : '<div class="puzzleHintLocked">Hint is hidden until you choose to spend oxygen.</div>'}
        <button class="danger compact" id="useTempleHintBtn" type="button" ${used ? 'disabled' : ''}>${used ? 'Hint Used' : 'Use Hint · Lose 2:00 O₂'}</button>
        <div class="puzzleHintBanner ${used ? '' : 'hidden'}" id="templeHintText">${escapeHtml(pz.clue || 'Use the torch, inspect the markings, and compare the symbols before choosing.')}</div>
        <p class="mini" id="templeHintStatus">${used ? 'This chamber hint has already been unlocked.' : 'Spend 2 minutes of oxygen to reveal the chamber hint.'}</p>
      </div>`;
  }
  return '<p class="muted">Only Hint and Notes are available during a chamber run.</p>';
}
function bindEscapeToolDetailControls() {
  const hintBtn = $('useTempleHintBtn');
  if (hintBtn) hintBtn.onclick = useTempleHintPenalty;
}

function currentTempleHintReason() {
  const round = state?.currentRound || {};
  return `Temple hint used: ${round.shortTitle || round.title || round.id || 'current chamber'}`;
}

function templeHintAlreadyUsed() {
  const reason = currentTempleHintReason();
  const logs = Array.isArray(state?.oxygenPenaltyLog) ? state.oxygenPenaltyLog : [];
  return logs.some(item => String(item.reason || '') === reason);
}

async function useTempleHintPenalty() {
  const status = $('templeHintStatus');
  const btn = $('useTempleHintBtn');
  const hintText = $('templeHintText');
  try {
    if (!state?.sessionCode) throw new Error('No active session.');
    if (templeHintAlreadyUsed()) {
      if (status) status.textContent = 'This chamber hint has already been unlocked.';
      if (hintText) hintText.classList.remove('hidden');
      if (btn) { btn.disabled = true; btn.textContent = 'Hint Used'; }
      return;
    }
    if (status) status.textContent = 'Applying oxygen penalty...';
    if (btn) btn.disabled = true;
    const data = await api(`/api/sessions/${state.sessionCode}/oxygen-penalty`, { method: 'POST', body: { seconds: 120, reason: currentTempleHintReason() } });
    Object.assign(state, data.state || data);
    currentApp = 'hint';
    if (hintText) hintText.classList.remove('hidden');
    if (status) status.textContent = 'Hint unlocked. 2 minutes of oxygen were removed.';
    render();
  } catch (err) {
    if (btn) btn.disabled = false;
    if (status) status.textContent = err?.message || 'Could not apply hint penalty.';
  }
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
      ${noteField('Current Route Theory', 'mainSuspect', 'Which route or chamber solution seems safest?')}
      ${noteField('Oxygen Risk', 'possibleMotive', 'What is wasting oxygen or creating danger?')}
      ${noteField('Important Evidence', 'importantEvidence', 'Which clues actually prove something?')}
      ${noteField('Paths That Do Not Add Up', 'alibis', 'Which symbols, tunnels, or clues feel inconsistent?')}
      ${noteField('Final Escape Theory', 'finalTheory', 'Which route, physics clues, and translation prove the exit?', 4)}
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
  return question.stage === 'final' ? 'Final Escape' : 'Chamber Gate';
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
    return `<div class="questionCard"><div class="time">${escapeHtml(questionStageLabel(question))}</div><h3>${escapeHtml(question.prompt)}</h3>${question.stage === 'checkpoint' && !selected ? `<div class="actions"><button class="secondary compact" type="button" onclick="openCheckpointQuestion('${escapeHtml(question.id)}')">Open Chamber Gate</button></div>` : ''}<div class="choiceList">${(question.options || []).map(opt => `
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
    $('checkpointPopupStatus').textContent = 'Choice selected. Submit when ready.';
  }
}

async function saveQuestionAnswer(input) {
  if (!state || !input?.dataset?.questionId || !input.value) return;
  const answers = { [input.dataset.questionId]: input.value };
  try {
    checkpointPopupIsSubmitting = true;
    if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = true;
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Submitting chamber answer...';
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, {
      method: 'POST',
      body: { playerId, answers }
    });
    state = data.state;
    const submission = getMySubmission();
    const total = state.accusation?.questions?.length || 8;
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
    ? 'Choice selected. Submit when ready.'
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
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Submitting chamber answer...';
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
  const remaining = Number.isFinite(Number(state.remainingSec)) ? fmt(Math.max(0, Number(state.remainingSec))) : '0:00';

  if (result) {
    const perfect = Number(result.score || 0) >= Number(result.total || 0);
    const title = perfect ? 'You escaped the Serpent’s Breath.' : 'Your temple run is complete.';
    const message = perfect
      ? 'You solved the chamber sequence and reached breathable air before the temple took your last usable oxygen.'
      : 'You reached the end of the run. Study your chamber strategy, conserve torch time, and try for a faster escape.';
    $('resultSummary').innerHTML = `
      <div class="resultBanner templeRevealBanner">
        <div>
          <div class="time">Temple Exit</div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
          <p class="mini"><b>Your Rating:</b> ${escapeHtml(result.badge)} · <b>Score:</b> ${result.score} / ${result.total} · <b>O₂ Remaining:</b> ${escapeHtml(remaining)} · <b>Difficulty:</b> ${escapeHtml(state.difficultyLabel || 'TEMPLE ESCAPE')}</p>
        </div>
      </div>`;
    $('shareCardWrap')?.classList.remove('hidden');
    renderBadgeCanvas(result);
  } else {
    $('resultSummary').innerHTML = `
      <div class="resultBanner templeRevealBanner">
        <div>
          <div class="time">Temple Exit</div>
          <h3>Temple run ended.</h3>
          <p>No saved player result is available on this device.</p>
        </div>
      </div>`;
    $('shareCardWrap')?.classList.add('hidden');
  }
  if ($('answerKey')) $('answerKey').innerHTML = '';
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

  // Chamber summaries now handle level entry and timer pause.
  // Old round/clue-update popups are intentionally disabled for this escape-room flow.
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



function levelSummaryForRound(round, index = 0) {
  const summaries = [
    {
      title: 'Level 1: The Sealed Entry',
      intro: [
        'The entry slab has sealed behind you. Dust hangs in the beam of your torch, and the first chamber answers with silence.',
        'Ahead, three worn glyphs are carved into the stone around a locked eastern seal. Your training tells you the wall is not decoration — it is an instruction left for anyone calm enough to read it.'
      ],
      where: 'The sealed entry chamber. A glyph wall blocks the only visible passage forward.',
      test: 'Translation under pressure: identify the carved symbols without wasting torchlight.',
      goal: 'Reveal the glyphs with short torch sweeps and translate the phrase that opens the eastern seal.',
      danger: 'Torch use drains oxygen faster. Wrong translations waste time and can trigger an oxygen penalty.',
      mechanic: 'Drag the torch across the dark chamber view, then tap the revealed glyphs in the correct order.'
    },
    {
      title: 'Level 2: The Shadow Wall',
      intro: [
        'The passage narrows into a wall of serpent heads and sealed eyes. The carvings refuse to make sense when viewed straight on.',
        'Near your feet, a broken line reads: “the eye sees only by fire.” This chamber was built for shadow, not sight.'
      ],
      where: 'A narrow shadow wall lined with serpent carvings, eye symbols, and sealed stones.',
      test: 'Light position and shadow direction.',
      goal: 'Move your torch until the serpent shadow reveals the breathing seal.',
      danger: 'Wrong seals cost oxygen. Studying too long with the torch lit also burns air.',
      mechanic: 'Drag the torch inside the black chamber view until the correct seal glows, then tap it.'
    },
    {
      title: 'Level 3: The Balance Chamber',
      intro: [
        'The shadow seal releases a latch, and the floor slopes into a wider chamber. A stone balance arm rests over pressure plates at the center.',
        'Jaguar, feather, and serpent markings are cut into the surrounding stone. This door is not opened by translation — it is opened by force.'
      ],
      where: 'A pressure-floor chamber with stone weights, carved plates, and a counterbalance gate.',
      test: 'Physics: mass, distance, balance, and torque.',
      goal: 'Balance the mechanism so the gate lifts without triggering the oxygen penalty.',
      danger: 'Wrong balance choices waste oxygen while the mechanism grinds back into place.',
      mechanic: 'Use the torch to reveal weight markings, compare force × distance, then choose the balanced arrangement.'
    },
    {
      title: 'Level 4: The Three Paths',
      intro: [
        'The balance gate rises just enough for you to crawl through. Beyond it, the temple opens into three dark tunnels.',
        'There is no locked door here — only a choice. One path breathes, one path echoes, and one path has already begun to die.'
      ],
      where: 'A three-way tunnel junction where cracks in the stone carry faint air movement.',
      test: 'Observation: airflow, echo, direction, and warning carvings.',
      goal: 'Choose the living path that leads toward fresher air.',
      danger: 'Wrong turns cost oxygen and time. Too many mistakes can make escape impossible.',
      mechanic: 'Use short torch sweeps to inspect each tunnel before choosing a route.'
    },
    {
      title: 'Level 5: The Serpent Gate',
      intro: [
        'The living path drops into the final chamber. The air is still, the stone is colder, and the Serpent Gate waits ahead.',
        'The symbols here are familiar: wall, floor, ceiling, shadow, breath. The temple is asking whether you understood what each chamber taught you.'
      ],
      where: 'The final gate chamber, where serpent, breath, star, shadow, and balance symbols converge.',
      test: 'Combining the translation, shadow, physics, and path clues from the previous chambers.',
      goal: 'Enter the final seal sequence and open the oxygen gate before the timer reaches zero.',
      danger: 'The final choice locks the route. A rushed guess can trap you beneath Chichén Itzá.',
      mechanic: 'Use the torch carefully to connect wall, floor, and ceiling clues, then press the final symbols in order.'
    }
  ];
  const template = summaries[Math.max(0, Math.min(summaries.length - 1, index))];
  return {
    ...template,
    title: round?.title || template.title
  };
}

async function pauseForLevelSummary(roundId) {
  if (!state?.sessionCode || levelSummaryPauseInFlight) return;
  levelSummaryPauseInFlight = true;
  try {
    const data = await api(`/api/sessions/${state.sessionCode}/level-summary/pause`, {
      method: 'POST',
      body: { roundId, playerId }
    });
    if (data?.state) {
      state = data.state;
      syncServerClock(state);
      render();
    }
  } catch (err) {
    console.warn('Unable to pause level summary timer', err);
  } finally {
    levelSummaryPauseInFlight = false;
  }
}

function levelSummaryAckKey(roundId) {
  return `level-summary:${roundId}`;
}

function maybeOpenLevelSummary(next) {
  if (!next || levelSummaryOpen) return;
  if (['lobby','briefing','revealed'].includes(next.phase)) return;
  const round = next.currentRound;
  if (!round || !round.id) return;

  // Chamber solves must visibly move the player into the next chamber briefing.
  // Do not let an old local acknowledgement hide the next script after a gate opens.
  const serverPausedForThisRound = Boolean(next.levelSummaryPaused && next.levelSummaryPausedRoundId === round.id);
  const forcedForThisRound = Boolean(pendingForcedLevelSummaryRoundId && pendingForcedLevelSummaryRoundId === round.id);
  if (serverPausedForThisRound || forcedForThisRound) {
    pendingForcedLevelSummaryRoundId = '';
    currentApp = null;
    openLevelSummary(round, next);
    return;
  }

  const ack = getAckForSession(next.sessionCode);
  if (ack.messages.includes(levelSummaryAckKey(round.id))) return;
  openLevelSummary(round, next);
}

function openLevelSummary(round, next) {
  const index = Math.max(0, (next.rounds || []).findIndex(r => r.id === round.id));
  const summary = levelSummaryForRound(round, index);
  activeLevelSummaryRoundId = round.id;
  levelSummaryOpen = true;
  document.body.classList.add('levelSummaryActive');
  if ($('levelSummaryMeta')) $('levelSummaryMeta').textContent = `Level ${index + 1} Unlocked · Timer Paused`;
  if ($('levelSummaryTitle')) $('levelSummaryTitle').textContent = summary.title;
  if ($('levelSummaryIntro')) {
    const introParts = Array.isArray(summary.intro) ? summary.intro : [summary.intro || 'Read the chamber, conserve oxygen, and solve the level before moving deeper into the temple.'];
    $('levelSummaryIntro').innerHTML = introParts.map(part => `<p>${escapeHtml(part)}</p>`).join('');
  }
  if ($('levelSummaryWhere')) $('levelSummaryWhere').textContent = summary.where;
  if ($('levelSummaryTest')) $('levelSummaryTest').textContent = summary.test;
  if ($('levelSummaryGoal')) $('levelSummaryGoal').textContent = summary.goal;
  if ($('levelSummaryDanger')) $('levelSummaryDanger').textContent = summary.danger;
  if ($('levelSummaryMechanic')) $('levelSummaryMechanic').textContent = summary.mechanic;
  if ($('enterChamberBtn')) { $('enterChamberBtn').disabled = false; $('enterChamberBtn').textContent = 'Continue: Enter Chamber'; }
  show('dialogOverlay', false);
  show('countdownOverlay', false);
  show('levelSummaryOverlay', true);
  updateTorchVisualStatus(false);
  pauseForLevelSummary(round.id);
}

async function enterChamberFromSummary() {
  const btn = $('enterChamberBtn');
  if (btn?.disabled) return;
  const roundId = activeLevelSummaryRoundId;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Opening Chamber...';
  }
  if (roundId) rememberAck('message', levelSummaryAckKey(roundId));
  levelSummaryOpen = false;
  activeLevelSummaryRoundId = '';
  document.body.classList.remove('levelSummaryActive');
  show('levelSummaryOverlay', false);
  try {
    if (state?.sessionCode) {
      const data = await api(`/api/sessions/${state.sessionCode}/level-summary/resume`, {
        method: 'POST',
        body: { roundId, playerId }
      });
      if (data?.state) {
        state = data.state;
        syncServerClock(state);
      }
    }
  } catch (err) {
    console.warn('Unable to resume oxygen timer', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Continue: Enter Chamber';
    }
  }
  render();
}

function inspectCountdown(next) {
  show('countdownOverlay', false);
  return;
  if (levelSummaryOpen) {
    show('countdownOverlay', false);
    return;
  }
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
  if (levelSummaryOpen) return;
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
  ctx.fillStyle = '#e5c16f';
  ctx.font = '800 34px Arial';
  ctx.fillText('ESCAPE COMPLETE', canvas.width / 2, 230);

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

// Build marker: serpent-title-holds-until-tap-006

ensureLobbyCountdownTimer();

// Build marker: serpent-missing-functions-title-fix-008
