// ============================================================
//  TRIOLET ONLINE – index.js
//  Jeu complet solo (vs IA simple) + structure multi-joueur
// ============================================================

// ---------- CONSTANTES ----------

// Distribution des jetons (valeur: quantité)
const DISTRIBUTION = {
  0:9, 1:9, 2:8, 3:8, 4:7, 5:8, 6:6,
  7:6, 8:4, 9:4, 10:3, 11:3, 12:2, 13:2, 14:1, 15:1
};
// 2 jokers en plus → total 83 jetons, on en retire 3 → 80 en jeu

// Cases spéciales sur le plateau 15x15
// 'D' = double, 'T' = triple, 'R' = rejouer, 'C' = centre (double)
const SPECIAL_CASES = (() => {
  const m = {};
  const center = { r: 7, c: 7, type: 'C' };

  // Cases doubles (x2) - positions approximatives du jeu réel
  const doubles = [
    [0,4],[0,10],[1,1],[1,13],[4,0],[4,14],
    [10,0],[10,14],[13,1],[13,13],[14,4],[14,10],
    [3,7],[7,3],[7,11],[11,7]
  ];
  // Cases triples (x3)
  const triples = [
    [0,7],[7,0],[7,14],[14,7],
    [2,4],[2,10],[4,2],[4,12],
    [10,2],[10,12],[12,4],[12,10]
  ];
  // Cases rejouer
  const rejouer = [
    [0,0],[0,14],[14,0],[14,14],
    [3,3],[3,11],[11,3],[11,11],
    [7,7] // sera écrasé par centre
  ];

  doubles.forEach(([r,c]) => { m[`${r},${c}`] = 'D'; });
  triples.forEach(([r,c]) => { m[`${r},${c}`] = 'T'; });
  rejouer.forEach(([r,c]) => { m[`${r},${c}`] = 'R'; });
  m['7,7'] = 'C'; // centre = double
  return m;
})();

// ---------- ÉTAT DU JEU ----------
let G = null;   // état global

