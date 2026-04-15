// ============================================================
//  TRIOLET ONLINE – index.js
// ============================================================

const DISTRIBUTION = {
  0:9, 1:9, 2:8, 3:8, 4:7, 5:8, 6:6,
  7:6, 8:4, 9:4, 10:3, 11:3, 12:2, 13:2, 14:1, 15:1
};

function letterToRow(l) {
  return l.toUpperCase().charCodeAt(0) - 65;
}

function buildSpecialCases() {
  const m = {};
  const rejouer = ['A8','B2','B14','H1','H15','N2','N14','O8'];
  const doubles = ['D8','E5','E11','H4','H12','K5','K11','L8'];
  const triples = ['B5','B11','E2','E14','K2','K14','N5','N11'];
  const centre  = ['H8'];

  function parse(str) {
    const row = letterToRow(str[0]);
    const col = parseInt(str.slice(1)) - 1;
    return `${row},${col}`;
  }

  rejouer.forEach(s => { m[parse(s)] = 'R'; });
  doubles.forEach(s => { m[parse(s)] = 'D'; });
  triples.forEach(s => { m[parse(s)] = 'T'; });
  centre.forEach(s  => { m[parse(s)] = 'C'; });
  return m;
}

const SPECIAL_CASES = buildSpecialCases();

let G = null;

// ---------- CRÉATION DE PARTIE ----------

function createGame(players) {
  const sac = [];
  for (const [val, qty] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < qty; i++) {
      sac.push({ val: parseInt(val), isJoker: false });
    }
  }
  sac.push({ val: null, isJoker: true, jokerVal: null });
  sac.push({ val: null, isJoker: true, jokerVal: null });
  shuffle(sac);
  sac.splice(0, 3);

  const joueurs = players.map((name, i) => ({
    name, score: 0, hand: [], isIA: i > 0
  }));
  joueurs.forEach(j => { j.hand = drawTokens(sac, 3); });

  return {
    board: Array.from({ length: 15 }, () => Array(15).fill(null)),
    sac,
    joueurs,
    currentPlayerIndex: 0,
    firstMove: true,
    usedSpecials: new Set(),
    // pending : jetons en cours de placement
    // { tokenIndex, r, c, val, isJoker, jokerVal }
    pending: [],
    selectedTokenIndex: null,
    gameOver: false,
    rejouerFlag: false
  };
}

// ---------- UTILITAIRES ----------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawTokens(sac, n) {
  const drawn = [];
  for (let i = 0; i < n && sac.length > 0; i++) drawn.push(sac.pop());
  return drawn;
}

function getSpecialType(r, c) {
  const key = `${r},${c}`;
  if (G.usedSpecials.has(key)) return null;
  return SPECIAL_CASES[key] || null;
}

function effectiveVal(t) {
  if (!t) return null;
  return t.isJoker ? t.jokerVal : t.val;
}

// ---------- LOGIQUE PLATEAU ----------

function boardWithPending() {
  const b = G.board.map(row => row.map(c => c ? { ...c } : null));
  for (const p of G.pending) {
    b[p.r][p.c] = { val: p.val, isJoker: p.isJoker, jokerVal: p.jokerVal };
  }
  return b;
}

function getLine(board, r, c, dr, dc) {
  let sr = r, sc = c;
  while (
    sr - dr >= 0 && sr - dr < 15 &&
    sc - dc >= 0 && sc - dc < 15 &&
    board[sr - dr][sc - dc] !== null
  ) { sr -= dr; sc -= dc; }

  const line = [];
  let cr = sr, cc = sc;
  while (cr >= 0 && cr < 15 && cc >= 0 && cc < 15 && board[cr][cc] !== null) {
    line.push({ r: cr, c: cc, token: board[cr][cc] });
    cr += dr; cc += dc;
  }
  return line;
}

