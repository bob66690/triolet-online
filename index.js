// =====================================================
//  TRIOLET ONLINE  –  index.js
//  Règles officielles Gigamic
// =====================================================

// ─── DISTRIBUTION OFFICIELLE ───
const DISTRIB = {
  0:9, 1:9, 2:8, 3:8, 4:7, 5:8, 6:6,
  7:6, 8:4, 9:4, 10:3, 11:3, 12:2, 13:2, 14:1, 15:1
  // + 2 jokers = 83 jetons → on retire 3 → 80 en jeu
};

// ─── CASES SPÉCIALES (coordonnées officielles) ───
// Référence : lignes A-O (0-14), colonnes 1-15 (0-14)
const SPECS = (function(){
  const m = {};
  function add(list, type){
    list.forEach(s => {
      const r = s.charCodeAt(0) - 65;
      const c = parseInt(s.slice(1)) - 1;
      m[r+','+c] = type;
    });
  }
  add(['A8','B2','B14','H1','H15','N2','N14','O8'], 'R'); // Rejouer
  add(['D8','E5','E11','H4','H12','K5','K11','L8'],  'D'); // ×2
  add(['B5','B11','E2','E14','K2','K14','N5','N11'], 'T'); // ×3
  add(['H8'], 'C'); // Centre (=×2 au premier coup)
  return m;
})();

// ─── ÉTAT GLOBAL ───
let G         = null;
let selIdx    = null;  // index du jeton sélectionné dans la main
let echSel    = [];    // indices sélectionnés pour l'échange
let jokerCB   = null;  // callback quand on choisit la valeur du joker
let logMode   = 'detail'; // 'detail' | 'min'

// =====================================================
//  CRÉATION DE PARTIE
// =====================================================
function newGame(players) {
  // Construire le sac
  const sac = [];
  Object.entries(DISTRIB).forEach(([v,q]) => {
    for (let i = 0; i < q; i++)
      sac.push({ val: parseInt(v), isJoker: false, jokerVal: null });
  });
  sac.push({ val: null, isJoker: true, jokerVal: null });
  sac.push({ val: null, isJoker: true, jokerVal: null });

  shuffle(sac);
  sac.splice(0, 3); // retirer 3 jetons faces cachées

  const joueurs = players.map((name, i) => ({
    name,
    score : 0,
    hand  : sac.splice(-3, 3),
    isAI  : (i > 0 && players[i] === 'IA')
  }));

  return {
    board  : Array(15).fill(null).map(() => Array(15).fill(null)),
    sac,
    joueurs,
    cur    : 0,       // index joueur actif
    first  : true,    // premier coup de la partie ?
    usedSp : new Set(), // cases spéciales déjà consommées
    pend   : [],      // {hi, r, c, val, isJoker, jokerVal}
    rejouer: false,
    over   : false
  };
}

// =====================================================
//  UTILITAIRES
// =====================================================
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function drawN(sac, n) {
  n = Math.min(n, sac.length);
  return n > 0 ? sac.splice(-n, n) : [];
}

// Valeur effective d'un jeton (gère le joker)
function ev(t) {
  if (!t) return null;
  return t.isJoker ? t.jokerVal : t.val;
}

// Type de case spéciale (null si inexistante ou déjà utilisée)
function specAt(r, c) {
  const k = r + ',' + c;
  if (G.usedSp.has(k)) return null;
  return SPECS[k] || null;
}

// =====================================================
//  PLATEAU VIRTUEL (board + pending fusionnés)
// =====================================================
function vboard() {
  const b = G.board.map(row => row.map(c => c ? {...c} : null));
  G.pend.forEach(p => {
    b[p.r][p.c] = { val: p.val, isJoker: p.isJoker, jokerVal: p.jokerVal };
  });
  return b;
}