function createGame(players) {
  // Crée le sac
  const sac = [];
  for (const [val, qty] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < qty; i++) sac.push({ val: parseInt(val), isJoker: false });
  }
  sac.push({ val: null, isJoker: true, jokerVal: null });
  sac.push({ val: null, isJoker: true, jokerVal: null });
  // Retirer 3 jetons cachés
  shuffle(sac);
  sac.splice(0, 3);

  // Joueurs
  const joueurs = players.map((name, i) => ({
    name,
    score: 0,
    hand: [],
    isIA: i > 0 // premier joueur = humain, les autres = IA (en solo)
  }));

  // Distribution initiale (3 jetons chacun)
  joueurs.forEach(j => { j.hand = drawTokens(sac, 3); });

  return {
    board: Array.from({ length: 15 }, () => Array(15).fill(null)),
    // board[r][c] = null | { val, isJoker, jokerVal, usedSpecial }
    sac,
    joueurs,
    currentPlayerIndex: 0,
    firstMove: true,
    usedSpecials: new Set(), // cases spéciales déjà utilisées
    pending: [],   // jetons en cours de placement { tokenIndex, r, c, val, isJoker, jokerVal }
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

function getSpecial(r, c) {
  const key = `${r},${c}`;
  if (G.usedSpecials.has(key)) return null;
  return SPECIAL_CASES[key] || null;
}

function tokenDisplay(t) {
  if (!t) return '';
  if (t.isJoker) return t.jokerVal !== null ? `X(${t.jokerVal})` : 'X';
  return String(t.val);
}

function effectiveVal(t) {
  if (!t) return null;
  if (t.isJoker) return t.jokerVal;
  return t.val;
}

// ---------- VALIDATION DES COUPS ----------

// Retourne toutes les "lignes" (séquences de jetons adjacents) affectées par les positions pending
function getAffectedLines() {
  // On reconstitue le plateau virtuel avec les pending
  const vBoard = boardWithPending();
  const lines = [];
  const seen = new Set();

  for (const p of G.pending) {
    // Ligne horizontale
    const hKey = `H${p.r}`;
    if (!seen.has(hKey)) {
      seen.add(hKey);
      const line = getLineAt(vBoard, p.r, p.c, 0, 1);
      if (line.length >= 2) lines.push(line);
    }
    // Ligne verticale
    const vKey = `V${p.c}`;
    if (!seen.has(vKey)) {
      seen.add(vKey);
      const line = getLineAt(vBoard, p.r, p.c, 1, 0);
      if (line.length >= 2) lines.push(line);
    }
  }
  return lines;
}

function boardWithPending() {
  const b = G.board.map(row => row.map(cell => cell ? { ...cell } : null));
  for (const p of G.pending) {
    b[p.r][p.c] = { val: p.val, isJoker: p.isJoker, jokerVal: p.jokerVal };
  }
  return b;
}

// Retourne la séquence continue de jetons passant par (r,c) dans la direction (dr,dc)
function getLineAt(board, r, c, dr, dc) {
  // Trouver le début
  let sr = r - dr, sc = c - dc;
  while (sr >= 0 && sr < 15 && sc >= 0 && sc < 15 && board[sr][sc]) {
    sr -= dr; sc -= dc;
  }
  sr += dr; sc += dc;

  const line = [];
  let cr = sr, cc = sc;
  while (cr >= 0 && cr < 15 && cc >= 0 && cc < 15 && board[cr][cc]) {
    line.push({ r: cr, c: cc, token: board[cr][cc] });
    cr += dr; cc += dc;
  }
  return line;
}

function validatePlacement() {
  if (G.pending.length === 0) return { ok: false, msg: 'Aucun jeton à placer.' };
  if (G.pending.length > 3)   return { ok: false, msg: 'Maximum 3 jetons par tour.' };

  const vBoard = boardWithPending();

  // Vérifier que tous les pending sont sur la même ligne (H ou V)
  const rows = [...new Set(G.pending.map(p => p.r))];
  const cols = [...new Set(G.pending.map(p => p.c))];
  if (rows.length > 1 && cols.length > 1) {
    return { ok: false, msg: 'Les jetons doivent être sur la même ligne ou colonne.' };
  }

  // Premier coup : doit couvrir la case centrale
  if (G.firstMove) {
    const coversCentre = G.pending.some(p => p.r === 7 && p.c === 7);
    if (!coversCentre) return { ok: false, msg: 'Le premier jeton doit couvrir la case centrale.' };
    if (G.pending.length > 1) {
      // Pas de carré au premier tour (déjà garanti car on pose sur une ligne)
    }
  } else {
    // Au moins un jeton adjacent à un jeton existant sur le plateau (non pending)
    const adjacentToExisting = G.pending.some(p => isAdjacentToExisting(p.r, p.c));
    if (!adjacentToExisting) {
      return { ok: false, msg: 'Les jetons doivent être adjacents à un jeton déjà en place.' };
    }
  }

  // Vérifier les séquences créées
  const lines = getAffectedLines();

  for (const line of lines) {
    if (line.length > 3) return { ok: false, msg: 'Maximum 3 jetons côte à côte.' };
    const vals = line.map(l => effectiveVal(l.token));
    if (vals.some(v => v === null)) return { ok: false, msg: 'La valeur du joker doit être définie.' };

    const sum = vals.reduce((a, b) => a + b, 0);
    if (line.length === 2 && sum > 15) return { ok: false, msg: `Total de 2 jetons > 15 (${sum}).` };
    if (line.length === 3 && sum !== 15) return { ok: false, msg: `Un Trio de 3 jetons doit faire exactement 15 (actuellement ${sum}).` };
  }

  // Vérifier pas de carré 3x3 bloquant (simplifié : pas de carré 2x2)
  if (wouldCreate2x2(vBoard)) {
    return { ok: false, msg: 'Ce placement créerait un carré interdit.' };
  }

  // Vérifier qu'on ne pose pas 2 jokers au même tour
  const jokerCount = G.pending.filter(p => p.isJoker).length;
  if (jokerCount >= 2) return { ok: false, msg: 'Interdit de poser 2 jokers au même tour.' };

  return { ok: true };
}

function isAdjacentToExisting(r, c) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15) {
      if (G.board[nr][nc] !== null) return true;
    }
  }
  return false;
}

function wouldCreate2x2(board) {
  for (let r = 0; r < 14; r++) {
    for (let c = 0; c < 14; c++) {
      if (board[r][c] && board[r+1][c] && board[r][c+1] && board[r+1][c+1]) {
        // Vérifier si c'est nouveau (au moins une case pending)
        const pendingInSquare = G.pending.some(p =>
          (p.r === r || p.r === r+1) && (p.c === c || p.c === c+1)
        );
        if (pendingInSquare) return true;
      }
    }
  }
  return false;
}