function getAffectedLines() {
  const vBoard = boardWithPending();
  const lines  = [];
  const seen   = new Set();

  for (const p of G.pending) {
    const hKey = `H${p.r}`;
    if (!seen.has(hKey)) {
      seen.add(hKey);
      const l = getLine(vBoard, p.r, p.c, 0, 1);
      if (l.length >= 2) lines.push(l);
    }
    const vKey = `V${p.c}`;
    if (!seen.has(vKey)) {
      seen.add(vKey);
      const l = getLine(vBoard, p.r, p.c, 1, 0);
      if (l.length >= 2) lines.push(l);
    }
  }
  return lines;
}

function isAdjacentToExisting(r, c) {
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && G.board[nr][nc] !== null)
      return true;
  }
  return false;
}

// ── CORRECTION 1 : carré interdit UNIQUEMENT au premier tour ──
function wouldCreate2x2AtFirstMove(board) {
  if (!G.firstMove) return false; // ignoré après le 1er tour
  for (let r = 0; r < 14; r++) {
    for (let c = 0; c < 14; c++) {
      if (board[r][c] && board[r+1][c] && board[r][c+1] && board[r+1][c+1]) {
        const pendingInSquare = G.pending.some(p =>
          (p.r === r || p.r === r+1) && (p.c === c || p.c === c+1)
        );
        if (pendingInSquare) return true;
      }
    }
  }
  return false;
}

// ---------- VALIDATION ----------

function validatePlacement() {
  if (G.pending.length === 0) return { ok: false, msg: 'Aucun jeton à placer.' };
  if (G.pending.length > 3)   return { ok: false, msg: 'Maximum 3 jetons par tour.' };

  for (const p of G.pending) {
    if (p.isJoker && p.jokerVal === null)
      return { ok: false, msg: 'Définissez la valeur du joker.' };
  }

  const rows = [...new Set(G.pending.map(p => p.r))];
  const cols = [...new Set(G.pending.map(p => p.c))];
  if (rows.length > 1 && cols.length > 1)
    return { ok: false, msg: 'Les jetons doivent être sur la même ligne ou colonne.' };

  if (G.firstMove) {
    if (!G.pending.some(p => p.r === 7 && p.c === 7))
      return { ok: false, msg: 'Le premier jeton doit couvrir la case centrale H8.' };
  } else {
    if (!G.pending.some(p => isAdjacentToExisting(p.r, p.c)))
      return { ok: false, msg: 'Les jetons doivent être adjacents à un jeton déjà posé.' };
  }

  const vBoard = boardWithPending();
  const lines  = getAffectedLines();

  for (const line of lines) {
    if (line.length > 3)
      return { ok: false, msg: 'Maximum 3 jetons côte à côte.' };
    const vals = line.map(l => effectiveVal(l.token));
    if (vals.some(v => v === null))
      return { ok: false, msg: 'La valeur du joker doit être définie.' };
    const sum = vals.reduce((a, b) => a + b, 0);
    if (line.length === 2 && sum > 15)
      return { ok: false, msg: `2 jetons : total ${sum} > 15.` };
    if (line.length === 3 && sum !== 15)
      return { ok: false, msg: `3 jetons : total ${sum} ≠ 15 (doit faire exactement 15).` };
  }

  // Carré interdit seulement au 1er tour
  if (wouldCreate2x2AtFirstMove(vBoard))
    return { ok: false, msg: 'Interdit de former un carré au premier tour.' };

  if (G.pending.filter(p => p.isJoker).length >= 2)
    return { ok: false, msg: 'Interdit de poser 2 jokers au même tour.' };

  return { ok: true };
}

// ---------- CALCUL DES POINTS ----------

