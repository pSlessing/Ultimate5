
/* ========================================================= */

const ROLES = ['IGL', 'AWP', 'Pack Rifler', 'Anchor'];
const ROLE_ICON = { 'IGL': '🧠', 'AWP': '🎯', 'Pack Rifler': '⭐', 'Anchor': '🛡️' };
const SLOTS = [
  { id: 'IGL', role: 'IGL', label: 'IGL' },
  { id: 'AWP', role: 'AWP', label: 'AWPer' },
  { id: 'Rifler', role: 'Pack Rifler', label: 'Pack Rifler' },
  { id: 'Anchor1', role: 'Anchor', label: 'Anchor' },
  { id: 'Anchor2', role: 'Anchor', label: 'Anchor' },
];

const STAGE_SETS = {
  easy: [
    { name: 'Stage 1', desc: 'Challengers Stage — 16 teams, 8 advance.', difficulty: 0.95 },
    { name: 'Stage 2', desc: 'Legends Stage — 16 teams, 8 advance.',     difficulty: 1.00 },
    { name: 'Stage 3', desc: 'Champions Stage — 16 teams, 8 advance.',  difficulty: 1.05 },
    { name: 'Quarterfinals', desc: 'Best of 3.', difficulty: 1.10 },
    { name: 'Semifinals',    desc: 'Best of 3.', difficulty: 1.12 },
    { name: 'Grand Final',   desc: 'Best of 5.', difficulty: 1.14 },
  ],
  hard: [
    { name: 'Stage 1', desc: 'Challengers Stage — 16 teams, 9 advance.', difficulty: 1.00 },
    { name: 'Stage 2', desc: 'Legends Stage — 16 teams, 8 advance.',     difficulty: 1.05 },
    { name: 'Stage 3', desc: 'Champions Stage — 8 teams, single-elim.',  difficulty: 1.10 },
    { name: 'Quarterfinals', desc: 'Best of 3.', difficulty: 1.14 },
    { name: 'Semifinals',    desc: 'Best of 3.', difficulty: 1.16 },
    { name: 'Grand Final',   desc: 'Best of 5.', difficulty: 1.18 },
  ],
};

const FLAG = {
  'Sweden':'🇸🇪','Denmark':'🇩🇰','France':'🇫🇷','Ukraine':'🇺🇦','Russia':'🇷🇺',
  'USA':'🇺🇸','Brazil':'🇧🇷','Bosnia':'🇧🇦','Poland':'🇵🇱','Finland':'🇫🇮',
  'Slovakia':'🇸🇰','Latvia':'🇱🇻','Estonia':'🇪🇪','Norway':'🇳🇴','Israel':'🇮🇱',
  'Mexico':'🇲🇽','Canada':'🇨🇦','Kazakhstan':'🇰🇿','Turkey':'🇹🇷','Serbia':'🇷🇸',
  'Lithuania':'🇱🇹','Bulgaria':'🇧🇬','Hungary':'🇭🇺','Czechia':'🇨🇿','Netherlands':'🇳🇱',
  'Australia':'🇦🇺','Belarus':'🇧🇾','Chile':'🇨🇱','China':'🇨🇳','Germany':'🇩🇪',
  'Guatemala':'🇬🇹','Kosovo':'🇽🇰','Mongolia':'🇲🇳','North Macedonia':'🇲🇰','Portugal':'🇵🇹',
  'Romania':'🇷🇴','South Africa':'🇿🇦','Spain':'🇪🇸','UK':'🇬🇧','Uruguay':'🇺🇾',
  'Argentina':'🇦🇷','Belgium':'🇧🇪','Indonesia':'🇮🇩','Jordan':'🇯🇴',
  'Montenegro':'🇲🇪','New Zealand':'🇳🇿','Switzerland':'🇨🇭','Uzbekistan':'🇺🇿'
};
const flag = (n) => FLAG[n] || '🏳️';

/* ---------- CSV parsing ---------- */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.length && !l.startsWith('#'));
  const header = lines.shift().split(',').map(s => s.trim());
  const idx = (k) => header.indexOf(k);
  const out = [];
  for (const line of lines) {
    const cells = line.split(',').map(s => s.trim());
    if (cells.length < 5) continue;
    const roles = cells[idx('roles')].split('|').map(s => s.trim()).filter(Boolean);
    out.push({
      name: cells[idx('name')],
      nationality: cells[idx('nationality')],
      year: parseInt(cells[idx('year')], 10),
      rating: parseFloat(cells[idx('rating')]),
      roles,
      id: cells[idx('name')] + '|' + cells[idx('year')],
    });
  }
  return out;
}