// ---------- CALCUL DES POINTS ----------

function calculateScore() {
  let total = 0;
  const lines = getAffectedLines();
  let isTriolet = G.pending.length === 3;
  let hasJokerInPending = G.pending.some(p => p.isJoker);

  // Vérifier si c'est un Triolet (les 3 jetons du chevalet posés formant un trio)
  // Les 3 pending doivent tous être en ligne ET former un trio
  let trioletApplied = false;

  for (const line of lines) {
    const vals = line.map(l => effectiveVal(l.token));
    const sum  = vals.reduce((a, b) => a + b, 0);

    // Trouver s'il y a une case spéciale dans cette ligne parmi les pending
    let multiplier = 1;
    let specialUsedKey = null;

    for (const p of G.pending) {
      if (line.some(l => l.r === p.r && l.c === p.c)) {
        const sp = getSpecial(p.r, p.c);
        if (sp === 'D' || sp === 'C') { multiplier = 2; specialUsedKey = `${p.r},${p.c}`; break; }
        if (sp === 'T')               { multiplier = 3; specialUsedKey = `${p.r},${p.c}`; break; }
      }
    }

    if (line.length === 3 && sum === 15) {
      // Trio = 30 points (× multiplier)
      let pts = 30 * multiplier;
      // Triolet bonus si les 3 jetons sont tous nouveaux (tous pending) ET pas de joker
      if (
        isTriolet &&
        !trioletApplied &&
        line.every(l => G.pending.some(p => p.r === l.r && p.c === l.c)) &&
        !hasJokerInPending
      ) {
        pts += 50;
        trioletApplied = true;
        log(`🎉 TRIOLET ! Trio × ${multiplier} = ${30 * multiplier} + bonus 50`, 'good');
      } else {
        log(`✅ Trio = 30 × ${multiplier} = ${30 * multiplier} pts`, 'good');
      }
      total += pts;
      if (specialUsedKey) G.usedSpecials.add(specialUsedKey);
    } else if (line.length === 2) {
      // Paire : valeur de la case spéciale sur le jeton posé
      let pts = 0;
      for (const item of line) {
        const isNew = G.pending.some(p => p.r === item.r && p.c === item.c);
        if (isNew) {
          const sp = getSpecial(item.r, item.c);
          let v = effectiveVal(item.token);
          if (sp === 'D' || sp === 'C') { pts += v * 2; G.usedSpecials.add(`${item.r},${item.c}`); }
          else if (sp === 'T')          { pts += v * 3; G.usedSpecials.add(`${item.r},${item.c}`); }
          else pts += v;
        } else {
          pts += effectiveVal(item.token);
        }
      }
      log(`➕ Paire = ${pts} pts`, 'info');
      total += pts;
    }
  }

  // Case Rejouer ?
  const rejouerCell = G.pending.find(p => {
    const sp = getSpecial(p.r, p.c);
    return sp === 'R';
  });
  if (rejouerCell) {
    G.rejouerFlag = true;
    G.usedSpecials.add(`${rejouerCell.r},${rejouerCell.c}`);
    log('🔁 Case Rejouer ! Vous rejouez.', 'good');
  }

  return total;
}

// ---------- ACTIONS DU JEU ----------

function confirmMove() {
  const check = validatePlacement();
  if (!check.ok) { log('❌ ' + check.msg, 'bad'); return; }

  const pts = calculateScore();
  const player = G.joueurs[G.currentPlayerIndex];
  player.score += pts;
  log(`${player.name} marque ${pts} points. Total : ${player.score}`, 'good');

  // Fixer les jetons sur le plateau
  for (const p of G.pending) {
    G.board[p.r][p.c] = {
      val: p.val,
      isJoker: p.isJoker,
      jokerVal: p.jokerVal
    };
    // Retirer de la main
    player.hand.splice(p.tokenIndex, 1);
  }

  // Repioche
  const drawn = drawTokens(G.sac, G.pending.length);
  player.hand.push(...drawn);

  G.pending = [];
  G.selectedTokenIndex = null;
  G.firstMove = false;

  // Vérifier fin de partie
  if (checkEndGame()) return;

  if (G.rejouerFlag) {
    G.rejouerFlag = false;
    render();
    if (player.isIA) setTimeout(iaPlay, 800);
    return;
  }

  nextPlayer();
}

