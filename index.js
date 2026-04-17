'use strict';
/* ════════════════════════════════════════════════════════════
   TRIOLET – index.js
   Corrections :
     • Règle du carré interdite pendant le 1er tour complet
     • Possibilité de passer sans échanger de jeton
════════════════════════════════════════════════════════════ */

// ── Constantes ───────────────────────────────────────────────
const BOARD_SIZE = 15;
const CENTER     = 7;   // index 0-based (case H8)

// Cases spéciales (coordonnées 0-based)
const SPECIAL_CASES_DEF = {
  double: [
    [0,4],[0,10],
    [1,1],[1,7],[1,13],
    [4,0],[4,4],[4,10],[4,14],
    [7,1],[7,13],
    [10,0],[10,4],[10,10],[10,14],
    [13,1],[13,7],[13,13],
    [14,4],[14,10],
    [7,7]   // centre
  ],
  triple: [
    [0,0],[0,7],[0,14],
    [3,3],[3,11],
    [7,0],[7,14],
    [11,3],[11,11],
    [14,0],[14,7],[14,14]
  ],
  replay: [
    [0,2],[0,12],
    [2,0],[2,5],[2,9],[2,14],
    [5,2],[5,5],[5,9],[5,12],
    [9,2],[9,5],[9,9],[9,12],
    [12,0],[12,5],[12,9],[12,14],
    [14,2],[14,12]
  ]
};

// Distribution jetons
const TOKEN_DIST = {
  0:9,1:9,2:8,3:8,4:7,5:8,6:6,
  7:6,8:4,9:4,10:3,11:3,12:2,13:2,14:1,15:1
};

// ── État global ──────────────────────────────────────────────
let board                    = [];
let specialCases             = {};   // clé "r,c" → {type, used}
let bag                      = [];
let players                  = [];
let currentPlayer            = 0;
let firstMoveDone            = false;
let firstRoundComplete       = false;
let playersPlayedInFirstRound= new Set();
let tempPlacements           = [];   // [{row,col,token}]
let selectedToken            = null;
let gameStarted              = false;

// ── Initialisation ───────────────────────────────────────────

function initSpecialCases() {
  specialCases = {};
  for (const [type, coords] of Object.entries(SPECIAL_CASES_DEF)) {
    coords.forEach(([r,c]) => {
      specialCases[`${r},${c}`] = { type, used: false };
    });
  }
}