// Populated once players.csv is fetched (see Boot at the bottom of this file).
let ALL_PLAYERS = [];
let UNIQUE_NATIONALITIES = [];
let UNIQUE_YEARS = [];

/* ---------- Game state ---------- */
let state = null;
let selectedDifficulty = 'easy';   // home toggle choice; persists across newGame()
function newGame() {
  state = {
    phase: 'home',
    roster: { IGL: null, AWP: null, Rifler: null, Anchor1: null, Anchor2: null },
    currentRoll: null,         // { nationality, year, players } — null = not yet spun this round
    spinning: false,           // reel animation in progress
    pendingPlayer: null,       // for dual-role picks
    nationalityRerollsLeft: 1,
    yearRerollsLeft: 1,
    usedPlayerNames: new Set(),
    pickHistory: [],
    selectedSlot: null,        // click-to-swap: currently picked-up roster slot
    difficulty: 'easy',        // 'easy' | 'hard' — which STAGE_SETS to use
    hideRatings: false,        // true in IQ mode: hide ratings while drafting
    results: null,
  };
}

let dragSrcSlot = null;        // drag-to-swap: source roster slot during a drag

/* ---------- Helpers ---------- */
const slotById = (id) => SLOTS.find(s => s.id === id);

function canPlaceInSlot(player, slotId) {   // null player = no constraint
  return !player || player.roles.includes(slotById(slotId).role);
}
function canSwapSlots(a, b) {                // move/trade between roster slots a and b
  if (a === b) return false;
  const pa = state.roster[a], pb = state.roster[b];
  if (!pa && !pb) return false;             // both empty: nothing to do
  return canPlaceInSlot(pa, b) && canPlaceInSlot(pb, a);
}
function performSwap(a, b) {
  if (!canSwapSlots(a, b)) return;
  [state.roster[a], state.roster[b]] = [state.roster[b], state.roster[a]];
  state.selectedSlot = null;
  render();                                 // filled count unchanged -> no auto-simulate
}

function openSlotsFor(role) {
  return SLOTS.filter(s => s.role === role && state.roster[s.id] === null);
}
function anyOpenSlotForPlayer(p) {
  return p.roles.some(r => openSlotsFor(r).length > 0);
}
function remainingRoleNeeds() {
  // Distinct roles that still need at least one player
  return Array.from(new Set(SLOTS.filter(s => state.roster[s.id] === null).map(s => s.role)));
}

/* A (nationality, year) bucket is valid if at least one player in it:
   - has a role we still need
   - hasn't been picked already (same name) */
function bucketIsViable(nationality, year) {
  const needed = remainingRoleNeeds();
  return ALL_PLAYERS.some(p =>
    p.nationality === nationality &&
    p.year === year &&
    !state.usedPlayerNames.has(p.name) &&
    p.roles.some(r => needed.includes(r))
  );
}

function playersInBucket(nationality, year) {
  return ALL_PLAYERS
    .filter(p => p.nationality === nationality && p.year === year)
    .sort((a,b) => state && state.hideRatings
      ? a.name.localeCompare(b.name)   // IQ mode: hide the rating ordering
      : b.rating - a.rating);
}

function rollBucket(opts = {}) {
  // opts.excludeNationality, opts.excludeYear, opts.fixedNationality, opts.fixedYear
  const candidates = [];
  for (const nat of UNIQUE_NATIONALITIES) {
    if (opts.fixedNationality && nat !== opts.fixedNationality) continue;
    if (opts.excludeNationality && nat === opts.excludeNationality) continue;
    for (const yr of UNIQUE_YEARS) {
      if (opts.fixedYear && yr !== opts.fixedYear) continue;
      if (opts.excludeYear && yr === opts.excludeYear) continue;
      if (bucketIsViable(nat, yr)) {
        candidates.push({ nationality: nat, year: yr });
      }
    }
  }
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    nationality: pick.nationality,
    year: pick.year,
    players: playersInBucket(pick.nationality, pick.year),
  };
}

/* ---------- Game actions ---------- */
function setDifficulty(d) {
  selectedDifficulty = d;
  render();                   // re-render Home so the active toggle button updates
}

function startDraft(displayMode) {
  newGame();
  state.phase = 'draft';
  state.difficulty = selectedDifficulty;
  state.hideRatings = displayMode === 'iq';
  state.currentRoll = null;   // open the round on the un-spun SPIN card
  render();
}

/* ---- Slot-machine reel animation ----
   Cycles the chosen reel(s) through random values, decelerates, then lands on
   the result that was already computed up front. */