// Ligne continue passant par (r,c) dans direction (dr,dc)
function getLine(b, r, c, dr, dc) {
  // Reculer jusqu'au début de la séquence
  let sr = r, sc = c;
  while (sr-dr >= 0 && sr-dr < 15 && sc-dc >= 0 && sc-dc < 15
         && b[sr-dr][sc-dc] !== null) { sr -= dr; sc -= dc; }
  // Avancer jusqu'à la fin
  const line = [];
  let cr = sr, cc = sc;
  while (cr >= 0 && cr < 15 && cc >= 0 && cc < 15 && b[cr][cc] !== null) {
    line.push({ r: cr, c: cc, tok: b[cr][cc] });
    cr += dr; cc += dc;
  }
  return line;
}

// Toutes les lignes (H et V) de ≥2 jetons touchées par les pending
function affectedLines() {
  const b    = vboard();
  const res  = [];
  const seen = new Set();
  G.pend.forEach(p => {
    [['H', p.r, 0, 1], ['V', p.c, 1, 0]].forEach(([axis, key, dr, dc]) => {
      const k = axis + key;
      if (seen.has(k)) return;
      seen.add(k);
      const l = getLine(b, p.r, p.c, dr, dc);
      if (l.length >= 2) res.push(l);
    });
  });
  return res;
}

// Un pending est-il adjacent à un jeton FIXÉ (pas pending) ?
function adjFixed(r, c) {
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r+dr, nc = c+dc;
    if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && G.board[nr][nc] !== null)
      return true;
  }
  return false;
}

// =====================================================
//  VALIDATION DU COUP
// =====================================================
function validate() {
  const p = G.pend;

  if (p.length === 0) return fail('Sélectionnez un jeton puis cliquez sur le plateau');
  if (p.length > 3)   return fail('Maximum 3 jetons par tour');

  // Joker sans valeur assignée ?
  if (p.some(x => x.isJoker && x.jokerVal === null))
    return fail('Définissez la valeur du joker');

  // Tous sur la même ligne ou colonne ?
  const rows = [...new Set(p.map(x => x.r))];
  const cols = [...new Set(p.map(x => x.c))];
  if (rows.length > 1 && cols.length > 1)
    return fail('Les jetons doivent être sur la même ligne ou colonne');

  // Premier coup : obligatoirement sur H8 (r=7, c=7)
  if (G.first) {
    if (!p.some(x => x.r === 7 && x.c === 7))
      return fail('Le premier jeton doit couvrir la case centrale H8');
  } else {
    // Au moins un jeton adjacent à un jeton FIXÉ sur le plateau
    if (!p.some(x => adjFixed(x.r, x.c)))
      return fail('Les jetons doivent être adjacents à un jeton déjà en place');
  }

  // Vérifier les séquences formées
  const b = vboard();
  for (const px of p) {
    for (const [dr, dc] of [[0,1],[1,0]]) {
      const line = getLine(b, px.r, px.c, dr, dc);
      if (line.length < 2) continue;

      if (line.length > 3)
        return fail('Maximum 3 jetons côte à côte dans le même sens');

      const vals = line.map(l => ev(l.tok));
      if (vals.some(v => v === null))
        return fail('La valeur du joker doit être définie avant de valider');

      const sum = vals.reduce((a, b) => a + b, 0);

      if (line.length === 2 && sum > 15)
        return fail(`Cette paire fait ${sum} > 15, impossible`);

      if (line.length === 3 && sum !== 15)
        return fail(`Ce trio fait ${sum} au lieu de 15`);
    }
  }

  // Carré 2×2 interdit UNIQUEMENT au premier tour
  if (G.first) {
    const b2 = vboard();
    for (let r = 0; r < 14; r++) {
      for (let c = 0; c < 14; c++) {
        if (b2[r][c] && b2[r+1][c] && b2[r][c+1] && b2[r+1][c+1]) {
          if (p.some(x => (x.r===r||x.r===r+1) && (x.c===c||x.c===c+1)))
            return fail('Interdit de former un carré au premier tour');
        }
      }
    }
  }

  // Pas 2 jokers au même tour
  if (p.filter(x => x.isJoker).length >= 2)
    return fail('Interdit de poser 2 jokers au même tour');

  return { ok: true };
}

function fail(msg) { return { ok: false, msg }; }