function buildBag() {
  const b = [];
  for (const [val, qty] of Object.entries(TOKEN_DIST)) {
    for (let i = 0; i < qty; i++) b.push({ value: parseInt(val), isJoker: false });
  }
  b.push({ value: null, isJoker: true, jokerValue: null });
  b.push({ value: null, isJoker: true, jokerValue: null });
  return b;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function drawTiles(player, n) {
  for (let i = 0; i < n && bag.length > 0; i++) {
    player.rack.push(bag.pop());
  }
}

function initGame(configs) {
  board  = Array.from({length:BOARD_SIZE}, ()=>Array(BOARD_SIZE).fill(null));
  bag    = buildBag();
  shuffleArray(bag);
  bag.splice(0, 3);   // retirer 3 jetons hors jeu

  initSpecialCases();

  players = configs.map((cfg, i) => ({
    id        : i,
    name      : cfg.name || `Joueur ${i+1}`,
    isAI      : cfg.isAI || false,
    difficulty: cfg.difficulty || 'medium',
    rack      : [],
    score     : 0
  }));

  players.forEach(p => drawTiles(p, 3));

  currentPlayer             = 0;
  firstMoveDone             = false;
  firstRoundComplete        = false;
  playersPlayedInFirstRound = new Set();
  tempPlacements            = [];
  selectedToken             = null;
  gameStarted               = true;

  showScreen('game-screen');
  renderAll();
  updateBagCount();
  if (players[currentPlayer].isAI) scheduleAIMove();
}

// ── Helpers plateau ──────────────────────────────────────────

function getCombinedBoard() {
  const cb = board.map(r => r.slice());
  tempPlacements.forEach(({row,col,token}) => { cb[row][col] = token; });
  return cb;
}

function getEffectiveValue(token) {
  if (!token) return 0;
  if (token.isJoker) return token.jokerValue ?? 0;
  return token.value;
}

/**
 * Retourne le segment contigu (H ou V) contenant (r,c) dans le plateau cb.
 */
function getSegment(cb, r, c, horizontal) {
  const cells = [];
  if (horizontal) {
    let cc = c;
    while (cc >= 0 && cb[r][cc] !== null) cc--;
    cc++;
    while (cc < BOARD_SIZE && cb[r][cc] !== null) {
      cells.push({r, c:cc, token:cb[r][cc]});
      cc++;
    }
  } else {
    let rr = r;
    while (rr >= 0 && cb[rr][c] !== null) rr--;
    rr++;
    while (rr < BOARD_SIZE && cb[rr][c] !== null) {
      cells.push({r:rr, c, token:cb[rr][c]});
      rr++;
    }
  }
  return cells;
}

function isSegmentValid(seg) {
  if (seg.length === 0 || seg.length > 3) return false;
  if (seg.length === 1) return true;
  const sum = seg.reduce((s,{token})=>s+getEffectiveValue(token), 0);
  if (seg.length === 2) return sum <= 15;
  return sum === 15;
}

// ── Règle du carré ───────────────────────────────────────────

/**
 * Vérifie si le plateau cb contient un carré 2×2
 * impliquant au moins une case temporaire.
 */
function wouldCreateSquare(cb) {
  for (let r = 0; r < BOARD_SIZE - 1; r++) {
    for (let c = 0; c < BOARD_SIZE - 1; c++) {
      if (cb[r][c] && cb[r][c+1] && cb[r+1][c] && cb[r+1][c+1]) {
        const involvesTmp = tempPlacements.some(p =>
          (p.row===r||p.row===r+1) && (p.col===c||p.col===c+1)
        );
        if (involvesTmp) return true;
      }
    }
  }
  return false;
}

// ── Validation ───────────────────────────────────────────────

function validateTempPlacements() {
  if (tempPlacements.length === 0 || tempPlacements.length > 3) return false;

  const cb   = getCombinedBoard();
  const rows = [...new Set(tempPlacements.map(p=>p.row))];
  const cols = [...new Set(tempPlacements.map(p=>p.col))];

  // Tous sur la même ligne ou colonne
  const isH = rows.length === 1;
  const isV = cols.length === 1;
  if (!isH && !isV) return false;

  // Continuité (pas de trou)
  if (isH) {
    const r=rows[0], minC=Math.min(...cols), maxC=Math.max(...cols);
    for (let c=minC;c<=maxC;c++) if (!cb[r][c]) return false;
  } else {
    const c=cols[0], minR=Math.min(...rows), maxR=Math.max(...rows);
    for (let r=minR;r<=maxR;r++) if (!cb[r][c]) return false;
  }

  // Premier coup → case centrale obligatoire
  if (!firstMoveDone) {
    if (!tempPlacements.some(p=>p.row===CENTER&&p.col===CENTER)) return false;
  } else {
    // Doit toucher un jeton permanent
    const touchesBoard = tempPlacements.some(p => {
      const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
      return dirs.some(([dr,dc])=>{
        const nr=p.row+dr, nc=p.col+dc;
        if (nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE) return false;
        return board[nr][nc] !== null &&
               !tempPlacements.some(t=>t.row===nr&&t.col===nc);
      });
    });
    if (!touchesBoard) return false;
  }

  // Valider tous les segments affectés
  const checked = new Set();
  for (const tp of tempPlacements) {
    for (const horizontal of [true, false]) {
      const seg = getSegment(cb, tp.row, tp.col, horizontal);
      const key = seg.map(s=>`${s.r},${s.c}`).join('|');
      if (checked.has(key)) continue;
      checked.add(key);
      if (seg.length > 1 && !isSegmentValid(seg)) return false;
    }
  }

  // ── Règle du carré ─────────────────────────────────────────
  if (wouldCreateSquare(cb)) {
    // Pendant le 1er tour complet → toujours interdit
    if (!firstRoundComplete) return false;
    // Après le 1er tour → interdit si bloquant (on utilise le même test)
    return false;
  }

  return true;
}

// ── Calcul des points ────────────────────────────────────────

function calculatePoints(placements) {
  if (!placements.length) return { points:0, replayTriggered:false };

  // Snapshot des cases spéciales AVANT de les consommer
  const scSnapshot = {};
  for (const [k,v] of Object.entries(specialCases)) {
    scSnapshot[k] = {...v};
  }

  const cb          = getCombinedBoard();
  const rows        = [...new Set(placements.map(p=>p.row))];
  const cols        = [...new Set(placements.map(p=>p.col))];
  const mainIsH     = rows.length === 1;

  const scoredKeys  = new Set();
  let total         = 0;
  let replayTriggered = false;
  const usedNow     = new Set();   // clés de cases spéciales à marquer used

  const scoreSegment = (seg, isMainAxis) => {
    if (seg.length < 2) return 0;
    const key = seg.map(s=>`${s.r},${s.c}`).join('|');
    if (scoredKeys.has(key)) return 0;
    scoredKeys.add(key);

    const sum     = seg.reduce((s,{token})=>s+getEffectiveValue(token), 0);
    const hasJoker= seg.some(({token})=>token.isJoker);
    let pts       = 0;

    // Trouver la meilleure case spéciale NON utilisée dans le segment
    let bestMult = 1, bestKey = null;
    let hasReplay = false;
    for (const {r,c} of seg) {
      const sk = `${r},${c}`;
      const sc = scSnapshot[sk];
      if (!sc || sc.used) continue;
      if (sc.type === 'replay') { hasReplay = true; continue; }
      const m = sc.type==='triple' ? 3 : 2;
      if (m > bestMult) { bestMult=m; bestKey=sk; }
    }
    if (hasReplay) replayTriggered = true;

    if (seg.length === 3 && sum === 15) {
      pts = 30 * bestMult;
      // Triolet ?
      if (isMainAxis && !hasJoker && placements.length === 3) {
        const allInSeg = placements.every(p => seg.some(s=>s.r===p.row&&s.c===p.col));
        if (allInSeg) pts += 50;
      }
    } else if (seg.length === 2) {
      pts = seg.reduce((s,{r,c,token}) => {
        const sk=`${r},${c}`;
        const sc=scSnapshot[sk];
        const m=(sc&&!sc.used&&sc.type!=='replay')?(sc.type==='triple'?3:2):1;
        return s + getEffectiveValue(token)*m;
      }, 0);
    }

    if (bestKey) usedNow.add(bestKey);
    return pts;
  };

  for (const p of placements) {
    total += scoreSegment(getSegment(cb, p.row, p.col, true),  mainIsH);
    total += scoreSegment(getSegment(cb, p.row, p.col, false), !mainIsH);
  }

  // Appliquer les cases utilisées
  usedNow.forEach(k => { specialCases[k].used = true; });

  return { points: total, replayTriggered };
}

// ── Tour humain ──────────────────────────────────────────────

function confirmPlacement() {
  if (!validateTempPlacements()) {
    showMessage("Placement invalide !", "error");
    return;
  }

  const player = players[currentPlayer];

  // Joker sans valeur ?
  for (const tp of tempPlacements) {
    if (tp.token.isJoker && tp.token.jokerValue === null) {
      const val = askJokerValue();
      if (val === null) return;
      tp.token.jokerValue = val;
    }
  }

  const { points, replayTriggered } = calculatePoints(tempPlacements);

  // Fixer sur le plateau
  tempPlacements.forEach(({row,col,token}) => { board[row][col] = token; });

  // Retirer du chevalet
  tempPlacements.forEach(({token}) => {
    const i = player.rack.indexOf(token);
    if (i !== -1) player.rack.splice(i,1);
  });

  player.score += points;
  if (!firstMoveDone) firstMoveDone = true;
  playersPlayedInFirstRound.add(currentPlayer);
  if (playersPlayedInFirstRound.size === players.length) firstRoundComplete = true;

  tempPlacements  = [];
  selectedToken   = null;

  drawTiles(player, 3 - player.rack.length);
  updateBagCount();
  showMessage(`${player.name} marque ${points} point${points>1?'s':''} !`, "success");

  if (isGameOver()) { endGame(); return; }

  if (replayTriggered) {
    showMessage(`${player.name} rejoue ! (case Rejouer)`, "info");
    renderAll();
    if (player.isAI) scheduleAIMove();
    return;
  }

  nextPlayer();
}

function cancelTempPlacements() {
  tempPlacements = [];
  selectedToken  = null;
  renderAll();
}

// ── Passer / Échanger ────────────────────────────────────────

/**
 * Ouvre le panneau modal permettant :
 *   • de passer sans échanger
 *   • d'échanger 1, 2 ou 3 jetons (si ≥ 5 jetons dans le sac)
 */
function openPassPanel() {
  const player = players[currentPlayer];
  if (player.isAI) return;

  // Annuler les placements temporaires en cours
  tempPlacements = [];
  selectedToken  = null;

  const panel        = document.getElementById('exchange-panel');
  const rackEl       = document.getElementById('exchange-rack');
  const confirmBtn   = document.getElementById('exchange-confirm-btn');
  const passOnlyBtn  = document.getElementById('pass-only-btn');
  const cancelBtn    = document.getElementById('exchange-cancel-btn');
  const bagInfoEl    = document.getElementById('exchange-bag-info');

  // Nettoyer et reconstruire le rack d'échange
  rackEl.innerHTML = '';
  const selectedIdx = new Set();

  const canExchange = bag.length >= 5;
  bagInfoEl.textContent = canExchange
    ? `${bag.length} jeton${bag.length>1?'s':''} restant${bag.length>1?'s':''} dans le sac.`
    : `Seulement ${bag.length} jeton${bag.length>1?'s':''} dans le sac — échange impossible (minimum 5).`;

  player.rack.forEach((token, idx) => {
    const el = document.createElement('div');
    el.className = 'exchange-token' + (token.isJoker ? ' joker' : '');
    el.textContent = token.isJoker ? 'J' : token.value;

    if (canExchange) {
      el.addEventListener('click', () => {
        if (selectedIdx.has(idx)) {
          selectedIdx.delete(idx);
          el.classList.remove('selected');
        } else {
          selectedIdx.add(idx);
          el.classList.add('selected');
        }
        confirmBtn.disabled = selectedIdx.size === 0;
      });
    } else {
      el.style.opacity = '.5';
      el.style.cursor  = 'default';
    }

    rackEl.appendChild(el);
  });

  confirmBtn.disabled = true;

  // ── Gestionnaires ──────────────────────────────
  // Cloner les boutons pour éviter les doublons d'écouteurs
  const newConfirm  = confirmBtn.cloneNode(true);
  const newPassOnly = passOnlyBtn.cloneNode(true);
  const newCancel   = cancelBtn.cloneNode(true);
  confirmBtn .replaceWith(newConfirm);
  passOnlyBtn.replaceWith(newPassOnly);
  cancelBtn  .replaceWith(newCancel);

  newConfirm.disabled = true;

  newConfirm.addEventListener('click', () => {
    const tokens = [...selectedIdx]
      .sort((a,b)=>b-a)
      .map(i => player.rack[i]);
    closePassPanel();
    doExchange(tokens);
  });

  newPassOnly.addEventListener('click', () => {
    closePassPanel();
    doPassTurn();
  });

  newCancel.addEventListener('click', () => {
    closePassPanel();
    renderAll();
  });

  panel.classList.add('open');
}

function closePassPanel() {
  document.getElementById('exchange-panel').classList.remove('open');
}

/** Échange les jetons sélectionnés puis passe le tour. */
function doExchange(tokens) {
  const player = players[currentPlayer];
  if (bag.length < 5) {
    showMessage("Pas assez de jetons pour échanger.", "warn");
    return;
  }
  tokens.forEach(t => {
    const i = player.rack.indexOf(t);
    if (i !== -1) player.rack.splice(i, 1);
    bag.push(t);
  });
  shuffleArray(bag);
  drawTiles(player, tokens.length);
  updateBagCount();
  showMessage(`${player.name} échange ${tokens.length} jeton${tokens.length>1?'s':''}.`, "info");
  nextPlayer();
}

/** Passe le tour sans rien faire. */
function doPassTurn() {
  const player = players[currentPlayer];
  showMessage(`${player.name} passe son tour.`, "info");
  nextPlayer();
}

// ── Gestion des tours ────────────────────────────────────────

function nextPlayer() {
  currentPlayer = (currentPlayer + 1) % players.length;
  tempPlacements = [];
  selectedToken  = null;
  renderAll();
  updateBagCount();
  if (isGameOver()) { endGame(); return; }
  if (players[currentPlayer].isAI) scheduleAIMove();
}

function isGameOver() {
  if (players.some(p=>p.rack.length===0) && bag.length===0) return true;
  if (bag.length === 0 && players.every(p=>!canPlay(p))) return true;
  return false;
}

function canPlay(player) {
  if (player.rack.length === 0) return false;
  return !!findBestMove(player, true);
}

function endGame() {
  // Bonus fin de partie
  const finisher = players.find(p=>p.rack.length===0);
  if (finisher) {
    players.forEach(p => {
      if (p===finisher) return;
      const sum = p.rack.reduce((s,t)=>s+getEffectiveValue(t),0);
      finisher.score += sum;
      p.score        -= sum;
    });
  } else {
    players.forEach(p => {
      const sum = p.rack.reduce((s,t)=>s+getEffectiveValue(t),0);
      p.score -= sum;
    });
  }
  showEndScreen();
}

// ── IA ───────────────────────────────────────────────────────

function scheduleAIMove() {
  const delay = 600 + Math.random()*400;
  setTimeout(aiPlay, delay);
}

function aiPlay() {
  const player = players[currentPlayer];
  if (!player || !player.isAI) return;

  const move = findBestMove(player, false);
  if (move) {
    tempPlacements = move.placements;
    confirmPlacement();
  } else {
    // IA passe (échange si possible)
    if (bag.length >= 5 && player.rack.length > 0) {
      doExchange(player.rack.slice(0,1));   // échange 1 jeton
    } else {
      doPassTurn();
    }
  }
}

function findBestMove(player, checkOnly) {
  const rack = player.rack;
  if (!rack.length) return null;

  let best = null, bestPts = -1;
  const positions = getCandidatePositions();

  for (const pos of positions) {
    for (const perm of permutations(rack, pos.length)) {
      const placements = pos.map((p,i)=>({row:p.r, col:p.c, token:perm[i]}));
      const saved = tempPlacements;
      tempPlacements = placements;

      if (validateTempPlacements()) {
        if (checkOnly) { tempPlacements=saved; return {placements}; }
        const {points} = calculatePoints(placements);
        if (points > bestPts) { bestPts=points; best={placements:placements.map(x=>({...x}))}; }
      }
      tempPlacements = saved;
    }
  }
  return best;
}

function getCandidatePositions() {
  const positions = [];

  if (!firstMoveDone) {
    // Doit couvrir le centre
    positions.push([{r:CENTER,c:CENTER}]);
    for (let c=0;c<BOARD_SIZE-1;c++) {
      if (c===CENTER||c+1===CENTER)
        positions.push([{r:CENTER,c},{r:CENTER,c:c+1}]);
    }
    for (let c=0;c<BOARD_SIZE-2;c++) {
      if (c===CENTER||c+1===CENTER||c+2===CENTER)
        positions.push([{r:CENTER,c},{r:CENTER,c:c+1},{r:CENTER,c:c+2}]);
    }
    for (let r=0;r<BOARD_SIZE-1;r++) {
      if (r===CENTER||r+1===CENTER)
        positions.push([{r,c:CENTER},{r:r+1,c:CENTER}]);
    }
    for (let r=0;r<BOARD_SIZE-2;r++) {
      if (r===CENTER||r+1===CENTER||r+2===CENTER)
        positions.push([{r,c:CENTER},{r:r+1,c:CENTER},{r:r+2,c:CENTER}]);
    }
    return positions;
  }

  // Cases libres adjacentes
  const adj = new Set();
  for (let r=0;r<BOARD_SIZE;r++) {
    for (let c=0;c<BOARD_SIZE;c++) {
      if (!board[r][c]) continue;
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
        const nr=r+dr,nc=c+dc;
        if (nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&!board[nr][nc])
          adj.add(`${nr},${nc}`);
      });
    }
  }
  const adjArr = [...adj].map(k=>{ const [r,c]=k.split(','); return {r:+r,c:+c}; });

  adjArr.forEach(p=>positions.push([p]));

  for (let i=0;i<adjArr.length;i++)
    for (let j=i+1;j<adjArr.length;j++) {
      const a=adjArr[i],b=adjArr[j];
      if (a.r===b.r||a.c===b.c) positions.push([a,b]);
    }

  for (let i=0;i<adjArr.length;i++)
    for (let j=i+1;j<adjArr.length;j++)
      for (let k=j+1;k<adjArr.length;k++) {
        const a=adjArr[i],b=adjArr[j],c=adjArr[k];
        if (a.r===b.r&&b.r===c.r) positions.push([a,b,c]);
        else if (a.c===b.c&&b.c===c.c) positions.push([a,b,c]);
      }

  return positions;
}