function animateReels(spinNat, spinYear, onDone) {
  const natReel = document.getElementById('reel-nat');
  const yearReel = document.getElementById('reel-year');
  const natVal = document.getElementById('nat-value');
  const natFlag = document.getElementById('nat-flag');
  const yearVal = document.getElementById('year-value');
  const spinBtn = document.getElementById('spin-btn');
  if (spinBtn) spinBtn.disabled = true;
  if (spinNat && natReel) natReel.classList.add('rolling');
  if (spinYear && yearReel) yearReel.classList.add('rolling');

  const natWin = natReel?.querySelector('.reel-window');
  const yearWin = yearReel?.querySelector('.reel-window');
  // re-trigger the one-shot shake so it fires fresh on each value change
  const bump = (win) => {
    if (!win) return;
    win.classList.remove('bump');
    void win.offsetWidth;          // force reflow to restart the animation
    win.classList.add('bump');
  };

  let elapsed = 0, delay = 50;
  const total = 2800;
  function tick() {
    if (spinNat && natVal) {
      const n = UNIQUE_NATIONALITIES[Math.floor(Math.random() * UNIQUE_NATIONALITIES.length)];
      natVal.textContent = n; natVal.classList.remove('placeholder');
      if (natFlag) natFlag.textContent = flag(n);
      bump(natWin);
    }
    if (spinYear && yearVal) {
      const y = UNIQUE_YEARS[Math.floor(Math.random() * UNIQUE_YEARS.length)];
      yearVal.textContent = y; yearVal.classList.remove('placeholder');
      bump(yearWin);
    }
    elapsed += delay;
    if (elapsed >= total) {
      if (spinNat && natReel) natReel.classList.remove('rolling');
      if (spinYear && yearReel) yearReel.classList.remove('rolling');
      onDone();
      return;
    }
    delay = Math.min(420, delay * 1.16);   // decelerate
    setTimeout(tick, delay);
  }
  setTimeout(tick, delay);
}

function settleReels(spinNat, spinYear) {
  // re-trigger the bounce on the freshly rendered reels
  requestAnimationFrame(() => {
    if (spinNat) document.getElementById('reel-nat')?.classList.add('settle');
    if (spinYear) document.getElementById('reel-year')?.classList.add('settle');
  });
}

function spin() {
  if (state.spinning) return;
  const target = rollBucket();
  if (!target) return;             // no viable bucket (renderDraft shows a message instead)
  state.spinning = true;
  state.pendingPlayer = null;
  state.selectedSlot = null;
  animateReels(true, true, () => {
    state.currentRoll = target;
    state.spinning = false;
    render();
    settleReels(true, true);
  });
}

function rerollNationality() {
  if (state.spinning || state.nationalityRerollsLeft <= 0 || !state.currentRoll) return;
  const fresh = rollBucket({ excludeNationality: state.currentRoll.nationality, fixedYear: state.currentRoll.year })
    || rollBucket({ excludeNationality: state.currentRoll.nationality });
  if (!fresh) return;
  state.spinning = true;
  state.nationalityRerollsLeft -= 1;
  state.pendingPlayer = null;
  const yearChanged = fresh.year !== state.currentRoll.year;
  animateReels(true, yearChanged, () => {
    state.currentRoll = fresh;
    state.spinning = false;
    render();
    settleReels(true, yearChanged);
  });
}

function rerollYear() {
  if (state.spinning || state.yearRerollsLeft <= 0 || !state.currentRoll) return;
  const fresh = rollBucket({ excludeYear: state.currentRoll.year, fixedNationality: state.currentRoll.nationality })
    || rollBucket({ excludeYear: state.currentRoll.year });
  if (!fresh) return;
  state.spinning = true;
  state.yearRerollsLeft -= 1;
  state.pendingPlayer = null;
  const natChanged = fresh.nationality !== state.currentRoll.nationality;
  animateReels(natChanged, true, () => {
    state.currentRoll = fresh;
    state.spinning = false;
    render();
    settleReels(natChanged, true);
  });
}

function clickPlayer(player) {
  if (state.usedPlayerNames.has(player.name)) return;
  const validOpenSlots = SLOTS
    .filter(s => state.roster[s.id] === null && player.roles.includes(s.role));
  if (validOpenSlots.length === 0) return;
  // Always highlight the eligible roster slots and let the user click the destination,
  // even when only one role fits — keeps picking and swapping the same interaction.
  state.pendingPlayer = player;
  state.selectedSlot = null;        // can't be mid-swap and mid-pick at once
  render();
}