// =====================================================
//  CALCUL DES POINTS
// =====================================================
function calcPoints() {
  let total    = 0;
  const lines  = affectedLines();
  const hasJok = G.pend.some(p => p.isJoker);

  // ── Détection Triolet ──
  // Les 3 jetons posés forment EUX-MÊMES un Trio (tous nouveaux, même ligne, somme=15, sans joker)
  let isTriolet     = false;
  let trioletLineId = -1;

  if (G.pend.length === 3 && !hasJok) {
    lines.forEach((line, idx) => {
      if (line.length !== 3) return;
      const allNew = line.every(l => G.pend.some(p => p.r === l.r && p.c === l.c));
      if (!allNew) return;
      const sum = line.map(l => ev(l.tok)).reduce((a,b) => a+b, 0);
      if (sum === 15) { isTriolet = true; trioletLineId = idx; }
    });
  }

  lines.forEach((line, lineIdx) => {
    const vals = line.map(l => ev(l.tok));
    const sum  = vals.reduce((a,b) => a+b, 0);
    const len  = line.length;

    // Multiplicateur : case spéciale sous un jeton NEWLY posé de cette ligne
    // Une seule case spéciale par décompte (règle officielle)
    let mult       = 1;
    let spUsedKey  = null;

    for (const p of G.pend) {
      if (!line.some(l => l.r === p.r && l.c === p.c)) continue;
      const sp = specAt(p.r, p.c);
      if (sp === 'D' || sp === 'C') { mult = 2; spUsedKey = p.r+','+p.c; break; }
      if (sp === 'T')               { mult = 3; spUsedKey = p.r+','+p.c; break; }
    }

    if (len === 3 && sum === 15) {
      // TRIO = 30 × multiplicateur
      let pts = 30 * mult;
      let msg = `Trio (${vals.join('+')}=15) × ${mult} = ${30*mult}`;

      // Bonus Triolet sur la ligne qui constitue le Triolet
      if (isTriolet && lineIdx === trioletLineId) {
        pts += 50;
        msg  = `🎉 TRIOLET ! ${msg} + 50 bonus = ${pts}`;
      }

      if (spUsedKey) G.usedSp.add(spUsedKey);
      total += pts;
      addLog(msg, 'p');

    } else if (len === 2) {
      // PAIRE : somme des valeurs (avec multiplicateur sur jeton nouvellement posé)
      let pts = 0;
      line.forEach(item => {
        const v     = ev(item.tok);
        const isNew = G.pend.some(p => p.r === item.r && p.c === item.c);
        if (isNew) {
          const sp = specAt(item.r, item.c);
          if (sp === 'D' || sp === 'C') { pts += v * 2; G.usedSp.add(item.r+','+item.c); }
          else if (sp === 'T')          { pts += v * 3; G.usedSp.add(item.r+','+item.c); }
          else                          pts += v;
        } else {
          pts += v;
        }
      });
      total += pts;
      addLog(`Paire (${vals.join('+')}=${sum}) → ${pts} pts`, 'i');
    }
    // Un seul jeton posé sans former de paire → 0 pts (pas de log)
  });

  // Case Rejouer
  G.pend.forEach(p => {
    if (specAt(p.r, p.c) === 'R') {
      G.usedSp.add(p.r+','+p.c);
      G.rejouer = true;
      addLog('🔁 Case Rejouer !', 'g');
    }
  });

  return total;
}

// =====================================================
//  JOUER UN COUP (humain)
// =====================================================
function playMove() {
  const v = validate();
  if (!v.ok) { addLog('❌ ' + v.msg, 'b'); return; }

  const pts = calcPoints();
  const pl  = G.joueurs[G.cur];
  pl.score += pts;
  addLog(`✅ ${pl.name} : +${pts} pt${pts>1?'s':''} → Total ${pl.score}`, 'g');

  // Fixer les jetons sur le plateau
  G.pend.forEach(p => {
    G.board[p.r][p.c] = { val: p.val, isJoker: p.isJoker, jokerVal: p.jokerVal };
  });

  // Retirer de la main (indices décroissants pour ne pas décaler)
  const idxs = [...new Set(G.pend.map(p => p.hi))].sort((a,b) => b-a);
  idxs.forEach(i => pl.hand.splice(i, 1));

  // Repioche : exactement autant que posé
  pl.hand.push(...drawN(G.sac, idxs.length));

  const rejouer = G.rejouer;
  G.pend    = [];
  selIdx    = null;
  G.first   = false;
  G.rejouer = false;

  if (checkEnd()) return;

  if (rejouer) {
    render();
    return; // même joueur rejoue
  }
  nextTurn();
}