function calculateScore() {
  let total = 0;
  const lines    = getAffectedLines();
  const hasJoker = G.pending.some(p => p.isJoker);

  // ── CORRECTION 2 : détection Triolet ──
  // Triolet = les 3 jetons du chevalet posés EN UNE SEULE FOIS
  // formant EUX-MÊMES un Trio (les 3 pending sont dans la même ligne)
  let isTriolet = false;
  if (G.pending.length === 3 && !hasJoker) {
    // Vérifier que les 3 pending sont tous dans la même ligne affectée
    for (const line of lines) {
      const allPendingInLine = G.pending.every(p =>
        line.some(l => l.r === p.r && l.c === p.c)
      );
      if (allPendingInLine && line.length === 3) {
        const vals = line.map(l => effectiveVal(l.token));
        const sum  = vals.reduce((a, b) => a + b, 0);
        if (sum === 15) { isTriolet = true; break; }
      }
    }
  }

  let trioletBonus = isTriolet ? 50 : 0;
  let trioletApplied = false;

  for (const line of lines) {
    const vals = line.map(l => effectiveVal(l.token));
    const sum  = vals.reduce((a, b) => a + b, 0);

    // Case spéciale sur un jeton pending de cette ligne
    let multiplier     = 1;
    let specialUsedKey = null;

    for (const p of G.pending) {
      if (!line.some(l => l.r === p.r && l.c === p.c)) continue;
      const sp = getSpecialType(p.r, p.c);
      if (sp === 'D' || sp === 'C') {
        multiplier = 2; specialUsedKey = `${p.r},${p.c}`; break;
      }
      if (sp === 'T') {
        multiplier = 3; specialUsedKey = `${p.r},${p.c}`; break;
      }
    }

    if (line.length === 3 && sum === 15) {
      let pts = 30 * multiplier;

      // Ajouter le bonus Triolet UNE SEULE FOIS sur la ligne triolet
      if (isTriolet && !trioletApplied) {
        const allPendingInLine = G.pending.every(p =>
          line.some(l => l.r === p.r && l.c === p.c)
        );
        if (allPendingInLine) {
          pts += trioletBonus;
          trioletApplied = true;
          log(`🎉 TRIOLET ! Trio×${multiplier}=${30*multiplier} + bonus 50 = ${pts} pts`, 'good');
        } else {
          log(`✅ Trio = 30×${multiplier} = ${30*multiplier} pts`, 'good');
        }
      } else {
        log(`✅ Trio = 30×${multiplier} = ${30*multiplier} pts`, 'good');
      }

      if (specialUsedKey) G.usedSpecials.add(specialUsedKey);
      total += pts;

    } else if (line.length === 2) {
      let pts = 0;
      for (const item of line) {
        const isNew = G.pending.some(p => p.r === item.r && p.c === item.c);
        const v     = effectiveVal(item.token);
        if (isNew) {
          const sp = getSpecialType(item.r, item.c);
          if (sp === 'D' || sp === 'C') {
            pts += v * 2; G.usedSpecials.add(`${item.r},${item.c}`);
          } else if (sp === 'T') {
            pts += v * 3; G.usedSpecials.add(`${item.r},${item.c}`);
          } else {
            pts += v;
          }
        } else {
          pts += v;
        }
      }
      log(`➕ Paire = ${pts} pts`, 'info');
      total += pts;
    }
  }

  // Case Rejouer
  for (const p of G.pending) {
    if (getSpecialType(p.r, p.c) === 'R') {
      G.rejouerFlag = true;
      G.usedSpecials.add(`${p.r},${p.c}`);
      log('🔁 Case Rejouer !', 'good');
      break;
    }
  }

  return total;
}

// ---------- ACTIONS ----------

function confirmMove() {
  const check = validatePlacement();
  if (!check.ok) { log('❌ ' + check.msg, 'bad'); return; }

  const pts    = calculateScore();
  const player = G.joueurs[G.currentPlayerIndex];
  player.score += pts;
  log(`${player.name} marque ${pts} pts → Total : ${player.score}`, 'good');

  // Fixer les jetons sur le plateau
  for (const p of G.pending) {
    G.board[p.r][p.c] = {
      val: p.val, isJoker: p.isJoker, jokerVal: p.jokerVal
    };
  }

  // Retirer de la main (indices décroissants)
  const sortedIdx = [...G.pending]
    .sort((a, b) => b.tokenIndex - a.tokenIndex)
    .map(p => p.tokenIndex);
  sortedIdx.forEach(i => player.hand.splice(i, 1));

  // Repioche exactement le nombre posé
  const drawn = drawTokens(G.sac, G.pending.length);
  player.hand.push(...drawn);

  G.pending            = [];
  G.selectedTokenIndex = null;
  G.firstMove          = false;

  if (checkEndGame()) return;

  if (G.rejouerFlag) {
    G.rejouerFlag = false;
    render();
    return;
  }

  nextPlayer();
}