function assignPlayerToSlot(player, slotId) {
  state.roster[slotId] = { ...player };
  state.usedPlayerNames.add(player.name);
  state.pickHistory.push({ slot: slotId, player });
  state.pendingPlayer = null;
  state.selectedSlot = null;

  const rosterFull = Object.values(state.roster).every(Boolean);
  if (rosterFull) {
    finishDraftAndSimulate();
  } else {
    state.currentRoll = null;   // next round opens on a fresh un-spun SPIN card
  }
  render();
}

/* ---- Rearranging drafted players (click-to-swap + drag-and-drop) ---- */
function onSlotClick(slotId) {
  if (state.pendingPlayer) {                          // placing a freshly-rolled player
    if (state.roster[slotId] === null && canPlaceInSlot(state.pendingPlayer, slotId)) {
      assignPlayerToSlot(state.pendingPlayer, slotId);
    } else {
      state.pendingPlayer = null; render();           // clicked a non-eligible slot -> cancel
    }
    return;
  }
  if (state.selectedSlot === null) {                  // pick up (only a filled slot)
    if (state.roster[slotId]) { state.selectedSlot = slotId; render(); }
    return;
  }
  if (state.selectedSlot === slotId) {                // tap again to drop selection
    state.selectedSlot = null; render(); return;
  }
  if (canSwapSlots(state.selectedSlot, slotId)) {     // valid target -> move/trade
    performSwap(state.selectedSlot, slotId); return;
  }
  state.selectedSlot = state.roster[slotId] ? slotId : null;  // invalid: reselect or clear
  render();
}

function onDragStart(e, slotId) {
  if (!state.roster[slotId]) { e.preventDefault(); return; }
  dragSrcSlot = slotId;
  state.selectedSlot = null;
  e.dataTransfer.effectAllowed = 'move';
  const src = e.currentTarget;
  if (src) src.classList.add('dragging');
  document.querySelectorAll('.roster .slot').forEach(el => {   // highlight valid drops
    if (canSwapSlots(slotId, el.dataset.slot)) el.classList.add('drop-ok');
  });
}
function onDragOver(e, slotId) {
  if (dragSrcSlot && canSwapSlots(dragSrcSlot, slotId)) e.preventDefault();
}
function onDrop(e, slotId) {
  e.preventDefault();
  const src = dragSrcSlot; dragSrcSlot = null;
  if (src) performSwap(src, slotId);
}
function onDragEnd() {
  dragSrcSlot = null;
  document.querySelectorAll('.roster .slot.drop-ok').forEach(el => el.classList.remove('drop-ok'));
  document.querySelectorAll('.roster .slot.dragging').forEach(el => el.classList.remove('dragging'));
}

/* ---------- IGL traits ----------
   Certain tactical IGLs, when their own rating is below 1.00, carry a trait that
   multiplies teammate roles' ratings. Keyed by lowercased player name. Boost keys
   are roles ('AWP', 'Pack Rifler', 'Anchor'); an 'Anchor' boost hits both anchors. */
const IGL_TRAITS = {
  'karrigan':  { name: 'Mastermind',    desc: 'Elevates the star rifler.', boosts: { 'Pack Rifler': 1.10 } },
  'gla1ve':    { name: 'Tactician',     desc: 'Sharpens both anchors.',    boosts: { 'Anchor': 1.05 } },
  'aleksib':   { name: 'Setup King',    desc: 'Frees the AWP and rifler.', boosts: { 'AWP': 1.05, 'Pack Rifler': 1.05 } },
  'fallen':    { name: 'The Professor', desc: 'A master of the AWP.',       boosts: { 'AWP': 1.10 } },
  'apex':      { name: 'Firestarter',   desc: 'Fuels the aggressors.',      boosts: { 'Pack Rifler': 1.05, 'Anchor': 1.05 } },
  'nbk-':      { name: 'Veteran',       desc: 'Steadies the anchors.',      boosts: { 'Anchor': 1.10 } },
  'cadian':    { name: 'Field General', desc: 'Unlocks the rifle core.',    boosts: { 'Pack Rifler': 1.10 } },
  'boombl4':   { name: 'Motivator',     desc: 'Inspires the rifler.',       boosts: { 'Pack Rifler': 1.10 } },
  'chopper':   { name: 'Strategist',    desc: 'Coordinates the map.',       boosts: { 'Pack Rifler': 1.05, 'Anchor': 1.05 } },
  'snax':      { name: 'X-factor',      desc: 'Empowers the rifler.',       boosts: { 'Pack Rifler': 1.10 } },
  'nexa':      { name: 'Conductor',     desc: 'Balances fire and hold.',    boosts: { 'AWP': 1.05, 'Anchor': 1.05 } },
  'xizt':      { name: 'System',        desc: 'Anchors the defense.',       boosts: { 'Anchor': 1.10 } },
  'stanislaw': { name: 'Calculated',    desc: 'Reads the rifle duels.',     boosts: { 'Pack Rifler': 1.10 } },
  'nitr0':     { name: 'Backbone',      desc: 'Holds the sites firm.',      boosts: { 'Anchor': 1.10 } },
  'tabsen':    { name: 'Lone Wolf',     desc: 'Carries and commands.',      boosts: { 'Pack Rifler': 1.05, 'AWP': 1.05 } },
  'hampus':    { name: 'Glue Guy',      desc: 'Lifts the supporting cast.', boosts: { 'Anchor': 1.05, 'Pack Rifler': 1.05 } },
};

