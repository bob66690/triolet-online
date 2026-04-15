// ============================================================
//  TRIOLET ONLINE – index.js
// ============================================================

// ---------- DISTRIBUTION OFFICIELLE ----------
const DISTRIBUTION = {
  0:9, 1:9, 2:8, 3:8, 4:7, 5:8, 6:6,
  7:6, 8:4, 9:4, 10:3, 11:3, 12:2, 13:2, 14:1, 15:1
};
// + 2 jokers = 83 jetons, on retire 3 → 80 en jeu

// ---------- CASES SPÉCIALES (coordonnées officielles) ----------
// Plateau : lignes A→O (0→14), colonnes 1→15 (0→14)
// Attention : "de 1 à 15 de droite à gauche" = colonne 1 = index 14, colonne 15 = index 0
// On garde r=ligne (A=0..O=14), c=colonne (1=0..15=14) pour simplifier l'affichage

/*
  REJOUER (violet) : A8, B2, B14, H1, H15, N2, N14, O8
  X2 (bleu clair)  : D8, E5, E11, H4, H12, K5, K11, L8
  X3 (vert foncé)  : B5, B11, E2, E14, K2, K14, N5, N11
  CENTRE (jaune)   : H8
*/

function letterToRow(l) {
  return l.toUpperCase().charCodeAt(0) - 65; // A=0, B=1...O=14
}

function buildSpecialCases() {
  const m = {};

  const rejouer = ['A8','B2','B14','H1','H15','N2','N14','O8'];
  const doubles  = ['D8','E5','E11','H4','H12','K5','K11','L8'];
  const triples  = ['B5','B11','E2','E14','K2','K14','N5','N11'];
  const centre   = ['H8'];

  function parse(str) {
    const letter = str[0];
    const col    = parseInt(str.slice(1)) - 1; // 1→0 .. 15→14
    const row    = letterToRow(letter);
    return `${row},${col}`;
  }

  rejouer.forEach(s => { m[parse(s)] = 'R'; });
  doubles.forEach(s => { m[parse(s)] = 'D'; });
  triples.forEach(s => { m[parse(s)] = 'T'; });
  centre.forEach(s  => { m[parse(s)] = 'C'; });

  return m;
}

const SPECIAL_CASES = buildSpecialCases();

// ---------- ÉTAT DU JEU ----------
let G = null;

function createGame(players) {
  // Créer le sac
  const sac = [];
  for (const [val, qty] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < qty; i++) {
      sac.push({ val: parseInt(val), isJoker: false });
    }
  }
  sac.push({ val: null, isJoker: true, jokerVal: null });
  sac.push({ val: null, isJoker: true, jokerVal: null });

  shuffle(sac);
  sac.splice(0, 3); // retirer 3 jetons cachés

  const joueurs = players.map((name, i) => ({
    name,
    score: 0,
    hand: [],
    isIA: i > 0
  }));

  // Donner 3 jetons à chaque joueur
  joueurs.forEach(j => {
    j.hand = drawTokens(sac, 3);
  });

  return {
    board: Array.from({ length: 15 }, () => Array(15).fill(null)),
    sac,
    joueurs,
    currentPlayerIndex: 0,
    firstMove: true,
    usedSpecials: new Set(),
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
  for (let i = 0; i < n && sac.length > 0; i++) {
    drawn.push(sac.pop());
  }
  return drawn;
}

function getSpecialType(r, c) {
  const key = `${r},${c}`;
  if (G.usedSpecials.has(key)) return null;
  return SPECIAL_CASES[key] || null;
}

function effectiveVal(t) {
  if (!t) return null;
  if (t.isJoker) return t.jokerVal;
  return t.val;
}

function tokenLabel(t) {
  if (!t) return '';
  if (t.isJoker) return t.jokerVal !== null ? `X(${t.jokerVal})` : 'X';
  return String(t.val);
}

// ---------- LOGIQUE PLATEAU ----------