function permutations(arr, k) {
  if (k===0) return [[]];
  const res=[];
  arr.forEach((item,i)=>{
    const rest=arr.filter((_,idx)=>idx!==i);
    permutations(rest,k-1).forEach(p=>res.push([item,...p]));
  });
  return res;
}

// ── Rendu ────────────────────────────────────────────────────

function renderAll() {
  renderBoard();
  renderPlayersPanel();
  renderControls();
}

function renderBoard() {
  const container = document.getElementById('board');
  if (!container) return;
  container.innerHTML = '';

  for (let r=0;r<BOARD_SIZE;r++) {
    for (let c=0;c<BOARD_SIZE;c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';

      const key = `${r},${c}`;
      const sc  = specialCases[key];

      if (sc && !sc.used) {
        cell.classList.add(sc.type);
      } else if (sc && sc.used) {
        cell.classList.add('used-special');
      }

      if (r===CENTER && c===CENTER && !board[r][c]) {
        cell.classList.add('center-cell');
      }

      const tmp = tempPlacements.find(p=>p.row===r&&p.col===c);

      if (tmp) {
        cell.classList.add('temp');
        cell.textContent = tmp.token.isJoker
          ? `J${tmp.token.jokerValue!==null?'('+tmp.token.jokerValue+')':''}`
          : tmp.token.value;
        cell.addEventListener('click', ()=>{ removeTempAt(r,c); });

      } else if (board[r][c]) {
        cell.classList.add('occupied');
        const t = board[r][c];
        cell.textContent = t.isJoker
          ? `J(${t.jokerValue??'?'})`
          : t.value;

      } else {
        // Case vide cliquable
        cell.addEventListener('click', ()=>{ handleCellClick(r,c); });
      }

      container.appendChild(cell);
    }
  }
}