// A player's trait, or null — trait-bearing IGLs only carry it while rated below 1.00.
function traitForPlayer(p) {
  if (!p || p.rating >= 1.00) return null;
  return IGL_TRAITS[p.name.toLowerCase()] || null;
}

// The trait currently in effect from the drafted IGL, or null.
function activeTrait() { return traitForPlayer(state.roster.IGL); }

// A player's rating after the active IGL trait, given the slot they occupy.
function effectiveRating(player, slotId, trait) {
  if (!player) return 0;
  const mult = trait && trait.boosts[slotById(slotId).role];
  return mult ? player.rating * mult : player.rating;
}

// "Pack Rifler ×1.10, Anchor ×1.05" — describes a trait's boosts for the badge.
function traitBoostSummary(trait) {
  return Object.entries(trait.boosts)
    .map(([role, mult]) => `${role} ×${mult.toFixed(2)}`)
    .join(', ');
}

// Rating pill markup, showing the effective (boosted) value with a marker when buffed.
function ratingPillHTML(player, slotId, trait, hidden) {
  if (hidden) return '<div class="rating-pill">?</div>';
  const base = player.rating, eff = effectiveRating(player, slotId, trait);
  return eff > base
    ? `<div class="rating-pill boosted">${eff.toFixed(2)} <span class="boost-arrow">▲</span></div>`
    : `<div class="rating-pill">${base.toFixed(2)}</div>`;
}

// Trait badge markup, or '' when there is no trait.
function traitBadgeHTML(trait) {
  if (!trait) return '';
  return `<div class="trait-badge">🧠 ${escapeHTML(trait.name)} · ${escapeHTML(traitBoostSummary(trait))}</div>`;
}