// =====================================================
//  TOUR SUIVANT
// =====================================================
function nextTurn() {
  G.cur = (G.cur + 1) % G.joueurs.length;
  G.pend = [];
  selIdx = null;
  render();
  if (G.joueurs[G.cur].isAI) setTimeout(aiTurn, 800);
}

// =====================================================
//  FIN DE PARTIE
// =====================================================
function checkEnd() {
  const pl = G.joueurs[G.cur];

  // Condition normale : sac vide ET joueur actif a posé son dernier jeton
  if (G.sac.length === 0 && pl.hand.length === 0) {
    let bonus = 0;
    G.joueurs.forEach((j, i) => {
      if (i === G.cur) return;
      const s = j.hand.reduce((a, t) => a + (ev(t) || 0), 0);
      bonus += s;
      addLog(`${j.name} perd ${s} pts (jetons restants)`, 'b');
    });
    pl.score += bonus;
    if (bonus > 0) addLog(`${pl.name} gagne +${bonus} pts bonus de fin`, 'g');
    G.over = true;
    render();
    setTimeout(showEnd, 700);
    return true;
  }

  // Cas exceptionnel : plus personne ne peut jouer
  // (simplifié : si tous les joueurs ont des jetons mais aucun coup possible
  //  → non implémenté ici, partie continue)
  return false;
}

function showEnd() {
  const sorted = [...G.joueurs].sort((a,b) => b.score - a.score);
  const medals = ['🥇','🥈','🥉','4️⃣'];
  document.getElementById('fin-scores').innerHTML =
    sorted.map((j,i) =>
      `<div class="finrow">
         <span>${medals[i]} ${j.name}</span>
         <span class="finpts">${j.score} pts</span>
       </div>`
    ).join('');
  document.getElementById('modal-fin').classList.add('on');
}

// =====================================================
//  IA  (cherche le meilleur coup simple : 1 jeton)
// =====================================================
function aiTurn() {
  const pl = G.joueurs[G.cur];
  if (!pl || !pl.isAI) return;
  if (pl.hand.length === 0) { nextTurn(); return; }

  let best    = null;
  let bestPts = -1;

  // Essayer chaque jeton sur chaque case valide
  for (let hi = 0; hi < pl.hand.length; hi++) {
    const tok = pl.hand[hi];
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (G.board[r][c]) continue;
        if (G.first && !(r === 7 && c === 7)) continue;
        if (!G.first && !adjFixed(r, c))       continue;

        // L'IA choisit jokerVal = valeur qui permet un coup valide
        const jokerVals = tok.isJoker ? [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] : [null];

        for (const jv of jokerVals) {
          G.pend = [{
            hi, r, c,
            val     : tok.val,
            isJoker : tok.isJoker,
            jokerVal: tok.isJoker ? jv : null
          }];

          const v = validate();
          if (v.ok) {
            const pts = calcPoints();
            if (pts > bestPts) {
              bestPts = pts;
              best    = { hi, r, c, val: tok.val, isJoker: tok.isJoker, jokerVal: tok.isJoker ? jv : null };
            }
          }
          G.pend = [];
        }
      }
    }
  }

  if (best) {
    // Recalcul propre avec le meilleur coup
    G.pend = [{ ...best }];
    const pts = calcPoints();
    pl.score += pts;
    addLog(`🤖 ${pl.name} joue en ${String.fromCharCode(65+best.r)}${best.c+1} → +${pts} pts`, 'i');

    G.board[best.r][best.c] = {
      val: best.val, isJoker: best.isJoker, jokerVal: best.jokerVal
    };
    pl.hand.splice(best.hi, 1);
    pl.hand.push(...drawN(G.sac, 1));

    const rejouer = G.rejouer;
    G.pend    = [];
    G.first   = false;
    G.rejouer = false;

    if (checkEnd()) return;

    if (rejouer) {
      render();
      setTimeout(aiTurn, 800);
    } else {
      nextTurn();
    }
  } else {
    // Aucun coup valide → échanger si possible, sinon passer
    if (G.sac.length >= 5 && pl.hand.length > 0) {
      const t = pl.hand.splice(Math.floor(Math.random()*pl.hand.length), 1);
      G.sac.push(...t);
      shuffle(G.sac);
      pl.hand.push(...drawN(G.sac, t.length));
      addLog(`🤖 ${pl.name} échange`, 'i');
    } else {
      addLog(`🤖 ${pl.name} passe`, 'i');
    }
    nextTurn();
  }
}