function renderPlayersPanel() {
  const panel = document.getElementById('players-panel');
  if (!panel) return;
  panel.innerHTML = '';

  players.forEach((p,i) => {
    const card = document.createElement('div');
    card.className = 'player-card' +
      (i===currentPlayer ? ' active' : '') +
      (p.isAI            ? ' ai-player' : '');

    const name  = document.createElement('div');
    name.className   = 'player-card-name';
    name.textContent = (p.isAI?'🤖 ':'👤 ') + p.name +
                       (i===currentPlayer?' ◀':'');

    const score = document.createElement('div');
    score.className   = 'player-card-score';
    score.textContent = p.score + ' pts';

    const rack = document.createElement('div');
    rack.className = 'player-card-rack';

    p.rack.forEach(token => {
      const t = document.createElement('div');
      const isCurrentHuman = i===currentPlayer && !p.isAI;

      t.className = 'rack-token' +
        (token.isJoker   ? ' joker'  : '') +
        (!isCurrentHuman ? ' hidden' : '') +
        (token===selectedToken ? ' selected' : '');

      t.textContent = isCurrentHuman
        ? (token.isJoker ? 'J' : token.value)
        : '■';

      if (isCurrentHuman) {
        t.addEventListener('click', ()=>{ handleTokenClick(token, t); });
      }

      rack.appendChild(t);
    });

    card.append(name, score, rack);
    panel.appendChild(card);
  });
}