function cancelMove() {
  G.pending = [];
  G.selectedTokenIndex = null;
  render();
}

function nextPlayer() {
  G.currentPlayerIndex = (G.currentPlayerIndex + 1) % G.joueurs.length;
  render();
  const current = G.joueurs[G.currentPlayerIndex];
  if (current.isIA) {
    setTimeout(iaPlay, 900);
  }
}

function checkEndGame() {
  const player = G.joueurs[G.currentPlayerIndex];
  // Fin si sac vide et un joueur n'a plus de jetons
  if (G.sac.length === 0 && player.hand.length === 0) {
    // Bonus : le joueur sans jeton gagne les valeurs des adversaires
    let bonus = 0;
    G.joueurs.forEach((j, i) => {
      if (i !== G.currentPlayerIndex) {
        const sum = j.hand.reduce((a, t) => a + (effectiveVal(t) || 0), 0);
        bonus += sum;
      }
    });
    player.score += bonus;
    G.gameOver = true;
    showFinModal();
    return true;
  }

  // Cas : tous bloqués
  const allBlocked = G.joueurs.every(j => j.hand.length === 0);
  if (allBlocked) {
    G.gameOver = true;
    showFinModal();
    return true;
  }
  return false;
}

function showFinModal() {
  const sorted = [...G.joueurs].sort((a, b) => b.score - a.score);
  document.getElementById('fin-winner').textContent = `🥇 ${sorted[0].name} gagne !`;
  const scoresDiv = document.getElementById('fin-scores');
  scoresDiv.innerHTML = sorted.map((j, i) =>
    `<div>${['🥇','🥈','🥉','4️⃣'][i]} ${j.name} : ${j.score} pts</div>`
  ).join('');
  document.getElementById('modal-fin').classList.add('active');
}

// ---------- IA SIMPLE ----------

function iaPlay() {
  const player = G.joueurs[G.currentPlayerIndex];
  if (player.hand.length === 0) { nextPlayer(); return; }

  // Essayer de trouver un coup valide simple : poser 1 jeton adjacent
  let moveMade = false;

  for (let hi = 0; hi < player.hand.length && !moveMade; hi++) {
    const token = player.hand[hi];
    for (let r = 0; r < 15 && !moveMade; r++) {
      for (let c = 0; c < 15 && !moveMade; c++) {
        if (G.board[r][c] !== null) continue;
        if (!G.firstMove && !isAdjacentToExisting(r, c)) continue;
        if (G.firstMove && !(r === 7 && c === 7)) continue;

        // Tester le placement
        G.pending = [{
          tokenIndex: hi,
          r, c,
          val: token.val,
          isJoker: token.isJoker,
          jokerVal: token.isJoker ? 7 : token.jokerVal
        }];

        const check = validatePlacement();
        if (check.ok) {
          const pts = calculateScore();
          player.score += pts;
          log(`🤖 ${player.name} place un jeton (${tokenDisplay(token)}) en ${String.fromCharCode(65+r)}${c+1} → ${pts} pts`, 'info');

          G.board[r][c] = {
            val: token.val,
            isJoker: token.isJoker,
            jokerVal: token.isJoker ? 7 : null
          };
          player.hand.splice(hi, 1);
          const drawn = drawTokens(G.sac, 1);
          player.hand.push(...drawn);
          G.pending = [];
          G.firstMove = false;
          moveMade = true;
        } else {
          G.pending = [];
        }
      }
    }
  }

  if (!moveMade) {
    log(`🤖 ${player.name} passe son tour.`, 'info');
  }

  if (!checkEndGame()) nextPlayer();
}

// ---------- RENDU ----------