// =====================================================
//  RENDU
// =====================================================
function render() {
  renderBoard();
  renderHand();
  renderScores();
  document.getElementById('sac-ct').textContent   = G.sac.length;
  const pl = G.joueurs[G.cur];
  document.getElementById('turn-name').textContent =
    (pl.isAI ? '🤖 ' : '') + pl.name;
}

// ── Plateau ──
function renderBoard() {
  const bd = document.getElementById('board');
  bd.innerHTML = '';

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell    = document.createElement('div');
      cell.className = 'cell';

      const sp   = SPECS[r+','+c];
      const used = G.usedSp.has(r+','+c);

      // Classe case spéciale (si pas encore utilisée)
      if (!used && sp) cell.classList.add('sp-' + sp);

      const boardTok = G.board[r][c];
      const pendTok  = G.pend.find(p => p.r === r && p.c === c);

      if (boardTok) {
        // Jeton définitivement posé
        cell.appendChild(makeTok(boardTok, false));

      } else if (pendTok) {
        // Jeton en attente de validation
        const tk = makeTok({
          val: pendTok.val, isJoker: pendTok.isJoker, jokerVal: pendTok.jokerVal
        }, true);
        cell.appendChild(tk);
        cell.addEventListener('click', () => removePend(r, c));

      } else {
        // Case vide
        if (!used && sp) {
          const lbl = document.createElement('span');
          lbl.className   = 'cell-lbl';
          lbl.textContent = sp === 'R' ? '↺' : (sp === 'D' || sp === 'C') ? '×2' : '×3';
          cell.appendChild(lbl);
        }

        // Surbrillance cases valides si un jeton est sélectionné
        if (selIdx !== null && !G.joueurs[G.cur].isAI) {
          if (G.first) {
            if (r === 7 && c === 7) cell.classList.add('placeable');
          } else {
            if (adjFixed(r, c)) cell.classList.add('placeable');
          }
        }

        cell.addEventListener('click', () => onCellClick(r, c));
      }

      bd.appendChild(cell);
    }
  }
}

function makeTok(t, isPend) {
  const div = document.createElement('div');
  div.className = 'tok' + (t.isJoker ? ' joker' : '') + (isPend ? ' pending' : '');

  if (t.isJoker) {
    div.textContent = 'X';
    if (t.jokerVal !== null && t.jokerVal !== undefined) {
      const cor = document.createElement('span');
      cor.className   = 'jcorner';
      cor.textContent = t.jokerVal;
      div.appendChild(cor);
    }
  } else {
    div.textContent = t.val;
  }
  return div;
}

// ── Main (chevalet) ──
function renderHand() {
  const ct  = document.getElementById('hand-tokens');
  ct.innerHTML = '';

  const pl = G.joueurs[G.cur];

  if (pl.isAI) {
    ct.innerHTML = '<span style="color:#94a3b8;font-size:.85rem;text-align:center;display:block;">🤖 L\'IA réfléchit…</span>';
    return;
  }

  // Indices utilisés dans pending
  const usedHi = new Set(G.pend.map(p => p.hi));

  // On affiche toujours 3 emplacements
  for (let i = 0; i < pl.hand.length || i < 3; i++) {
    const div = document.createElement('div');

    if (i >= pl.hand.length) {
      // Emplacement vide (sac épuisé)
      div.className = 'htok ghost';
    } else if (usedHi.has(i)) {
      // Jeton posé sur le plateau → emplacement fantôme
      div.className = 'htok ghost';
    } else {
      const t = pl.hand[i];
      div.className   = 'htok' + (t.isJoker ? ' joker' : '') + (selIdx === i ? ' sel' : '');
      div.textContent = t.isJoker ? 'X' : t.val;
      div.addEventListener('click', () => selectTok(i));
    }

    ct.appendChild(div);
  }
}