function renderControls() {
  const player    = players[currentPlayer];
  const isHuman   = !player?.isAI;

  const confirmBtn = document.getElementById('confirm-btn');
  const cancelBtn  = document.getElementById('cancel-btn');
  const passBtn    = document.getElementById('pass-btn');

  if (confirmBtn) confirmBtn.disabled = !isHuman || tempPlacements.length===0;
  if (cancelBtn)  cancelBtn.disabled  = !isHuman || tempPlacements.length===0;
  if (passBtn)    passBtn.disabled    = !isHuman;
}

// ── Interactions joueur humain ───────────────────────────────

function handleTokenClick(token, el) {
  if (players[currentPlayer].isAI) return;

  if (selectedToken === token) {
    // Désélectionner
    selectedToken = null;
  } else {
    selectedToken = token;
  }
  renderAll();
}

function handleCellClick(r, c) {
  if (players[currentPlayer].isAI) return;
  if (!selectedToken) {
    showMessage("Sélectionnez d'abord un jeton sur votre chevalet.", "warn");
    return;
  }
  if (board[r][c]) return;
  if (tempPlacements.some(p=>p.row===r&&p.col===c)) return;

  let token = selectedToken;

  // Joker sans valeur → demander
  if (token.isJoker && token.jokerValue === null) {
    const val = askJokerValue();
    if (val === null) return;
    // Créer une copie avec la valeur définie
    token = { ...token, jokerValue: val };
    const idx = players[currentPlayer].rack.indexOf(selectedToken);
    if (idx !== -1) players[currentPlayer].rack[idx] = token;
    selectedToken = token;
  }

  // Limite : 1 seul joker par tour
  if (token.isJoker && tempPlacements.some(p=>p.token.isJoker)) {
    showMessage("Vous ne pouvez poser qu'un seul joker par tour.", "warn");
    return;
  }

  tempPlacements.push({row:r, col:c, token});
  selectedToken = null;
  renderAll();
}