function boardWithPending() {
  const b = G.board.map(row => row.map(cell => (cell ? { ...cell } : null)));
  for (const p of G.pending) {
    b[p.r][p.c] = { val: p.val, isJoker: p.isJoker, jokerVal: p.jokerVal };
  }
  return b;
}

// Retourne la séquence continue passant par (r,c) dans la direction (dr,dc)
function getLine(board, r, c, dr, dc) {
  // Reculer jusqu'au début
  let sr = r, sc = c;
  while (sr - dr >= 0 && sr - dr < 15 && sc - dc >= 0 && sc - dc < 15
         && board[sr - dr][sc - dc] !== null) {
    sr -= dr; sc -= dc;
  }
  // Avancer jusqu'à la fin
  const line = [];
  let cr = sr, cc = sc;
  while (cr >= 0 && cr < 15 && cc >= 0 && cc < 15 && board[cr][cc] !== null) {
    line.push({ r: cr, c: cc, token: board[cr][cc] });
    cr += dr; cc += dc;
  }
  return line;
}

// Toutes les lignes (≥2 jetons) touchées par les pending
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
    if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && G.board[nr][nc] !== null) {
      return true;
    }
  }
  return false;
}

function wouldCreate2x2(board) {
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

  // Joker: valeur définie ?
  for (const p of G.pending) {
    if (p.isJoker && p.jokerVal === null) {
      return { ok: false, msg: 'Définissez la valeur du joker.' };
    }
  }

  // Tous sur la même ligne ou colonne
  const rows = [...new Set(G.pending.map(p => p.r))];
  const cols = [...new Set(G.pending.map(p => p.c))];
  if (rows.length > 1 && cols.length > 1) {
    return { ok: false, msg: 'Les jetons doivent être sur la même ligne ou colonne.' };
  }

  // Premier coup : doit couvrir H8 (r=7, c=7)
  if (G.firstMove) {
    if (!G.pending.some(p => p.r === 7 && p.c === 7)) {
      return { ok: false, msg: 'Le premier jeton doit couvrir la case centrale H8.' };
    }
  } else {
    // Au moins un adjacent à un jeton existant
    if (!G.pending.some(p => isAdjacentToExisting(p.r, p.c))) {
      return { ok: false, msg: 'Les jetons doivent être adjacents à un jeton déjà posé.' };
    }
  }

  // Vérifier les séquences
  const vBoard = boardWithPending();
  const lines  = getAffectedLines();

  for (const line of lines) {
    if (line.length > 3) {
      return { ok: false, msg: 'Maximum 3 jetons côte à côte dans un même sens.' };
    }
    const vals = line.map(l => effectiveVal(l.token));
    if (vals.some(v => v === null)) {
      return { ok: false, msg: 'La valeur du joker doit être définie.' };
    }
    const sum = vals.reduce((a, b) => a + b, 0);
    if (line.length === 2 && sum > 15) {
      return { ok: false, msg: `2 jetons côte à côte : total ${sum} > 15.` };
    }
    if (line.length === 3 && sum !== 15) {
      return { ok: false, msg: `3 jetons côte à côte : total ${sum} ≠ 15 (Trio obligatoire).` };
    }
  }

  // Pas de carré 2×2
  if (wouldCreate2x2(vBoard)) {
    return { ok: false, msg: 'Ce placement formerait un carré interdit.' };
  }

  // Pas 2 jokers au même tour
  if (G.pending.filter(p => p.isJoker).length >= 2) {
    return { ok: false, msg: 'Interdit de poser 2 jokers au même tour.' };
  }

  return { ok: true };
}

// ---------- CALCUL DES POINTS ----------