function cancelMove() {
  G.pending            = [];
  G.selectedTokenIndex = null;
  render();
}

function nextPlayer() {
  G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.joueurs.length;
  render();
  if (G.joueurs[G.currentPlayerIndex].isIA) setTimeout(iaPlay, 900);
}

function checkEndGame() {
  const player = G.joueurs[G.currentPlayerIndex];
  if (G.sac.length === 0 && player.hand.length === 0) {
    let bonus = 0;
    G.joueurs.forEach((j, i) => {
      if (i !== G.currentPlayerIndex) {
        const sum = j.hand.reduce((a, t) => a + (effectiveVal(t) || 0), 0);
        bonus += sum;
        log(`${j.name} perd ${sum} pts (jetons restants)`, 'bad');
      }
    });
    player.score += bonus;
    G.gameOver = true;
    setTimeout(showFinModal, 600);
    return true;
  }
  return false;
}

function showFinModal() {
  const sorted = [...G.joueurs].sort((a, b) => b.score - a.score);
  document.getElementById('fin-winner').textContent = `🥇 ${sorted[0].name} gagne !`;
  document.getElementById('fin-scores').innerHTML = sorted.map((j, i) =>
    `<div>${['🥇','🥈','🥉','4️⃣'][i]} ${j.name} : ${j.score} pts</div>`
  ).join('');
  document.getElementById('modal-fin').classList.add('active');
}

// ---------- IA ----------

function iaPlay() {
  const player = G.joueurs[G.currentPlayerIndex];
  if (player.hand.length === 0) { nextPlayer(); return; }

  let bestMove = null;
  let bestPts  = -1;

  for (let hi = 0; hi < player.hand.length; hi++) {
    const token = player.hand[hi];
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (G.board[r][c] !== null) continue;
        if (G.firstMove && !(r === 7 && c === 7)) continue;
        if (!G.firstMove && !isAdjacentToExisting(r, c)) continue;

        G.pending = [{
          tokenIndex: hi, r, c,
          val: token.val, isJoker: token.isJoker,
          jokerVal: token.isJoker ? 7 : null
        }];

        if (validatePlacement().ok) {
          const pts = calculateScore();
          if (pts > bestPts) { bestPts = pts; bestMove = { hi, r, c, token }; }
        }
        G.pending = [];
      }
    }
  }

  if (bestMove) {
    const { hi, r, c, token } = bestMove;
    G.pending = [{
      tokenIndex: hi, r, c,
      val: token.val, isJoker: token.isJoker,
      jokerVal: token.isJoker ? 7 : null
    }];
    const pts = calculateScore();
    player.score += pts;
    G.board[r][c] = { val: token.val, isJoker: token.isJoker, jokerVal: token.isJoker ? 7 : null };
    player.hand.splice(hi, 1);
    player.hand.push(...drawTokens(G.sac, 1));
    log(`🤖 ${player.name} joue ${token.isJoker ? 'X' : token.val} en ${String.fromCharCode(65+r)}${c+1} → ${pts} pts`, 'info');
    G.pending   = [];
    G.firstMove = false;
    if (!checkEndGame()) nextPlayer();
  } else {
    if (G.sac.length >= 5) {
      const t = player.hand.pop();
      G.sac.push(t); shuffle(G.sac);
      player.hand.push(...drawTokens(G.sac, 1));
      log(`🤖 ${player.name} échange.`, 'info');
    } else {
      log(`🤖 ${player.name} passe.`, 'info');
    }
    nextPlayer();
  }
}

// ---------- RENDU ----------