// ── Scores ──
function renderScores() {
  document.getElementById('scores-list').innerHTML =
    G.joueurs.map((j, i) =>
      `<div class="srow">
         <span class="${i === G.cur ? 'cur' : ''}">
           ${j.isAI ? '🤖' : '👤'} ${j.name} ${i === G.cur ? '◀' : ''}
         </span>
         <span class="pts">${j.score}</span>
       </div>`
    ).join('');
}

// =====================================================
//  INTERACTIONS JOUEUR
// =====================================================
function selectTok(i) {
  if (G.over) return;
  if (G.joueurs[G.cur].isAI) return;
  if (G.pend.some(p => p.hi === i)) return; // déjà posé
  selIdx = (selIdx === i) ? null : i;
  render();
}

function onCellClick(r, c) {
  if (G.over) return;
  if (G.joueurs[G.cur].isAI) return;
  if (selIdx === null) { addLog('Sélectionnez d\'abord un jeton', 'b'); return; }
  if (G.board[r][c]) return;
  if (G.pend.some(p => p.r === r && p.c === c)) return;

  const pl  = G.joueurs[G.cur];
  const tok = pl.hand[selIdx];

  if (tok.isJoker) {
    const capturedIdx = selIdx;
    openJoker(jokerVal => {
      G.pend.push({ hi: capturedIdx, r, c, val: null, isJoker: true, jokerVal });
      selIdx = null;
      render();
    });
  } else {
    G.pend.push({ hi: selIdx, r, c, val: tok.val, isJoker: false, jokerVal: null });
    selIdx = null;
    render();
  }
}

function removePend(r, c) {
  const i = G.pend.findIndex(p => p.r === r && p.c === c);
  if (i > -1) { G.pend.splice(i, 1); selIdx = null; render(); }
}

// ── Joker ──
function openJoker(cb) {
  jokerCB = cb;
  const grid = document.getElementById('jgrid');
  grid.innerHTML = '';
  for (let v = 0; v <= 15; v++) {
    const d = document.createElement('div');
    d.className   = 'jval';
    d.textContent = v;
    d.addEventListener('click', () => {
      document.getElementById('modal-joker').classList.remove('on');
      jokerCB = null;
      cb(v);
    });
    grid.appendChild(d);
  }
  document.getElementById('modal-joker').classList.add('on');
}

// ── Échange ──
function openEch() {
  if (G.joueurs[G.cur].isAI) return;
  if (G.pend.length > 0) { addLog('Annulez vos placements avant d\'échanger', 'b'); return; }
  if (G.sac.length < 5)  { addLog('Il faut ≥5 jetons dans le sac pour échanger', 'b'); return; }

  echSel = [];
  const pl = G.joueurs[G.cur];
  const ct = document.getElementById('ech-toks');
  ct.innerHTML = '';

  pl.hand.forEach((t, i) => {
    const d = document.createElement('div');
    d.className   = 'htok' + (t.isJoker ? ' joker' : '');
    d.textContent = t.isJoker ? 'X' : t.val;
    d.style.cursor = 'pointer';
    d.addEventListener('click', () => {
      const idx = echSel.indexOf(i);
      if (idx > -1) { echSel.splice(idx, 1); d.classList.remove('sel'); }
      else if (echSel.length < 3) { echSel.push(i); d.classList.add('sel'); }
    });
    ct.appendChild(d);
  });

  document.getElementById('modal-ech').classList.add('on');
}