function calculateScore() {
  let total = 0;
  const lines          = getAffectedLines();
  const hasJoker       = G.pending.some(p => p.isJoker);
  const allThreePending = G.pending.length === 3;
  let   trioletDone    = false;

  for (const line of lines) {
    const vals  = line.map(l => effectiveVal(l.token));
    const sum   = vals.reduce((a, b) => a + b, 0);
    const isPendingLine = line.every(l => G.pending.some(p => p.r === l.r && p.c === l.c));

    // Chercher une case spéciale parmi les pending de cette ligne
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
      // Trio = 30 × multiplier
      let pts = 30 * multiplier;

      // Triolet : les 3 jetons sont TOUS nouveaux (pending), pas de joker
      if (allThreePending && !trioletDone && isPendingLine && !hasJoker) {
        pts += 50;
        trioletDone = true;
        log(`🎉 TRIOLET ! 30×${multiplier}=${30*multiplier} + 50 bonus = ${pts} pts`, 'good');
      } else {
        log(`✅ Trio = 30×${multiplier} = ${30*multiplier} pts`, 'good');
      }

      if (specialUsedKey) G.usedSpecials.add(specialUsedKey);
      total += pts;

    } else if (line.length === 2) {
      // Paire : somme des valeurs (avec case spéciale sur le jeton posé)
      let pts = 0;
      for (const item of line) {
        const isNew = G.pending.some(p => p.r === item.r && p.c === item.c);
        const v     = effectiveVal(item.token);
        if (isNew) {
          const sp = getSpecialType(item.r, item.c);
          if (sp === 'D' || sp === 'C') {
            pts += v * 2;
            G.usedSpecials.add(`${item.r},${item.c}`);
          } else if (sp === 'T') {
            pts += v * 3;
            G.usedSpecials.add(`${item.r},${item.c}`);
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

  // Case Rejouer ?
  for (const p of G.pending) {
    if (getSpecialType(p.r, p.c) === 'R') {
      G.rejouerFlag = true;
      G.usedSpecials.add(`${p.r},${p.c}`);
      log('🔁 Case Rejouer ! Vous rejouez immédiatement.', 'good');
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

  // ── Fixer les jetons sur le plateau ──
  // IMPORTANT : trier par index décroissant avant de splice pour ne pas décaler
  const sortedPending = [...G.pending].sort((a, b) => b.tokenIndex - a.tokenIndex);

  for (const p of G.pending) {
    G.board[p.r][p.c] = {
      val:      p.val,
      isJoker:  p.isJoker,
      jokerVal: p.jokerVal
    };
  }

  // Retirer les jetons de la main (indices décroissants pour ne pas décaler)
  for (const p of sortedPending) {
    player.hand.splice(p.tokenIndex, 1);
  }

  // Repioche exactement autant que posé
  const nbPosed = G.pending.length;
  const drawn   = drawTokens(G.sac, nbPosed);
  player.hand.push(...drawn);

  // Vérifier que le chevalet a bien 3 jetons (ou moins si sac vide)
  const expected = Math.min(3, player.hand.length + G.sac.length);

  G.pending            = [];
  G.selectedTokenIndex = null;
  G.firstMove          = false;

  if (checkEndGame()) return;

  if (G.rejouerFlag) {
    G.rejouerFlag = false;
    render();
    return; // le même joueur rejoue
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
  if (G.joueurs[G.currentPlayerIndex].isIA) {
    setTimeout(iaPlay, 900);
  }
}

function checkEndGame() {
  const player = G.joueurs[G.currentPlayerIndex];

  // Fin : sac vide ET joueur actuel a posé son dernier jeton
  if (G.sac.length === 0 && player.hand.length === 0) {
    let bonus = 0;
    G.joueurs.forEach((j, i) => {
      if (i !== G.currentPlayerIndex) {
        const sum = j.hand.reduce((a, t) => a + (effectiveVal(t) || 0), 0);
        bonus += sum;
        log(`${j.name} a ${j.hand.map(t => effectiveVal(t)).join('+')} = ${sum} pts perdus`, 'bad');
      }
    });
    player.score += bonus;
    log(`🏆 ${player.name} remporte ${bonus} pts bonus de fin !`, 'good');
    G.gameOver = true;
    setTimeout(showFinModal, 600);
    return true;
  }

  // Cas : tout le monde bloqué
  const allBlocked = G.joueurs.every(j => j.hand.length === 0);
  if (allBlocked) {
    G.gameOver = true;
    setTimeout(showFinModal, 600);
    return true;
  }

  return false;
}

function showFinModal() {
  const sorted = [...G.joueurs].sort((a, b) => b.score - a.score);
  document.getElementById('fin-winner').textContent = `🥇 ${sorted[0].name} gagne !`;
  const div = document.getElementById('fin-scores');
  div.innerHTML = sorted.map((j, i) =>
    `<div>${['🥇','🥈','🥉','4️⃣'][i]} ${j.name} : ${j.score} pts</div>`
  ).join('');
  document.getElementById('modal-fin').classList.add('active');
}

// ---------- IA SIMPLE ----------

function iaPlay() {
  const player = G.joueurs[G.currentPlayerIndex];
  if (player.hand.length === 0) { nextPlayer(); return; }

  let bestMove = null;
  let bestPts  = -1;

  // Essayer chaque jeton de la main sur chaque case valide
  for (let hi = 0; hi < player.hand.length; hi++) {
    const token = player.hand[hi];
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (G.board[r][c] !== null) continue;
        if (G.firstMove && !(r === 7 && c === 7)) continue;
        if (!G.firstMove && !isAdjacentToExisting(r, c)) continue;

        const jokerVal = token.isJoker ? 7 : null;

        G.pending = [{
          tokenIndex: hi,
          r, c,
          val:      token.val,
          isJoker:  token.isJoker,
          jokerVal: jokerVal
        }];

        const check = validatePlacement();
        if (check.ok) {
          const pts = calculateScore();
          if (pts > bestPts) {
            bestPts  = pts;
            bestMove = { hi, r, c, token, jokerVal };
          }
        }
        G.pending = [];
      }
    }
  }

  if (bestMove) {
    const { hi, r, c, token, jokerVal } = bestMove;
    G.pending = [{
      tokenIndex: hi,
      r, c,
      val:      token.val,
      isJoker:  token.isJoker,
      jokerVal: jokerVal
    }];

    const pts = calculateScore();
    player.score += pts;
    log(`🤖 ${player.name} joue ${token.isJoker ? 'X' : token.val} en ${String.fromCharCode(65+r)}${c+1} → ${pts} pts`, 'info');

    G.board[r][c] = { val: token.val, isJoker: token.isJoker, jokerVal };
    player.hand.splice(hi, 1);

    // Repioche exactement 1 jeton
    const drawn = drawTokens(G.sac, 1);
    player.hand.push(...drawn);

    G.pending            = [];
    G.firstMove          = false;

    if (!checkEndGame()) nextPlayer();
  } else {
    // IA passe : échange si possible
    if (G.sac.length >= 5 && player.hand.length > 0) {
      const t = player.hand.pop();
      G.sac.unshift(t);
      shuffle(G.sac);
      const drawn = drawTokens(G.sac, 1);
      player.hand.push(...drawn);
      log(`🤖 ${player.name} échange un jeton.`, 'info');
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

      // Label case vide
      if (!G.board[r][c] && !G.pending.some(p => p.r === r && p.c === c)) {
        if (!used && sp) {
          if (sp === 'R') cell.textContent = '↺';
          else if (sp === 'D' || sp === 'C') cell.textContent = '×2';
          else if (sp === 'T') cell.textContent = '×3';
        }
      }

      // Jeton posé sur le plateau
      if (G.board[r][c]) {
        const t   = G.board[r][c];
        const tok = document.createElement('div');
        tok.className = 'token' + (t.isJoker ? ' joker-token' : '');
        tok.textContent = t.isJoker
          ? (t.jokerVal !== null ? `X` : 'X')
          : t.val;
        if (t.isJoker) tok.title = `Joker = ${t.jokerVal}`;
        cell.appendChild(tok);
      }

      // Jeton pending (en cours de placement)
      const pend = G.pending.find(p => p.r === r && p.c === c);
      if (pend) {
        cell.innerHTML = '';
        const tok = document.createElement('div');
        tok.className = 'token pending-on-board' + (pend.isJoker ? ' joker-token' : '');
        tok.textContent = pend.isJoker ? `X(${pend.jokerVal})` : pend.val;
        cell.appendChild(tok);
      }

      // Surbrillance cases valides
      if (G.selectedTokenIndex !== null && !G.board[r][c] && !pend) {
        if (G.firstMove) {
          if (r === 7 && c === 7) cell.classList.add('highlight');
        } else {
          if (isAdjacentToExisting(r, c)) cell.classList.add('highlight');
        }
      }

      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
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

function renderChevalet() {
  const player = G.joueurs[0]; // toujours le joueur humain
  const cont   = document.getElementById('chevalet');
  cont.innerHTML = '';

  player.hand.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'hand-token' + (t.isJoker ? ' joker' : '');
    if (G.selectedTokenIndex === i) div.classList.add('selected');
    div.textContent = t.isJoker ? 'X' : t.val;
    div.title = t.isJoker ? 'Joker' : `Valeur : ${t.val}`;
    div.addEventListener('click', () => onSelectToken(i));
    cont.appendChild(div);
  });

  // Afficher le nombre de jetons (debug)
  const info = document.createElement('div');
  info.style.cssText = 'font-size:0.7rem;color:#aaa;width:100%;margin-top:4px;';
  info.textContent = `${player.hand.length} jeton(s)`;
  cont.appendChild(info);
}

function renderPending() {
  const cont = document.getElementById('pending-tokens');
  cont.innerHTML = '';
  G.pending.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'pending-token' + (p.isJoker ? ' joker' : '');
    div.textContent = p.isJoker ? `X(${p.jokerVal ?? '?'})` : p.val;
    div.title = `Annuler : ${String.fromCharCode(65+p.r)}${p.c+1}`;
    div.addEventListener('click', () => removePending(i));
    cont.appendChild(div);
  });
}

function removePending(i) {
  G.pending.splice(i, 1);
  render();
}

// ---------- INTERACTIONS ----------

function onSelectToken(index) {
  if (G.gameOver) return;
  if (G.joueurs[G.currentPlayerIndex].isIA) return;

  // Déjà dans pending ?
  const alreadyPlaced = G.pending.some(p => p.tokenIndex === index);
  if (alreadyPlaced) return;

  G.selectedTokenIndex = (G.selectedTokenIndex === index) ? null : index;
  render();
}

function onCellClick(r, c) {
  if (G.gameOver) return;
  if (G.joueurs[G.currentPlayerIndex].isIA) return;
  if (G.selectedTokenIndex === null) return;
  if (G.board[r][c] !== null) return;
  if (G.pending.some(p => p.r === r && p.c === c)) return;

  const player = G.joueurs[0];
  const token  = player.hand[G.selectedTokenIndex];

  if (token.isJoker) {
    openJokerModal(r, c);
    return;
  }

  G.pending.push({
    tokenIndex: G.selectedTokenIndex,
    r, c,
    val:      token.val,
    isJoker:  false,
    jokerVal: null
  });

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
    r:        jokerPos.r,
    c:        jokerPos.c,
    val:      null,
    isJoker:  true,
    jokerVal: val
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
    log('❌ Sélectionnez au moins un jeton à échanger.', 'bad');
    return;
  }
  if (G.sac.length < 5) {
    log('❌ Il faut au moins 5 jetons dans le sac pour échanger.', 'bad');
    document.getElementById('modal-echange').classList.remove('active');
    return;
  }

  const player  = G.joueurs[0];
  const sorted  = [...echangeSelected].sort((a, b) => b - a);
  const removed = sorted.map(i => player.hand.splice(i, 1)[0]);

  // Remettre dans le sac et mélanger
  G.sac.push(...removed);
  shuffle(G.sac);

  // Repioche le même nombre
  const drawn = drawTokens(G.sac, removed.length);
  player.hand.push(...drawn);

  log(`🔄 ${player.name} échange ${removed.length} jeton(s).`, 'info');
  document.getElementById('modal-echange').classList.remove('active');
  nextPlayer();
});

document.getElementById('btn-echange-cancel').addEventListener('click', () => {
  document.getElementById('modal-echange').classList.remove('active');
});

// ---------- BOUTONS PRINCIPAUX ----------

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