function render() {
  renderBoard();
  renderScores();
  renderChevalet();
  renderPending();
  document.getElementById('sac-count').textContent = G.sac.length;
  const p = G.joueurs[G.currentPlayerIndex];
  document.getElementById('current-player-name').textContent =
    (p.isIA ? '🤖 ' : '👤 ') + p.name;
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';

      const sp   = SPECIAL_CASES[`${r},${c}`];
      const used = G.usedSpecials.has(`${r},${c}`);

      if (!used) {
        if (sp === 'R') cell.classList.add('rejouer');
        if (sp === 'D') cell.classList.add('double');
        if (sp === 'T') cell.classList.add('triple');
        if (sp === 'C') cell.classList.add('center');
      }

      // Jeton fixé sur le plateau
      if (G.board[r][c]) {
        const t   = G.board[r][c];
        const tok = createTokenEl(t, false);
        cell.appendChild(tok);

      // Jeton pending sur cette case
      } else {
        const pend = G.pending.find(p => p.r === r && p.c === c);
        if (pend) {
          const tok = createTokenEl(
            { val: pend.val, isJoker: pend.isJoker, jokerVal: pend.jokerVal },
            true // c'est un pending
          );
          cell.appendChild(tok);
          // Clic sur le jeton pending → le récupérer
          tok.addEventListener('click', (e) => {
            e.stopPropagation();
            removePendingByPos(r, c);
          });

        } else {
          // Case vide : label spéciale
          if (!used && sp) {
            const lbl = document.createElement('span');
            lbl.className = 'cell-label';
            lbl.textContent =
              sp === 'R' ? '↺' :
              (sp === 'D' || sp === 'C') ? '×2' : '×3';
            cell.appendChild(lbl);
          }

          // Surbrillance si jeton sélectionné
          if (G.selectedTokenIndex !== null) {
            if (G.firstMove) {
              if (r === 7 && c === 7) cell.classList.add('highlight');
            } else {
              if (isAdjacentToExisting(r, c)) cell.classList.add('highlight');
            }
          }
        }
      }

      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

// ── CORRECTION 3 : valeur du joker dans l'angle ──
// ── CORRECTION 4 : createTokenEl unifié ──
function createTokenEl(t, isPending) {
  const tok = document.createElement('div');
  tok.className = 'token' + (t.isJoker ? ' joker-token' : '') + (isPending ? ' token-pending' : '');

  if (t.isJoker) {
    // Lettre X grande
    const main = document.createElement('span');
    main.className = 'token-main';
    main.textContent = 'X';
    tok.appendChild(main);

    // ── Valeur du joker dans l'angle bas-droit ──
    if (t.jokerVal !== null && t.jokerVal !== undefined) {
      const corner = document.createElement('span');
      corner.className = 'token-corner';
      corner.textContent = t.jokerVal;
      tok.appendChild(corner);
    }
  } else {
    const main = document.createElement('span');
    main.className = 'token-main';
    main.textContent = t.val;
    tok.appendChild(main);
  }

  if (isPending) tok.title = 'Cliquez pour récupérer ce jeton';
  return tok;
}

// ── CORRECTION 4 : chevalet sans les jetons déjà placés ──
function renderChevalet() {
  const player = G.joueurs[0];
  const cont   = document.getElementById('chevalet');
  cont.innerHTML = '';

  // Indices des jetons déjà dans pending
  const pendingIndices = new Set(G.pending.map(p => p.tokenIndex));

  player.hand.forEach((t, i) => {
    if (pendingIndices.has(i)) return; // ← ne pas afficher si déjà posé

    const div = document.createElement('div');
    div.className = 'hand-token' + (t.isJoker ? ' joker' : '');
    if (G.selectedTokenIndex === i) div.classList.add('selected');

    if (t.isJoker) {
      const main = document.createElement('span');
      main.className = 'token-main';
      main.textContent = 'X';
      div.appendChild(main);
    } else {
      div.textContent = t.val;
    }

    div.addEventListener('click', () => onSelectToken(i));
    cont.appendChild(div);
  });
}

function renderPending() {
  // Le panneau "À placer" reste pour info mais les jetons sont
  // maintenant visibles directement sur le plateau
  const cont = document.getElementById('pending-tokens');
  cont.innerHTML = '';
  if (G.pending.length === 0) {
    cont.innerHTML = '<span style="color:#aaa;font-size:0.8rem;">Sélectionnez un jeton puis cliquez sur le plateau</span>';
    return;
  }
  G.pending.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'pending-token' + (p.isJoker ? ' joker' : '');
    div.textContent = p.isJoker ? `X(${p.jokerVal ?? '?'})` : p.val;
    div.title = `En ${String.fromCharCode(65+p.r)}${p.c+1} — cliquez sur le plateau pour récupérer`;
    cont.appendChild(div);
  });
}