function finishDraftAndSimulate() {
  const trait = activeTrait();
  const slots = SLOTS.filter(s => state.roster[s.id]);
  const avg = slots.reduce((sum, s) => sum + effectiveRating(state.roster[s.id], s.id, trait), 0)
            / Math.max(1, slots.length);
  const k = 15;
  const results = [];
  let alive = true;
  for (const stage of STAGE_SETS[state.difficulty]) {
    const p = sigmoid((avg - stage.difficulty) * k);
    const passed = alive && (Math.random() < p);
    results.push({ ...stage, p, passed: alive ? passed : false, played: alive });
    if (!passed) alive = false;
  }
  state.results = { avg, stages: results, wonMajor: results[results.length - 1].passed, trait };
  state.phase = 'results';
  state.currentRoll = null;
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

/* ---------- Rendering ---------- */
const $main = document.getElementById('main');
const $restart = document.getElementById('btn-restart');
$restart.addEventListener('click', () => { newGame(); render(); });

function render() {
  $restart.style.display = state.phase === 'home' ? 'none' : 'inline-flex';
  if (state.phase === 'home') return renderHome();
  if (state.phase === 'draft') return renderDraft();
  if (state.phase === 'results') return renderResults();
}

function renderHome() {
  $main.innerHTML = `
    <section class="home-hero">
      <h1 class="hero">Can your <span class="accent">all-time CS roster</span> win a Major?</h1>
      <p class="lead" style="max-width: 640px;">
        Each round, hit <strong>SPIN</strong> to roll a random <strong>nationality</strong> and <strong>year</strong>.
        Pick a player who fits. Fill all five roles, then run the gauntlet through
        Stage 1, 2, 3, the Quarterfinals, Semifinals, and the Grand Final.
      </p>
      <div class="mode-toggle" role="group" aria-label="Difficulty">
        <button class="mode-btn ${selectedDifficulty === 'easy' ? 'active' : ''}" onclick="setDifficulty('easy')">Easy</button>
        <button class="mode-btn ${selectedDifficulty === 'hard' ? 'active' : ''}" onclick="setDifficulty('hard')">Hard</button>
      </div>
      <p class="lead" style="max-width: 640px; margin-top: 4px;">
        ${selectedDifficulty === 'hard'
          ? 'Hard — your roster needs a <strong>1.18</strong> average to win the Major, with tougher bars at every stage.'
          : 'Easy — your roster needs a <strong>1.14</strong> average to win the Major.'}
      </p>
      <div class="start-buttons">
        <button class="btn btn-primary" onclick="startDraft('classic')">Classic</button>
        <button class="btn btn-ghost" onclick="startDraft('iq')">IQ — ratings hidden</button>
      </div>
    </section>

    <div class="home-grid">
      <div class="panel info-card">
        <h3>Your Roster</h3>
        <p>Build a five-player squad with one player in each role:</p>
        <div class="role-row">
          <span class="role-chip"><span class="ico">🧠</span>IGL</span>
          <span class="role-chip"><span class="ico">🎯</span>AWP</span>
          <span class="role-chip"><span class="ico">⭐</span>Pack Rifler</span>
          <span class="role-chip"><span class="ico">🛡️</span>Anchor × 2</span>
        </div>
      </div>
      <div class="panel info-card">
        <h3>Re-spins</h3>
        <p>
          Don't like the spin? Spend a re-spin token. You get just
          <strong>one nationality re-spin</strong> and <strong>one year re-spin</strong> for
          the whole team — use them wisely.
        </p>
      </div>
      <div class="panel info-card">
        <h3>The Major</h3>
        <p>
          Your squad's <strong>average rating</strong> is everything. Each stage has a
          rating bar to clear — beat all six, from the Challengers Stage to the Grand
          Final, and you lift the trophy.
        </p>
      </div>
      <div class="panel info-card">
        <h3>Dataset</h3>
        <p>
          <strong>${ALL_PLAYERS.length}</strong> player-years across
          <strong>${UNIQUE_NATIONALITIES.length}</strong> nationalities and
          <strong>${UNIQUE_YEARS.length}</strong> seasons (${UNIQUE_YEARS[0]}–${UNIQUE_YEARS[UNIQUE_YEARS.length-1]}).
        </p>
      </div>
    </div>
  `;
}

function rosterHTML() {
  const trait = activeTrait();
  const items = SLOTS.map(s => {
    const p = state.roster[s.id];
    const selected = state.selectedSlot === s.id;
    const pendingEligible = !!state.pendingPlayer
      && state.roster[s.id] === null
      && canPlaceInSlot(state.pendingPlayer, s.id);
    const dropOk = pendingEligible
      || (state.selectedSlot !== null && canSwapSlots(state.selectedSlot, s.id));
    const cls = ['slot', p ? 'filled' : '', selected ? 'selected' : '', dropOk ? 'drop-ok' : '']
      .filter(Boolean).join(' ');
    const dragAttrs = p
      ? `draggable="true" ondragstart="onDragStart(event,'${s.id}')" ondragend="onDragEnd()"`
      : '';
    return `
      <div class="${cls}" data-slot="${s.id}" onclick="onSlotClick('${s.id}')"
           ondragover="onDragOver(event,'${s.id}')" ondrop="onDrop(event,'${s.id}')" ${dragAttrs}>
        <div class="role-ico">${ROLE_ICON[s.role]}</div>
        <div class="meta">
          <div class="role-label">${s.label}</div>
          <div class="name">${p ? escapeHTML(p.name) : '<span class="empty">— empty</span>'}</div>
          ${p ? `<div class="sub">${flag(p.nationality)} ${escapeHTML(p.nationality)} · ${p.year}</div>` : ''}
          ${p && s.id === 'IGL' ? traitBadgeHTML(trait) : ''}
        </div>
        ${p ? ratingPillHTML(p, s.id, trait, state.hideRatings) : ''}
      </div>
    `;
  }).join('');
  return `<div class="panel roster">
    <h2>Your Roster (${Object.values(state.roster).filter(Boolean).length}/5)</h2>
    ${items}
  </div>`;
}

function rerollBarHTML() {
  return `
    <div class="reroll-bar">
      <div class="reroll-pill">Nationality re-spins <strong>${state.nationalityRerollsLeft}</strong></div>
      <div class="reroll-pill">Year re-spins <strong>${state.yearRerollsLeft}</strong></div>
    </div>
  `;
}

/* Two big slot-machine reels. nat/year may be null (un-spun → shows "?"). */
function reelsHTML(nat, year) {
  return `
    <div class="reels">
      <div class="reel" id="reel-nat">
        <div class="reel-label">Nationality</div>
        <div class="reel-window">
          <div class="reel-flag" id="nat-flag">${nat ? flag(nat) : '🌍'}</div>
          <div class="reel-value ${nat ? '' : 'placeholder'}" id="nat-value">${nat ? escapeHTML(nat) : '?'}</div>
        </div>
      </div>
      <div class="reel year" id="reel-year">
        <div class="reel-label">Year</div>
        <div class="reel-window">
          <div class="reel-flag">📅</div>
          <div class="reel-value ${year ? '' : 'placeholder'}" id="year-value">${year || '?'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderDraft() {
  const filledCount = Object.values(state.roster).filter(Boolean).length;
  const remaining = 5 - filledCount;

  // Un-spun round: show the reels with "?" and a big SPIN button.
  if (!state.currentRoll) {
    const viable = rollBucket() !== null;
    $main.innerHTML = `
      <div class="draft-grid">
        ${rosterHTML()}
        <div class="stack">
          <div class="panel roll-card">
            <div class="roll-head"><div class="roll-title">Pick ${filledCount + 1} of 5 — ${remaining} ${remaining === 1 ? 'slot' : 'slots'} left</div></div>
            ${viable ? `
              <div class="spin-stage">
                ${reelsHTML(null, null)}
                <div class="spin-actions">
                  <button class="btn btn-spin" id="spin-btn" onclick="spin()">SPIN</button>
                  <div class="tiny" style="text-align:center">Spin to roll a nationality &amp; year, then draft a player who fits.</div>
                </div>
              </div>
            ` : `
              <div class="no-players">
                <div class="big">No more viable rolls.</div>
                <p>The dataset can't fill the remaining slots.</p>
              </div>
            `}
          </div>
        </div>
      </div>`;
    return;
  }

  const { nationality, year, players } = state.currentRoll;

  const playerCardsHTML = players.map(p => {
    const used = state.usedPlayerNames.has(p.name);
    const canFit = anyOpenSlotForPlayer(p);
    const disabled = used || !canFit;
    const picking = state.pendingPlayer && state.pendingPlayer.id === p.id;
    return `
      <button class="player-row ${disabled ? 'disabled' : ''} ${picking ? 'selected' : ''}" ${disabled ? '' : `onclick="clickPlayer(${JSON.stringify(p).replace(/"/g, '&quot;')})"`}>
        <div class="avatar">${escapeHTML(p.name.slice(0,2).toUpperCase())}</div>
        <div>
          <div class="pname">${escapeHTML(p.name)} <span class="tiny" style="color:var(--fg-mute);font-weight:600">· ${p.year}</span></div>
          <div class="proles">
            ${p.roles.map(r => `<span class="role-chip"><span class="ico">${ROLE_ICON[r]}</span>${escapeHTML(r)}</span>`).join('')}
            ${used ? '<span class="role-chip" style="color:var(--bad)">Already picked</span>' : ''}
          </div>
          ${traitBadgeHTML(traitForPlayer(p))}
        </div>
        <div class="rating-pill">${state.hideRatings ? '?' : p.rating.toFixed(2)}</div>
      </button>
    `;
  }).join('');

  $main.innerHTML = `
    <div class="draft-grid">
      ${rosterHTML()}
      <div class="stack">
        <div class="panel roll-card">
          <div class="roll-head">
            <div class="roll-title">Pick ${filledCount + 1} of 5 — ${remaining} ${remaining === 1 ? 'slot' : 'slots'} left</div>
            ${rerollBarHTML()}
          </div>
          <div class="spin-stage">
            ${reelsHTML(nationality, year)}
            <div class="spin-actions">
              <div class="roll-actions">
                <button class="btn btn-ghost btn-sm" ${state.nationalityRerollsLeft <= 0 ? 'disabled' : ''} onclick="rerollNationality()">↻ Re-spin nationality</button>
                <button class="btn btn-ghost btn-sm" ${state.yearRerollsLeft <= 0 ? 'disabled' : ''} onclick="rerollYear()">↻ Re-spin year</button>
              </div>
            </div>
          </div>
        </div>
        <div class="panel player-list">
          ${players.length === 0
            ? `<div class="no-players"><div class="big">No players match.</div><p>Try a reroll.</p></div>`
            : playerCardsHTML}
        </div>
      </div>
    </div>
  `;
}

function renderResults() {
  const { avg, stages, wonMajor } = state.results;
  const stagesPassed = stages.filter(s => s.passed).length;
  let outcome;
  if (wonMajor) outcome = { title: '🏆 MAJOR CHAMPIONS', sub: 'Your roster lifted the trophy.', cls: 'win', trophy: '🏆' };
  else if (stagesPassed === 5) outcome = { title: 'GRAND FINALISTS', sub: 'So close — fell at the final hurdle.', cls: 'loss', trophy: '🥈' };
  else if (stagesPassed === 4) outcome = { title: 'TOP 4 — SEMIFINALS', sub: 'A deep run, no shame.', cls: 'loss', trophy: '🥉' };
  else if (stagesPassed === 3) outcome = { title: 'QUARTERFINALISTS', sub: 'Made the playoffs.', cls: 'loss', trophy: '🎯' };
  else if (stagesPassed === 2) outcome = { title: 'OUT IN CHAMPIONS STAGE', sub: 'Couldn\'t crack the playoffs.', cls: 'loss', trophy: '💔' };
  else if (stagesPassed === 1) outcome = { title: 'OUT IN LEGENDS STAGE', sub: 'A rough Major.', cls: 'loss', trophy: '💔' };
  else outcome = { title: 'OUT IN CHALLENGERS', sub: 'Eliminated at the first hurdle.', cls: 'loss', trophy: '💔' };

  const trait = state.results.trait;
  const teamHTML = SLOTS.map(s => {
    const p = state.roster[s.id];
    return `
      <div class="slot filled">
        <div class="role-ico">${ROLE_ICON[s.role]}</div>
        <div class="meta">
          <div class="role-label">${s.label}</div>
          <div class="name">${escapeHTML(p.name)}</div>
          <div class="sub">${flag(p.nationality)} ${escapeHTML(p.nationality)} · ${p.year}</div>
          ${s.id === 'IGL' ? traitBadgeHTML(trait) : ''}
        </div>
        ${ratingPillHTML(p, s.id, trait, false)}
      </div>
    `;
  }).join('');

  const stageRowsHTML = stages.map((s, i) => {
    const cls = s.passed ? 'passed' : (s.played ? 'failed' : 'pending');
    const status = s.passed ? 'Passed' : (s.played ? 'Eliminated' : '—');
    const ico = s.passed ? '✅' : (s.played ? '❌' : '·');
    const req = `needs ${s.difficulty.toFixed(2)} avg`;
    return `
      <div class="stage-row ${cls} reveal" style="animation-delay:${i * 120}ms">
        <div class="ico">${ico}</div>
        <div>
          <div class="name">${s.name}</div>
          <div class="desc">${s.desc} · ${req}</div>
        </div>
        <div class="status">${status}</div>
      </div>
    `;
  }).join('');

  $main.innerHTML = `
    <div class="panel results-hero reveal">
      <div class="trophy">${outcome.trophy}</div>
      <div class="title ${outcome.cls}">${outcome.title}</div>
      <div class="sub">${outcome.sub}</div>
      <div class="sub" style="margin-top:6px;">${state.difficulty === 'hard' ? 'Hard' : 'Easy'} · ${state.hideRatings ? 'IQ' : 'Classic'}</div>
      <div class="sub" style="margin-top:10px;">Team Avg Rating: <strong style="color:var(--fg)">${avg.toFixed(3)}</strong></div>
      ${trait ? `<div class="sub" style="margin-top:6px;">IGL trait active: <strong style="color:var(--accent)">${escapeHTML(trait.name)}</strong> · ${escapeHTML(traitBoostSummary(trait))}</div>` : ''}
    </div>

    <div class="draft-grid" style="margin-top:16px;">
      <div class="panel team-grid">
        ${teamHTML}
      </div>
      <div class="panel stages">
        ${stageRowsHTML}
      </div>
    </div>

    <div class="footer-bar">
      <button class="btn btn-primary" onclick="startDraft('${state.hideRatings ? 'iq' : 'classic'}')">Play Again</button>
      <button class="btn btn-ghost" onclick="newGame(); render();">Back to Home</button>
    </div>
  `;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Boot ---------- */
fetch('players.csv')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
  .then(text => {
    ALL_PLAYERS = parseCSV(text);
    UNIQUE_NATIONALITIES = Array.from(new Set(ALL_PLAYERS.map(p => p.nationality))).sort();
    UNIQUE_YEARS = Array.from(new Set(ALL_PLAYERS.map(p => p.year))).sort((a, b) => a - b);
    newGame();
    render();
  })
  .catch(err => {
    console.error('Failed to load players.csv:', err);
    document.getElementById('main').innerHTML =
      '<section class="home-hero"><h1 class="hero">Couldn\'t load player data.</h1>' +
      '<p class="lead">Serve this page over http (e.g. <code>python -m http.server</code>) and reload.</p></section>';
  });