function removeTempAt(r, c) {
  const idx = tempPlacements.findIndex(p=>p.row===r&&p.col===c);
  if (idx !== -1) {
    // Réinitialiser la valeur du joker si besoin
    const {token} = tempPlacements[idx];
    if (token.isJoker) {
      const ri = players[currentPlayer].rack.indexOf(token);
      if (ri !== -1) players[currentPlayer].rack[ri] = {...token, jokerValue:null};
    }
    tempPlacements.splice(idx, 1);
  }
  renderAll();
}

function askJokerValue() {
  const raw = prompt('Valeur du joker (0 à 15) :');
  if (raw === null) return null;
  const val = parseInt(raw, 10);
  if (isNaN(val) || val < 0 || val > 15) {
    showMessage("Valeur invalide (0-15).", "error");
    return null;
  }
  return val;
}

// ── UI utilitaires ───────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function showMessage(msg, type='info') {
  const bar = document.getElementById('message-bar');
  if (!bar) return;
  bar.textContent = msg;
  bar.className   = `message-bar ${type}`;
  clearTimeout(bar._timer);
  bar._timer = setTimeout(()=>{
    bar.textContent = '';
    bar.className   = 'message-bar';
  }, 3500);
}

function updateBagCount() {
  const el = document.getElementById('bag-number');
  if (el) el.textContent = bag.length;
}