function renderScores() {
  document.getElementById('scores-container').innerHTML =
    G.joueurs.map(j =>
      `<div class="score-row">
        <span>${j.isIA ? '🤖 ' : '👤 '}${j.name}</span>
        <span class="pts">${j.score}</span>
      </div>`
    ).join('');
}

// ---------- INTERACTIONS ----------

function onSelectToken(index) {
  if (G.gameOver) return;
  if (G.joueurs[G.currentPlayerIndex].isIA) return;
  if (G.pending.some(p => p.tokenIndex === index)) return;
  G.selectedTokenIndex = (G.selectedTokenIndex === index) ? null : index;
  render();
}

function onCellClick(r, c) {
  if (G.gameOver) return;
  if (G.joueurs[G.currentPlayerIndex].isIA) return;

  // Si case déjà occupée par un jeton fixé → rien
  if (G.board[r][c] !== null) return;

  // Si case occupée par un pending → récupérer
  if (G.pending.some(p => p.r === r && p.c === c)) {
    removePendingByPos(r, c);
    return;
  }

  if (G.selectedTokenIndex === null) return;

  const player = G.joueurs[0];
  const token  = player.hand[G.selectedTokenIndex];

  if (token.isJoker) {
    openJokerModal(r, c);
    return;
  }

  G.pending.push({
    tokenIndex: G.selectedTokenIndex,
    r, c,
    val: token.val, isJoker: false, jokerVal: null
  });
  G.selectedTokenIndex = null;
  render();
}

// ── CORRECTION 4 : récupérer un jeton depuis le plateau ──
function removePendingByPos(r, c) {
  const idx = G.pending.findIndex(p => p.r === r && p.c === c);
  if (idx === -1) return;
  G.pending.splice(idx, 1);
  G.selectedTokenIndex = null;
  render();
}

function removePending(i) {
  G.pending.splice(i, 1);
  G.selectedTokenIndex = null;
  render();
}

// ---------- MODAL JOKER ----------

let jokerPos = null;

function openJokerModal(r, c) {
  jokerPos = { r, c };
  const grid = document.getElementById('joker-grid');
  grid.innerHTML = '';
  for (let v = 0; v <= 15; v++) {
    const div = document.createElement('div');
    div.className = 'joker-val';
    div.textContent = v;
    div.addEventListener('click', () => confirmJokerVal(v));
    grid.appendChild(div);
  }
  document.getElementById('modal-joker').classList.add('active');
}

function confirmJokerVal(val) {
  document.getElementById('modal-joker').classList.remove('active');
  if (!jokerPos) return;
  G.pending.push({
    tokenIndex: G.selectedTokenIndex,
    r: jokerPos.r, c: jokerPos.c,
    val: null, isJoker: true, jokerVal: val
  });
  jokerPos             = null;
  G.selectedTokenIndex = null;
  render();
}

document.getElementById('btn-joker-cancel').addEventListener('click', () => {
  document.getElementById('modal-joker').classList.remove('active');
  jokerPos = null;
});

// ---------- MODAL ÉCHANGE ----------

let echangeSelected = [];