function render() {
  renderBoard();
  renderScores();
  renderChevalet();
  renderPending();
  updateSacCount();
  updateCurrentPlayer();
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';

      const sp = SPECIAL_CASES[`${r},${c}`];
      const used = G.usedSpecials.has(`${r},${c}`);

      if (!used && sp === 'D') cell.classList.add('double');
      if (!used && sp === 'T') cell.classList.add('triple');
      if (!used && sp === 'R') cell.classList.add('rejouer');
      if (!used && sp === 'C') cell.classList.add('center');

      // Label de la case spéciale
      if (!used && sp && !G.board[r][c]) {
        cell.textContent = sp === 'D' || sp === 'C' ? '×2' : sp === 'T' ? '×3' : '↺';
      }

      // Jeton sur le plateau
      if (G.board[r][c]) {
        const t = G.board[r][c];
        const tok = document.createElement('div');
        tok.className = 'token' + (t.isJoker ? ' joker-token' : '');
        tok.textContent = t.isJoker ? `X` : t.val;
        if (t.isJoker && t.jokerVal !== null) {
          tok.title = `Joker = ${t.jokerVal}`;
        }
        cell.appendChild(tok);
      }

      // Jeton pending sur cette case ?
      const pend = G.pending.find(p => p.r === r && p.c === c);
      if (pend) {
        cell.innerHTML = '';
        const tok = document.createElement('div');
        tok.className = 'token' + (pend.isJoker ? ' joker-token' : '');
        tok.textContent = pend.isJoker ? `X(${pend.jokerVal})` : pend.val;
        tok.style.border = '2px solid #00c9a7';
        cell.appendChild(tok);
        cell.classList.add('selected-cell');
      }

      // Highlight cases valides si un jeton est sélectionné
      if (G.selectedTokenIndex !== null && !G.board[r][c] && !pend) {
        if (G.firstMove) {
          if (r === 7 && c === 7) cell.classList.add('highlight');
        } else {
          if (isAdjacentToExisting(r, c)) cell.classList.add('highlight');
        }
      }

      cell.addEventListener('click', () => onCellClick(r, c));
      board.appendChild(cell);
    }
  }
}

function renderScores() {
  const cont = document.getElementById('scores-container');
  cont.innerHTML = G.joueurs.map(j =>
    `<div class="score-row">
      <span>${j.isIA ? '🤖 ' : '👤 '}${j.name}</span>
      <span class="pts">${j.score}</span>
    </div>`
  ).join('');
}

function renderChevalet() {
  const player = G.joueurs[0]; // Toujours le joueur humain
  const cont = document.getElementById('chevalet');
  cont.innerHTML = '';

  player.hand.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'hand-token' + (t.isJoker ? ' joker' : '');
    if (G.selectedTokenIndex === i) div.classList.add('selected');
    div.textContent = t.isJoker ? 'X' : t.val;
    div.addEventListener('click', () => onSelectToken(i));
    cont.appendChild(div);
  });
}

function renderPending() {
  const cont = document.getElementById('pending-tokens');
  cont.innerHTML = '';
  G.pending.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'pending-token' + (p.isJoker ? ' joker' : '');
    div.textContent = p.isJoker ? `X(${p.jokerVal ?? '?'})` : p.val;
    div.title = `Cliquez pour annuler ce placement (${String.fromCharCode(65+p.r)}${p.c+1})`;
    div.addEventListener('click', () => removePending(i));
    cont.appendChild(div);
  });
}

function updateSacCount() {
  document.getElementById('sac-count').textContent = G.sac.length;
}

function updateCurrentPlayer() {
  const p = G.joueurs[G.currentPlayerIndex];
  document.getElementById('current-player-name').textContent =
    (p.isIA ? '🤖 ' : '👤 ') + p.name;
}

// ---------- INTERACTIONS ----------

function onSelectToken(index) {
  if (G.gameOver) return;
  if (G.joueurs[G.currentPlayerIndex].isIA) return;
  if (G.selectedTokenIndex === index) {
    G.selectedTokenIndex = null;
  } else {
    G.selectedTokenIndex = index;
  }
  render();
}

function onCellClick(r, c) {
  if (G.gameOver) return;
  if (G.joueurs[G.currentPlayerIndex].isIA) return;
  if (G.selectedTokenIndex === null) return;
  if (G.board[r][c] !== null) return;
  if (G.pending.some(p => p.r === r && p.c === c)) return;

  const player = G.joueurs[0];
  const token = player.hand[G.selectedTokenIndex];

  if (token.isJoker) {
    // Ouvrir modal joker
    openJokerModal(r, c);
    return;
  }

  G.pending.push({
    tokenIndex: G.selectedTokenIndex,
    r, c,
    val: token.val,
    isJoker: false,
    jokerVal: null
  });

  G.selectedTokenIndex = null;
  render();
}

function removePending(pendingIndex) {
  G.pending.splice(pendingIndex, 1);
  render();
}