function showEndScreen() {
  const overlay = document.getElementById('end-screen');
  const scores  = document.getElementById('end-scores');
  if (!overlay || !scores) return;

  const sorted = [...players].sort((a,b)=>b.score-a.score);
  const winner = sorted[0];

  scores.innerHTML = sorted.map((p,i)=>`
    <div class="end-score-row ${p===winner?'winner':''}">
      <span>${i===0?'🥇':i===1?'🥈':'🥉'} ${p.name}</span>
      <span class="pts">${p.score} pts</span>
    </div>`).join('');

  overlay.classList.add('open');
}

// ── Bootstrap ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── Boutons setup ──────────────────────────────────────────
  document.getElementById('start-btn')?.addEventListener('click', () => {
    const configs = [];
    document.querySelectorAll('.player-config').forEach(el => {
      const aiCb = el.querySelector('.player-ai');
      configs.push({
        name      : el.querySelector('.player-name')?.value.trim() || 'Joueur',
        isAI      : aiCb?.checked || false,
        difficulty: el.querySelector('.player-difficulty')?.value || 'medium'
      });
    });
    if (configs.length < 2) { alert("Il faut au moins 2 joueurs."); return; }
    initGame(configs);
  });

  document.getElementById('add-player-btn')?.addEventListener('click', () => {
    const list = document.getElementById('players-config');
    const count = list.querySelectorAll('.player-config').length;
    if (count >= 4) return;

    const div = document.createElement('div');
    div.className    = 'player-config';
    div.dataset.index= count;
    div.innerHTML    = `
      <div class="player-config-header">
        <span class="player-number">Joueur ${count+1}</span>
        <button class="remove-player-btn" title="Supprimer">✖</button>
      </div>
      <div class="player-config-body">
        <input class="player-name" type="text" value="Joueur ${count+1}" maxlength="16">
        <label class="ai-label">
          <input class="player-ai" type="checkbox"> IA
        </label>
        <select class="player-difficulty" disabled>
          <option value="easy">Facile</option>
          <option value="medium" selected>Moyen</option>
          <option value="hard">Difficile</option>
        </select>
      </div>`;

    div.querySelector('.remove-player-btn').addEventListener('click', ()=>div.remove());
    list.appendChild(div);
  });

  // Activer/désactiver le sélecteur de difficulté selon la case IA
  document.getElementById('players-config')
    .addEventListener('change', e => {
      if (!e.target.classList.contains('player-ai')) return;
      const body = e.target.closest('.player-config-body');
      const sel  = body?.querySelector('.player-difficulty');
      if (sel) sel.disabled = !e.target.checked;
    });

  // ── Boutons jeu ────────────────────────────────────────────
  document.getElementById('confirm-btn')
    ?.addEventListener('click', confirmPlacement);

  document.getElementById('cancel-btn')
    ?.addEventListener('click', cancelTempPlacements);

  document.getElementById('pass-btn')
    ?.addEventListener('click', openPassPanel);

  document.getElementById('restart-btn')
    ?.addEventListener('click', ()=>showScreen('setup-screen'));

  document.getElementById('end-restart-btn')
    ?.addEventListener('click', ()=>{
      document.getElementById('end-screen').classList.remove('open');
      showScreen('setup-screen');
    });

  // ── Règles ─────────────────────────────────────────────────
  document.getElementById('rules-btn')
    ?.addEventListener('click', ()=>{
      document.getElementById('rules-panel').classList.add('open');
    });

  document.getElementById('rules-close-btn')
    ?.addEventListener('click', ()=>{
      document.getElementById('rules-panel').classList.remove('open');
    });

  // Fermer modales en cliquant sur l'overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay=>{
    overlay.addEventListener('click', e=>{
      if (e.target===overlay) overlay.classList.remove('open');
    });
  });
});