function openEchangeModal() {
  echangeSelected = [];
  const player = G.joueurs[0];
  const cont   = document.getElementById('echange-chevalet');
  cont.innerHTML = '';

  player.hand.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'hand-token' + (t.isJoker ? ' joker' : '');
    div.textContent = t.isJoker ? 'X' : t.val;
    div.style.margin = '4px';
    div.addEventListener('click', () => {
      const idx = echangeSelected.indexOf(i);
      if (idx === -1 && echangeSelected.length < 3) {
        echangeSelected.push(i);
        div.classList.add('selected');
      } else if (idx !== -1) {
        echangeSelected.splice(idx, 1);
        div.classList.remove('selected');
      }
    });
    cont.appendChild(div);
  });

  document.getElementById('modal-echange').classList.add('active');
}

document.getElementById('btn-echange-confirm').addEventListener('click', () => {
  if (echangeSelected.length === 0) {
    log('❌ Sélectionnez au moins un jeton.', 'bad'); return;
  }
  if (G.sac.length < 5) {
    log('❌ Moins de 5 jetons dans le sac : échange impossible.', 'bad');
    document.getElementById('modal-echange').classList.remove('active');
    return;
  }
  const player  = G.joueurs[0];
  const sorted  = [...echangeSelected].sort((a, b) => b - a);
  const removed = sorted.map(i => player.hand.splice(i, 1)[0]);
  G.sac.push(...removed);
  shuffle(G.sac);
  player.hand.push(...drawTokens(G.sac, removed.length));
  log(`🔄 ${player.name} échange ${removed.length} jeton(s).`, 'info');
  document.getElementById('modal-echange').classList.remove('active');
  nextPlayer();
});

document.getElementById('btn-echange-cancel').addEventListener('click', () => {
  document.getElementById('modal-echange').classList.remove('active');
});

// ---------- BOUTONS ----------

document.getElementById('btn-valider').addEventListener('click', () => {
  if (G.joueurs[G.currentPlayerIndex].isIA) {
    log('⏳ Ce n\'est pas votre tour.', 'bad'); return;
  }
  confirmMove();
});

document.getElementById('btn-annuler-coup').addEventListener('click', cancelMove);

document.getElementById('btn-echanger').addEventListener('click', () => {
  if (G.joueurs[G.currentPlayerIndex].isIA) {
    log('⏳ Ce n\'est pas votre tour.', 'bad'); return;
  }
  if (G.pending.length > 0) {
    log('❌ Annulez vos placements avant d\'échanger.', 'bad'); return;
  }
  openEchangeModal();
});

document.getElementById('btn-quitter').addEventListener('click', () => {
  G = null;
  document.getElementById('screen-game').style.display = 'none';
  document.getElementById('screen-lobby').style.display = 'block';
});

document.getElementById('btn-rejouer').addEventListener('click', () => {
  document.getElementById('modal-fin').classList.remove('active');
  const pseudo = document.getElementById('input-pseudo').value.trim() || 'Joueur';
  startGame([pseudo, 'IA']);
});

// ---------- DÉMARRAGE ----------

function startGame(players) {
  G = createGame(players);
  document.getElementById('screen-lobby').style.display = 'none';
  document.getElementById('screen-game').style.display  = 'block';
  document.getElementById('message-log').innerHTML = '';
  log('🎮 Nouvelle partie ! Bon jeu !', 'good');
  log(`📦 Sac : ${G.sac.length} jetons`, 'info');
  render();
}

document.getElementById('btn-solo').addEventListener('click', () => {
  const pseudo = document.getElementById('input-pseudo').value.trim() || 'Joueur';
  startGame([pseudo, 'IA']);
});

document.getElementById('btn-creer-salon').addEventListener('click', () => {
  const pseudo = document.getElementById('input-pseudo').value.trim() || 'Joueur';
  const salon  = document.getElementById('input-salon-name').value.trim();
  if (!salon) { alert('Donnez un nom au salon !'); return; }
  startGame([pseudo, 'IA']);
});

// ---------- LOG ----------

function log(msg, type = '') {
  const div = document.getElementById('message-log');
  if (!div) return;
  const p = document.createElement('p');
  p.textContent = msg;
  if (type) p.classList.add(type);
  div.prepend(p);
  while (div.children.length > 30) div.removeChild(div.lastChild);
}