function confirmEch() {
  if (echSel.length === 0) { addLog('Sélectionnez au moins 1 jeton', 'b'); return; }
  const pl     = G.joueurs[G.cur];
  const sorted = [...echSel].sort((a,b) => b-a);
  const removed = sorted.map(i => pl.hand.splice(i, 1)[0]);
  G.sac.push(...removed);
  shuffle(G.sac);
  pl.hand.push(...drawN(G.sac, removed.length));
  addLog(`🔄 Échange de ${removed.length} jeton(s)`, 'i');
  document.getElementById('modal-ech').classList.remove('on');
  echSel = [];
  nextTurn();
}

// ── Journal ──
function addLog(msg, type) {
  // Mode minimum : on affiche seulement les scores (+pts)
  if (logMode === 'min') {
    if (type !== 'g' && type !== 'b') return;
    if (!msg.includes('+') && !msg.includes('❌')) return;
  }

  const box = document.getElementById('logbox');
  const p   = document.createElement('p');
  p.textContent = msg;
  p.className   = { g:'lg', b:'lb', i:'li', p:'lp' }[type] || '';
  box.prepend(p);
  while (box.children.length > 40) box.removeChild(box.lastChild);
}

function setLog(mode) {
  logMode = mode;
  document.getElementById('btn-ld').classList.toggle('on', mode === 'detail');
  document.getElementById('btn-lm').classList.toggle('on', mode === 'min');
}

// =====================================================
//  DÉMARRAGE  –  Tous les événements ici, après le DOM
// =====================================================
document.addEventListener('DOMContentLoaded', () => {

  // Bouton Jouer (lobby)
  document.getElementById('btn-jouer').addEventListener('click', () => {
    const pseudo = document.getElementById('inp-pseudo').value.trim() || 'Joueur';
    const mode   = document.getElementById('inp-mode').value;
    const players = mode === 'solo' ? [pseudo, 'IA'] : [pseudo, 'Joueur 2'];

    G = newGame(players);

    document.getElementById('screen-lobby').style.display = 'none';
    document.getElementById('screen-game').style.display  = 'block';

    // Construire les coordonnées une seule fois
    buildCoords();

    addLog('🎮 Nouvelle partie — ' + players.join(' vs '), 'g');
    addLog('📦 ' + G.sac.length + ' jetons dans le sac', 'i');
    render();
  });

  // Valider
  document.getElementById('btn-valider').addEventListener('click', () => {
    if (!G || G.over) return;
    if (G.joueurs[G.cur].isAI) { addLog('Ce n\'est pas votre tour', 'b'); return; }
    playMove();
  });

  // Annuler
  document.getElementById('btn-annuler').addEventListener('click', () => {
    if (!G) return;
    G.pend = []; selIdx = null; render();
  });

  // Échanger
  document.getElementById('btn-echanger').addEventListener('click', () => {
    if (!G || G.over) return;
    openEch();
  });

  // Quitter
  document.getElementById('btn-quitter').addEventListener('click', () => {
    location.reload();
  });

  // Joker – annuler
  document.getElementById('btn-joker-cancel').addEventListener('click', () => {
    document.getElementById('modal-joker').classList.remove('on');
    jokerCB = null;
    selIdx  = null;
    if (G) render();
  });

  // Échange – confirmer / annuler
  document.getElementById('btn-ech-ok').addEventListener('click', confirmEch);
  document.getElementById('btn-ech-no').addEventListener('click', () => {
    document.getElementById('modal-ech').classList.remove('on');
    echSel = [];
  });

  // Fin – rejouer
  document.getElementById('btn-rejouer').addEventListener('click', () => {
    location.reload();
  });

  // Journal toggle
  document.getElementById('btn-ld').addEventListener('click', () => setLog('detail'));
  document.getElementById('btn-lm').addEventListener('click', () => setLog('min'));

});

// Construire les labels de coordonnées (une seule fois)
function buildCoords() {
  const cc = document.getElementById('cc');
  const cr = document.getElementById('cr');
  if (cc.children.length) return; // déjà construit
  for (let i = 1; i <= 15; i++) {
    const s = document.createElement('span');
    s.textContent = i; cc.appendChild(s);
  }
  for (let i = 0; i < 15; i++) {
    const s = document.createElement('span');
    s.textContent = String.fromCharCode(65+i); cr.appendChild(s);
  }
}