// ---------- MODAL JOKER ----------

let jokerPendingPos = null;

function openJokerModal(r, c) {
  jokerPendingPos = { r, c };
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
  if (jokerPendingPos === null) return;

  const { r, c } = jokerPendingPos;
  const token = G.joueurs[0].hand[G.selectedTokenIndex];

  G.pending.push({
    tokenIndex: G.selectedTokenIndex,
    r, c,
    val: null,
    isJoker: true,
    jokerVal: val
  });

  jokerPendingPos = null;
  G.selectedTokenIndex = null;
  render();
}

document.getElementById('btn-joker-cancel').addEventListener('click', () => {
  document.getElementById('modal-joker').classList.remove('active');
  jokerPendingPos = null;
});

// ---------- MODAL ÉCHANGE ----------

let echangeSelected = [];

function openEchangeModal() {
  echangeSelected = [];
  const player = G.joueurs[0];
  const cont = document.getElementById('echange-chevalet');
  cont.innerHTML = '';
  player.hand.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'hand-token' + (t.isJoker ? ' joker' : '');
    div.textContent = t.isJoker ? 'X' : t.val;
    div.style.margin = '4px';
    div.addEventListener('click', () => {
      const idx = echangeSelected.indexOf(i);
      if (idx === -1) {
        if (echangeSelected.length < 3) {
          echangeSelected.push(i);
          div.classList.add('selected');
        }
      } else {
        echangeSelected.splice(idx, 1);
        div.classList.remove('selected');
      }
    });
    cont.appendChild(div);
  });
  document.getElementById('modal-echange').classList.add('active');
}

document.getElementById('btn-echange-confirm').addEventListener('click', () => {
  if (echangeSelected.length === 0) return;
  if (G.sac.length < 5) {
    log('❌ Il faut au moins 5 jetons dans le sac pour échanger.', 'bad');
    document.getElementById('modal-echange').classList.remove('active');
    return;
  }

  const player = G.joueurs[0];
  // Remettre les jetons dans le sac
  const toReturn = echangeSelected.sort((a, b) => b - a).map(i => {
    const t = player.hand.splice(i, 1)[0];
    return t;
  });
  G.sac.unshift(...toReturn);
  shuffle(G.sac);

  // Piocher
  const drawn = drawTokens(G.sac, toReturn.length);
  player.hand.push(...drawn);

  log(`🔄 ${player.name} échange ${toReturn.length} jeton(s).`, 'info');
  document.getElementById('modal-echange').classList.remove('active');
  nextPlayer();
});

document.getElementById('btn-echange-cancel').addEventListener('click', () => {
  document.getElementById('modal-echange').classList.remove('active');
});

// ---------- BOUTONS ----------

document.getElementById('btn-valider').addEventListener('click', () => {
  if (G.joueurs[G.currentPlayerIndex].isIA) return;
  confirmMove();
});

document.getElementById('btn-annuler-coup').addEventListener('click', cancelMove);

document.getElementById('btn-echanger').addEventListener('click', () => {
  if (G.joueurs[G.currentPlayerIndex].isIA) return;
  if (G.pending.length > 0) {
    log('❌ Annulez vos placements avant d\'échanger.', 'bad');
    return;
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
  startGame(['Vous', 'IA']);
});

// ---------- DÉMARRAGE ----------

function startGame(players) {
  G = createGame(players);
  document.getElementById('screen-lobby').style.display = 'none';
  document.getElementById('screen-game').style.display = 'block';
  document.getElementById('message-log').innerHTML = '';
  log('🎮 Nouvelle partie ! Bon jeu !', 'good');
  render();
}

// Bouton solo
document.getElementById('btn-solo').addEventListener('click', () => {
  const pseudo = document.getElementById('input-pseudo').value.trim() || 'Joueur';
  startGame([pseudo, 'IA']);
});

// Bouton créer salon (pour l'instant lance aussi une partie solo)
document.getElementById('btn-creer-salon').addEventListener('click', () => {
  const pseudo = document.getElementById('input-pseudo').value.trim() || 'Joueur';
  const salonName = document.getElementById('input-salon-name').value.trim();
  if (!salonName) { alert('Donnez un nom au salon !'); return; }
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
  // Garder max 20 messages
  while (div.children.length > 20) div.removeChild(div.lastChild);
}
