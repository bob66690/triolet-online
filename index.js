// =====================================================
//  TRIOLET ONLINE  –  index.js
//  Règles officielles Gigamic + 1-4 joueurs
// =====================================================

const DISTRIB = {
  0:9,1:9,2:8,3:8,4:7,5:8,6:6,
  7:6,8:4,9:4,10:3,11:3,12:2,13:2,14:1,15:1
};

const SPECS = (function(){
  const m={};
  function add(list,type){
    list.forEach(s=>{
      const r=s.charCodeAt(0)-65;
      const c=parseInt(s.slice(1))-1;
      m[r+','+c]=type;
    });
  }
  add(['A8','B2','B14','H1','H15','N2','N14','O8'],'R');
  add(['D8','E5','E11','H4','H12','K5','K11','L8'], 'D');
  add(['B5','B11','E2','E14','K2','K14','N5','N11'],'T');
  add(['H8'],'C');
  return m;
})();

let G       = null;
let selIdx  = null;
let echSel  = [];
let jokerCB = null;
let logMode = 'detail';

// Config lobby
let nbPlayers = 2;
let playersConfig = [
  {name:'Joueur', isAI:false},
  {name:'IA',     isAI:true}
];

// =====================================================
//  SAUVEGARDE / CHARGEMENT (localStorage)
// =====================================================
function saveGame(){
  if(!G)return;
  const data={
    board: G.board,
    sac: G.sac,
    joueurs: G.joueurs,
    cur: G.cur,
    startPlayer: G.startPlayer,
	first: G.first,
    usedSp: Array.from(G.usedSp),
    pend: G.pend,
    rejouer: G.rejouer,
    over: G.over,
    turnCounts: G.turnCounts,
	passCount: G.passCount
  };
  localStorage.setItem('triolet_game',JSON.stringify(data));
}

function loadGame(){
  const saved=localStorage.getItem('triolet_game');
  if(!saved)return null;
  try{
    const data=JSON.parse(saved);
   
return{
      board: data.board,
      sac: data.sac,
      joueurs: data.joueurs,
      cur: data.cur,
      startPlayer: data.startPlayer || data.cur,
      first: data.first,
      usedSp: new Set(data.usedSp),
      pend: data.pend,
      rejouer: data.rejouer,
      over: data.over,
      turnCounts: data.turnCounts,
	passCount: data.passCount || 0
    };
  }catch(e){
    console.error('Erreur chargement partie:',e);
    return null;
  }
}

function clearSavedGame(){
  localStorage.removeItem('triolet_game');
}

// =====================================================
//  CRÉATION
// =====================================================
function newGame(configs){
  const sac=[];
  Object.entries(DISTRIB).forEach(([v,q])=>{
    for(let i=0;i<q;i++)
      sac.push({val:parseInt(v),isJoker:false,jokerVal:null});
  });
  sac.push({val:null,isJoker:true,jokerVal:null});
  sac.push({val:null,isJoker:true,jokerVal:null});
  shuffle(sac);
  sac.splice(0,3);

  const joueurs=configs.map(cfg=>({
    name : cfg.name||'Joueur',
    score: 0,
    hand : sac.splice(-3,3),
    isAI : cfg.isAI
  }));

  return{
    board  : Array(15).fill(null).map(()=>Array(15).fill(null)),
    sac, joueurs,
    cur    : 0,
	passCount : 0,
	startPlayer : 0,
    first  : true,
    usedSp : new Set(),
    pend   : [],
    rejouer: false,
    over   : false,
    turnCounts: configs.map(()=>0)
  };
}

// =====================================================
//  UTILITAIRES
// =====================================================
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}
function drawN(sac,n){
  n=Math.min(n,sac.length);
  return n>0?sac.splice(-n,n):[];
}

// Valeur effective d'un jeton pour le PLACEMENT (position sur plateau)
// Le joker a la valeur choisie pour déterminer si le coup est légal
function ev(t){
  if(!t)return null;
  return t.isJoker?t.jokerVal:t.val;
}

// ── RÈGLE OFFICIELLE JOKER ──
// "La valeur d'un Joker est NULLE pour le comptage des points"
// SAUF dans un Trio/Triolet où il n'entraîne aucune modification (30 pts quand même)
// => Pour les PAIRES : le joker vaut 0 dans le décompte
// => Pour les TRIOS  : le trio vaut 30 pts (le joker n'ajoute rien, ne retire rien)
function scoreVal(t){
  if(!t)return 0;
  if(t.isJoker)return 0;  // joker = 0 point dans le décompte
  return t.val;
}

function specAt(r,c){
  const k=r+','+c;
  if(G.usedSp.has(k))return null;
  return SPECS[k]||null;
}

// =====================================================
//  PLATEAU VIRTUEL
// =====================================================
function vboard(){
  const b=G.board.map(row=>row.map(c=>c?{...c}:null));
  G.pend.forEach(p=>{
    b[p.r][p.c]={val:p.val,isJoker:p.isJoker,jokerVal:p.jokerVal};
  });
  return b;
}

function getLine(b,r,c,dr,dc){
  let sr=r,sc=c;
  while(sr-dr>=0&&sr-dr<15&&sc-dc>=0&&sc-dc<15
        &&b[sr-dr][sc-dc]!==null){sr-=dr;sc-=dc;}
  const line=[];
  let cr=sr,cc=sc;
  while(cr>=0&&cr<15&&cc>=0&&cc<15&&b[cr][cc]!==null){
    line.push({r:cr,c:cc,tok:b[cr][cc]});
    cr+=dr;cc+=dc;
  }
  return line;
}

function affectedLines(){
  const b=vboard(),res=[],seen=new Set();
  G.pend.forEach(p=>{
    [['H',0,1],['V',1,0]].forEach(([axis,dr,dc])=>{
      const k=axis+(dr===0?p.r:p.c);
      if(seen.has(k))return;
      seen.add(k);
      const l=getLine(b,p.r,p.c,dr,dc);
      if(l.length>=2)res.push(l);
    });
  });
  return res;
}

function adjFixed(r,c){
  for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
    const nr=r+dr,nc=c+dc;
    if(nr>=0&&nr<15&&nc>=0&&nc<15&&G.board[nr][nc]!==null)
      return true;
  }
  return false;
}


function everyonePlayedOnce(){
  return G && G.turnCounts && G.turnCounts.every(n=>n>=1);
}

function openingRoundActive(){
  return !everyonePlayedOnce();
}

function formsForbiddenSquare(){
  const b2=vboard();
  for(let r=0;r<14;r++){
    for(let c=0;c<14;c++){
      if(b2[r][c]&&b2[r+1][c]&&b2[r][c+1]&&b2[r+1][c+1]){
        if(G.pend.some(x=>(x.r===r||x.r===r+1)&&(x.c===c||x.c===c+1)))
          return true;
      }
    }
  }
  return false;
}

// =====================================================
//  VALIDATION
// =====================================================
function validate(){
  const p=G.pend;
  if(p.length===0)
    return fail('Sélectionnez un jeton puis cliquez sur le plateau');
  if(p.length>3)
    return fail('Maximum 3 jetons par tour');
  if(p.some(x=>x.isJoker&&x.jokerVal===null))
    return fail('Définissez la valeur du joker');

  const rows=[...new Set(p.map(x=>x.r))];
  const cols=[...new Set(p.map(x=>x.c))];
  if(rows.length>1&&cols.length>1)
    return fail('Les jetons doivent être sur la même ligne ou colonne');

  if(G.first){
    if(!p.some(x=>x.r===7&&x.c===7))
      return fail('Le 1er jeton doit couvrir la case centrale H8');
  }else{
    if(!p.some(x=>adjFixed(x.r,x.c)))
      return fail('Les jetons doivent être adjacents à un jeton en place');
  }

  // Vérif séquences — on utilise ev() (valeur effective) pour valider le placement
  const b=vboard();
  for(const px of p){
    for(const[dr,dc]of[[0,1],[1,0]]){
      const line=getLine(b,px.r,px.c,dr,dc);
      if(line.length<2)continue;
      if(line.length>3)return fail('Maximum 3 jetons côte à côte');
      const vals=line.map(l=>ev(l.tok));
      if(vals.some(v=>v===null))return fail('La valeur du joker doit être définie');
      const sum=vals.reduce((a,b)=>a+b,0);
      if(line.length===2&&sum>15)
        return fail(`Cette paire fait ${sum} > 15`);
      if(line.length===3&&sum!==15)
        return fail(`Ce trio fait ${sum} au lieu de 15`);
    }
  }

  // Carré interdit tant que tous les joueurs n'ont pas encore joué une fois
  if(openingRoundActive() && formsForbiddenSquare())
    return fail("Interdit de former un carré tant que tous les joueurs n'ont pas joué");

  if(p.filter(x=>x.isJoker).length>=2)
    return fail('Interdit de poser 2 jokers au même tour');

  return{ok:true};
}
function fail(msg){return{ok:false,msg};}

// =====================================================
//  CALCUL DES POINTS — RÈGLES OFFICIELLES JOKER
//
//  • Paire (2 jetons) : on additionne les valeurs SAUF le joker (vaut 0)
//    ex: joker(=7 sur plateau) + 8 → score = 0 + 8 = 8 pts
//
//  • Trio (3 jetons, somme=15) : toujours 30 pts × multiplicateur
//    Le joker ne modifie PAS la valeur du trio.
//
//  • Triolet : Trio posé en une fois → +50 pts BONUS
//    SAUF si le triolet contient un joker (pas de bonus triolet)
//
//  • Cases ×2/×3 : multiplient la valeur DU JETON posé dessus
//    Si ce jeton est un joker → 0 × multiplicateur = 0 (joker vaut 0)
//    Mais si la case ×2 est dans un TRIO → le trio entier est ×2 (30×2=60)
// =====================================================
function calcPoints(){
  let total = 0;
  const usedKeys = new Set();
  let rejouer = false;

  const lines = affectedLines();
  const hasJok = G.pend.some(p => p.isJoker);

  // ── Cas : 1 seul jeton posé sans voisin ──
  if(G.pend.length === 1 && lines.length === 0){
    const p = G.pend[0];
    const sp = specAt(p.r, p.c);
    const sv = scoreVal({val:p.val, isJoker:p.isJoker, jokerVal:p.jokerVal});

    if(sp === 'C' || sp === 'D'){
      const pts = sv * 2;
      usedKeys.add(p.r + ',' + p.c);
      total += pts;
      addLog(
        p.isJoker
          ? `Joker sur ×2 : 0×2 = 0 pt`
          : `Case ×2 : ${sv}×2 = ${pts} pts`,
        'p'
      );
    }else if(sp === 'T'){
      const pts = sv * 3;
      usedKeys.add(p.r + ',' + p.c);
      total += pts;
      addLog(
        p.isJoker
          ? `Joker sur ×3 : 0×3 = 0 pt`
          : `Case ×3 : ${sv}×3 = ${pts} pts`,
        'p'
      );
    }else{
      addLog(`Jeton posé seul — 0 pt`, 'i');
    }

    if(sp === 'R'){
      usedKeys.add(p.r + ',' + p.c);
      rejouer = true;
      addLog('🔁 Case Rejouer !', 'g');
    }

    return { pts: total, usedKeys, rejouer };
  }

  // ── Détection Triolet ──
  let isTriolet = false, trioletLineId = -1;
  if(G.pend.length === 3 && !hasJok){
    lines.forEach((line, idx) => {
      if(line.length !== 3) return;
      const allNew = line.every(l => G.pend.some(p => p.r === l.r && p.c === l.c));
      if(!allNew) return;
      const sum = line.map(l => ev(l.tok)).reduce((a,b) => a+b, 0);
      if(sum === 15){
        isTriolet = true;
        trioletLineId = idx;
      }
    });
  }

  // ── Calcul ligne par ligne ──
  lines.forEach((line, lineIdx) => {
    const len = line.length;
    const evVals = line.map(l => ev(l.tok));
    const evSum = evVals.reduce((a,b) => a+b, 0);

    if(len === 3 && evSum === 15){
      let mult = 1;
      let spKey = null;

      for(const p of G.pend){
        if(!line.some(l => l.r === p.r && l.c === p.c)) continue;
        const sp = specAt(p.r, p.c);
        if((sp === 'D' || sp === 'C') && mult < 2){
          mult = 2;
          spKey = p.r + ',' + p.c;
        }
        if(sp === 'T' && mult < 3){
          mult = 3;
          spKey = p.r + ',' + p.c;
        }
      }

      let pts = 30 * mult;
      let msg = `Trio (${evVals.join('+')}=15)`;
      if(mult > 1) msg += ` sur case ×${mult}`;
      msg += ` = ${30 * mult} pts`;

      if(isTriolet && lineIdx === trioletLineId && !hasJok){
        pts += 50;
        msg = `🎉 TRIOLET ! ${msg} + 50 bonus = ${pts} pts`;
      }else if(hasJok){
        msg += ` (joker inclus — pas de bonus triolet)`;
      }

      if(spKey){
        usedKeys.add(spKey);
      }

      total += pts;
      addLog(msg, 'p');

    }else if(len === 2){
      let pts = 0;
      const detail = [];

      line.forEach(item => {
        const sv = scoreVal(item.tok);
        const isNew = G.pend.some(p => p.r === item.r && p.c === item.c);

        if(isNew){
          const sp = specAt(item.r, item.c);
          if(sp === 'D' || sp === 'C'){
            pts += sv * 2;
            usedKeys.add(item.r + ',' + item.c);
            detail.push(item.tok.isJoker ? `X(×2=0)` : `${sv}×2=${sv*2}`);
          }else if(sp === 'T'){
            pts += sv * 3;
            usedKeys.add(item.r + ',' + item.c);
            detail.push(item.tok.isJoker ? `X(×3=0)` : `${sv}×3=${sv*3}`);
          }else{
            pts += sv;
            detail.push(item.tok.isJoker ? `X(=0)` : `${sv}`);
          }
        }else{
          pts += sv;
          detail.push(`${sv}`);
        }
      });

      total += pts;
      addLog(`Paire (${detail.join('+')} = ${pts} pts)`, 'i');
    }
  });

  // ── Case Rejouer ──
  G.pend.forEach(p => {
    if(specAt(p.r, p.c) === 'R'){
      usedKeys.add(p.r + ',' + p.c);
      rejouer = true;
      addLog('🔁 Case Rejouer !', 'g');
    }
  });

  return { pts: total, usedKeys, rejouer };
}
// =====================================================
//  JOUER UN COUP
// =====================================================
function playMove(){
  const v = validate();
  if(!v.ok){
    addLog('❌ ' + v.msg, 'b');
    return;
  }

  const res = calcPoints();
  const pts = res.pts;
  const pl = G.joueurs[G.cur];
  
  // == AJOUT JOURNAL DETAIL Humain
  const detail =
  G.pend.map(p =>
    p.isJoker
      ? `X(${p.jokerVal})`
      : p.val
  ).join('-');

if(G.pend.length === 3){

    addLog(
      `🎊 TRIOLET HUMAIN : ${pl.name} joue [${detail}]`,
      'score'
    );

}else if(G.pend.length === 2){

    addLog(
      `⚡ DOUBLE COUP : ${pl.name} joue [${detail}]`,
      'score'
    );

}else{

    addLog(
      `🎯 COUP SIMPLE : ${pl.name} joue [${detail}]`,
      'score'
    );
}
// fin ajout journal humain
  res.usedKeys.forEach(k => G.usedSp.add(k));
  G.rejouer = res.rejouer;

  pl.score += pts;
  G.passCount = 0;
  addLog(`✅ ${pl.name} : +${pts} pt${pts!==1?'s':''} → Total ${pl.score}`,'score');

  G.pend.forEach(p => {
    G.board[p.r][p.c] = {val:p.val, isJoker:p.isJoker, jokerVal:p.jokerVal};
  });

  const idxs = [...new Set(G.pend.map(p => p.hi))].sort((a,b) => b-a);
  idxs.forEach(i => pl.hand.splice(i,1));
  pl.hand.push(...drawN(G.sac, idxs.length));

  const rejouerNow = G.rejouer;
  G.pend = [];
  selIdx = null;
  G.first = false;
  G.rejouer = false;

  saveGame();
  if(checkEnd()) return;

  if(rejouerNow){
    finishTurn({samePlayer:true});
    return;
  }
  finishTurn();
}
// =====================================================
//  TOUR SUIVANT
// =====================================================
function nextTurn(){
  G.cur=(G.cur+1)%G.joueurs.length;
  G.pend=[];selIdx=null;
  render();
  if(G.joueurs[G.cur].isAI)setTimeout(aiTurn,800);
}

function finishTurn({samePlayer=false}={}){
  G.turnCounts[G.cur]=(G.turnCounts[G.cur]||0)+1;
  if(samePlayer){
    G.pend=[];selIdx=null;
    render();
    if(G.joueurs[G.cur].isAI)setTimeout(aiTurn,800);
    return;
  }
  nextTurn();
}


// =====================================================
//  FIN DE PARTIE
// =====================================================
function checkEnd(){
  const pl=G.joueurs[G.cur];
  if(G.sac.length===0&&pl.hand.length===0){
    let bonus=0;
    G.joueurs.forEach((j,i)=>{
      if(i===G.cur)return;
      // Valeur des jetons restants = scoreVal (joker = 0)
      const s=j.hand.reduce((a,t)=>a+scoreVal(t),0);
      bonus+=s;
      addLog(`${j.name} perd ${s} pts (jetons restants)`,'b');
    });
    pl.score+=bonus;
    if(bonus>0)addLog(`${pl.name} +${bonus} pts bonus de fin`,'score');
    G.over=true;
    render();
    setTimeout(showEnd,700);
    return true;
  }
  return false;
}

function showEnd(){

  const sorted = [...G.joueurs]
    .sort((a,b)=>b.score-a.score);

  let html = '';

  if(sorted.length >= 3){

    html += `
      <div class="podium">

        <div class="pod second">
          <div class="medal">🥈</div>
          <div class="pname">${sorted[1].name}</div>
          <div class="pscore">${sorted[1].score} pts</div>
        </div>

        <div class="pod first">
          <div class="winner">👑 VAINQUEUR 👑</div>
          <div class="medal">🥇</div>
          <div class="pname">${sorted[0].name}</div>
          <div class="pscore">${sorted[0].score} pts</div>
        </div>

        <div class="pod third">
          <div class="medal">🥉</div>
          <div class="pname">${sorted[2].name}</div>
          <div class="pscore">${sorted[2].score} pts</div>
        </div>

      </div>
    `;

    if(sorted[3]){

      html += `
        <div class="fourth">
          4️⃣ ${sorted[3].name} — ${sorted[3].score} pts
        </div>
      `;
    }

  }else{

    html += `
      <div class="podium">

        <div class="pod second">
          <div class="medal">🥈</div>
          <div class="pname">${sorted[1].name}</div>
          <div class="pscore">${sorted[1].score} pts</div>
        </div>

        <div class="pod first">
          <div class="winner">👑 VAINQUEUR 👑</div>
          <div class="medal">🥇</div>
          <div class="pname">${sorted[0].name}</div>
          <div class="pscore">${sorted[0].score} pts</div>
        </div>

      </div>
    `;
  }

  document.getElementById('fin-scores').innerHTML = html;

  document
    .getElementById('modal-fin')
    .classList.add('on');
}

// =====================================================
//  IA
// =====================================================
function canPair(v1,v2){

  if(v1===null || v2===null)
    return false;

  return (v1+v2)<=15;
}
function tileValue(t){
  return t.isJoker ? 0 : t.val;
}
function hasPotentialTriolet(pl){

  if(pl.hand.length !== 3)
    return false;

  const sum = pl.hand.reduce(
    (a,t)=>a + tileValue(t),
    0
  );

  return sum === 15;
}
function tryThreeTileMove(pl){

  if(pl.hand.length !== 3)
    return null;

  const vals = pl.hand.map(t =>
    t.isJoker ? 0 : t.val
  );

  const sum =
    vals[0] + vals[1] + vals[2];

  if(sum !== 15)
    return null;

  return true;
}
function tryTwoTileMove(pl){

  for(let h1=0; h1<pl.hand.length; h1++){

    for(let h2=h1+1; h2<pl.hand.length; h2++){

      const v1 = tileValue(pl.hand[h1]);
      const v2 = tileValue(pl.hand[h2]);

      if(v1 + v2 > 15)
        continue;

      return true;
    }
  }

  return false;
}


// ajout 1/7/26
function findTwoTileMove(pl){

    if(pl.hand.length < 2)
        return null;

    let bestMove = null;
    let bestPts = 0;

    for(let h1=0; h1<pl.hand.length; h1++){

        for(let h2=h1+1; h2<pl.hand.length; h2++){

            const t1 = pl.hand[h1];
            const t2 = pl.hand[h2];

            // Horizontal
            for(let r=0;r<15;r++){

                for(let c=0;c<14;c++){

                    if(G.board[r][c]) continue;
                    if(G.board[r][c+1]) continue;

                    G.pend = [
                      {
                        hi:h1,
                        r:r,
                        c:c,
                        val:t1.val,
                        isJoker:t1.isJoker,
                        jokerVal:t1.isJoker ? 0 : null
                      },
                      {
                        hi:h2,
                        r:r,
                        c:c+1,
                        val:t2.val,
                        isJoker:t2.isJoker,
                        jokerVal:t2.isJoker ? 0 : null
                      }
                    ];

                    if(validate().ok){

                        const pts = calcPoints().pts;

                        if(pts > bestPts){

                            bestPts = pts;

                            bestMove = JSON.parse(
                                JSON.stringify(G.pend)
                            );
                        }
                    }

                    G.pend = [];
                }
            }

            // Vertical
            for(let r=0;r<14;r++){

                for(let c=0;c<15;c++){

                    if(G.board[r][c]) continue;
                    if(G.board[r+1][c]) continue;

                    G.pend = [
                      {
                        hi:h1,
                        r:r,
                        c:c,
                        val:t1.val,
                        isJoker:t1.isJoker,
                        jokerVal:t1.isJoker ? 0 : null
                      },
                      {
                        hi:h2,
                        r:r+1,
                        c:c,
                        val:t2.val,
                        isJoker:t2.isJoker,
                        jokerVal:t2.isJoker ? 0 : null
                      }
                    ];

                    if(validate().ok){

                        const pts = calcPoints().pts;

                        if(pts > bestPts){

                            bestPts = pts;

                            bestMove = JSON.parse(
                                JSON.stringify(G.pend)
                            );
                        }
                    }

                    G.pend = [];
                }
            }
        }
    }

    return bestMove;
}
function findThreeTileMove(pl){

    if(pl.hand.length !== 3)
        return null;

    const vals = pl.hand.map(t =>
        t.isJoker ? 0 : t.val
    );

    const sum = vals.reduce((a,b)=>a+b,0);

    if(sum !== 15)
        return null;

    for(let r=0;r<15;r++){

        for(let c=0;c<13;c++){

            if(
                G.board[r][c] ||
                G.board[r][c+1] ||
                G.board[r][c+2]
            ) continue;

            G.pend = [
                {
                    hi:0,
                    r,c,
                    val:pl.hand[0].val,
                    isJoker:pl.hand[0].isJoker,
                    jokerVal:null
                },
                {
                    hi:1,
                    r,c:c+1,
                    val:pl.hand[1].val,
                    isJoker:pl.hand[1].isJoker,
                    jokerVal:null
                },
                {
                    hi:2,
                    r,c:c+2,
                    val:pl.hand[2].val,
                    isJoker:pl.hand[2].isJoker,
                    jokerVal:null
                }
            ];

            if(validate().ok){

                const pts =
                    calcPoints().pts;

                if(pts > 0){

                    const move =
                        JSON.parse(
                          JSON.stringify(G.pend)
                        );

                    G.pend = [];

                    return move;
                }
            }

            G.pend = [];
        }
    }

    return null;
}
function playAIMove(move){

    G.pend = move;
    const res = calcPoints();
    const pts = res.pts;
    const pl = G.joueurs[G.cur];
    res.usedKeys.forEach(
        k => G.usedSp.add(k)
    );

    G.rejouer = res.rejouer;
    pl.score += pts;
    G.passCount = 0;
    G.pend.forEach(p => {
        G.board[p.r][p.c] = {
            val:p.val,
            isJoker:p.isJoker,
            jokerVal:p.jokerVal
        };
    });

    const idxs =
      [...new Set(
        G.pend.map(p => p.hi)
      )]
      .sort((a,b)=>b-a);

    idxs.forEach(i =>
      pl.hand.splice(i,1)
    );

    pl.hand.push(
      ...drawN(G.sac,idxs.length)
    );

  // modif journal 1/7/26
  if(move.length === 3){

    addLog(
      '🎊🎊🎊 TRIOLET DE L IA 🎊🎊🎊',
      'score'
    );
}
  const detail =
  move.map(m =>
    m.isJoker
      ? `X(${m.jokerVal})`
      : m.val
  ).join('-');

if(move.length === 3){

    addLog(
      `🎊 TRIOLET IA [${detail}] → +${pts} pts`,
      'score'
    );

}else if(move.length === 2){

    addLog(
      `⚡ DOUBLE IA [${detail}] → +${pts} pts`,
      'score'
    );

}else{

    addLog(
      `🎯 IA [${detail}] → +${pts} pts`,
      'score'
    );
}
  // fin modif journal 1/7/26

    const rejouerNow = G.rejouer;
    G.pend = [];
    G.first = false;
    G.rejouer = false;
    saveGame();
    if(checkEnd())
        return;

    if(rejouerNow)
        finishTurn({samePlayer:true});
    else
        finishTurn();
}
// fin ajout 1/7/26


function aiTurn(){
  const pl = G.joueurs[G.cur];
  if(!pl || !pl.isAI) return;
  if(pl.hand.length === 0){
	   
    finishTurn();
    return;
  }
  
   // ajout 1/7/26
	  const trioletMove =
    findThreeTileMove(pl);

	if(trioletMove){

		playAIMove(trioletMove);

		return;
	}
	
	const twoTileMove =
    findTwoTileMove(pl);

	if(twoTileMove){

		playAIMove(twoTileMove);

		return;
	}
	  // fin ajout 1/7/26

  
const tryTriolet = hasPotentialTriolet(pl);

  let best = null, bestPts = -1;



const handOrder =
  pl.hand.map((_,i)=>i);
  
for(const hi of handOrder){

    const tok = pl.hand[hi];

    if(!tok)
        continue;

    for(let r = 0; r < 15; r++){
      for(let c = 0; c < 15; c++){
        if(G.board[r][c]) continue;
        if(!everyonePlayedOnce() && !(r===7 && c===7) && G.board[7][7]===null) continue;
        if(G.board[7][7]!==null && !adjFixed(r,c)) continue;

        const jokerVals = tok.isJoker ? [...Array(16).keys()] : [null];

        for(const jv of jokerVals){
          G.pend = [{
            hi, r, c,
            val: tok.val,
            isJoker: tok.isJoker,
            jokerVal: tok.isJoker ? jv : null
          }];

          if(validate().ok){
            const res = calcPoints();
            const pts = res.pts;



let evalScore = pts;

const sp = SPECS[r + ',' + c];

if(sp === 'T')
    evalScore += 15;

if(sp === 'D' || sp === 'C')
    evalScore += 8;

if(sp === 'R')
    evalScore += 12;

if(evalScore > bestPts){

    bestPts = evalScore;

    best = {
      hi,
      r,
      c,
      val: tok.val,
      isJoker: tok.isJoker,
      jokerVal: tok.isJoker ? jv : null
    };
}
          }

          G.pend = [];
        }
      }
    }
  }

  if(best){
    G.pend = [{...best}];

    const res = calcPoints();
    const pts = res.pts;
    res.usedKeys.forEach(k => G.usedSp.add(k));
    G.rejouer = res.rejouer;

    pl.score += pts;
    addLog(`🤖 ${pl.name} → ${String.fromCharCode(65+best.r)}${best.c+1} +${pts} pts → Total ${pl.score}`,'score');

    G.board[best.r][best.c] = {
      val: best.val,
      isJoker: best.isJoker,
      jokerVal: best.jokerVal
    };

    pl.hand.splice(best.hi, 1);
    pl.hand.push(...drawN(G.sac, 1));

    const rejouerNow = G.rejouer;
    G.pend = [];
    G.first = false;
    G.rejouer = false;

    saveGame();
    if(checkEnd()) return;

    if(rejouerNow){
      finishTurn({samePlayer:true});
    }else{
      finishTurn();
    }
  }else{

    if(G.sac.length === 0){

    addLog(
      `🤖 ${pl.name} ne trouve aucun coup et passe`,
      'i'
    );

    G.passCount++;

    if(G.passCount >= G.joueurs.length){

        G.over = true;

        saveGame();

        showEnd();

        return;
    }

    saveGame();

    finishTurn();

    return;
}

    if(pl.hand.length > 0){

        const idx =
          Math.floor(Math.random() * pl.hand.length);

        const t = pl.hand.splice(idx,1);

        G.sac.push(...t);

        shuffle(G.sac);

        pl.hand.push(...drawN(G.sac,1));

        addLog(
          `🤖 ${pl.name} échange un jeton`,
          'i'
        );
    }

    saveGame();
    finishTurn();
}

}



// =====================================================
//  RENDU
// =====================================================
function render(){
  renderBoard();
  renderHand();
  renderScores
  renderDistribution();
  
  document.getElementById('sac-ct').textContent=G.sac.length;
  const pl=G.joueurs[G.cur];
  document.getElementById('turn-name').textContent=
    (pl.isAI?'🤖 ':'')+pl.name;
}

function renderBoard(){
  const bd=document.getElementById('board');
  bd.innerHTML='';

  for(let r=0;r<15;r++){
    for(let c=0;c<15;c++){
      const cell=document.createElement('div');
      cell.className='cell';

      const sp=SPECS[r+','+c];
      const used=G.usedSp.has(r+','+c);
      if(!used&&sp)cell.classList.add('sp-'+sp);

      const boardTok=G.board[r][c];
      const pendTok=G.pend.find(p=>p.r===r&&p.c===c);

      // Afficher le label de la case spéciale UNIQUEMENT si la case est vraiment vide
      // (pas de jeton placé ET pas de jeton en préparation)
      if(!used&&sp&&!boardTok&&!pendTok){
        const lbl=document.createElement('div');
        lbl.className='cell-lbl';
        if(sp==='R'){
          lbl.innerHTML=
            `<svg viewBox="0 0 24 24" fill="white" opacity="0.92">
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69
              6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58
              8-8-3.58-8-8-8z"/>
            </svg>`;
        }else{
          const txt=document.createElement('span');
          txt.className='cell-lbl-text';
          txt.textContent=(sp==='D'||sp==='C')?'×2':'×3';
          lbl.appendChild(txt);
        }
        cell.appendChild(lbl);
      }

      if(boardTok){
        cell.appendChild(makeTok(boardTok,false));
      }else if(pendTok){
        const tk=makeTok(
          {val:pendTok.val,isJoker:pendTok.isJoker,jokerVal:pendTok.jokerVal},
          true
        );
        cell.appendChild(tk);
        cell.addEventListener('click',()=>removePend(r,c));
      }else{
        if(selIdx!==null&&!G.joueurs[G.cur].isAI){
          const canPlace = G.first
            ? (r===7&&c===7)
            : (adjFixed(r,c) || G.pend.some(p=>Math.abs(p.r-r)+Math.abs(p.c-c)===1));
          if(canPlace)cell.classList.add('placeable');
        }
        cell.addEventListener('click',()=>onCellClick(r,c));
      }
      bd.appendChild(cell);
    }
  }
}

function makeTok(t,isPend){
  const div=document.createElement('div');
  div.className='tok'+(t.isJoker?' joker':'')+(isPend?' pending':'');
  if(t.isJoker){
    div.textContent='X';
    if(t.jokerVal!==null&&t.jokerVal!==undefined){
      const cor=document.createElement('span');
      cor.className='jcorner';
      cor.textContent=t.jokerVal;
      div.appendChild(cor);
    }
  }else{
    div.textContent=t.val;
  }
  return div;
}

function renderHand(){
  const ct=document.getElementById('hand-tokens');
  ct.innerHTML='';
  const pl=G.joueurs[G.cur];

  if(pl.isAI){
    ct.innerHTML=
      '<span style="color:#94a3b8;font-size:.85rem;display:block;text-align:center;">'
      +'🤖 L\'IA réfléchit…</span>';
    return;
  }

  const usedHi=new Set(G.pend.map(p=>p.hi));
  const slots=Math.max(3,pl.hand.length);
  for(let i=0;i<slots;i++){
    const div=document.createElement('div');
    if(i>=pl.hand.length||usedHi.has(i)){
      div.className='htok ghost';
    }else{
      const t=pl.hand[i];
      div.className='htok'+(t.isJoker?' joker':'')+(selIdx===i?' sel':'');
      div.textContent=t.isJoker?'X':t.val;
      div.addEventListener('click',()=>selectTok(i));
    }
    ct.appendChild(div);
  }
}

function renderScores(){
  document.getElementById('scores-list').innerHTML=
    G.joueurs.map((j,i)=>
      `<div class="srow">
         <span class="${i===G.cur?'cur':''}">
           ${j.isAI?'🤖':'👤'} ${j.name} ${i===G.cur?'◀':''}
         </span>
         <span class="pts">${j.score}</span>
       </div>`
    ).join('');
}

// rendu de la distribution des jetons
function renderDistribution(){

    if(!G) return;

    const remain = {};

    Object.keys(DISTRIB).forEach(v=>{
        remain[v] = DISTRIB[v];
    });

    let jokerRemain = 2;

    G.board.forEach(row=>{
        row.forEach(t=>{

            if(!t) return;

            if(t.isJoker){
                jokerRemain--;
            }else{
                remain[t.val]--;
            }
        });
    });

    G.pend.forEach(t=>{

        if(t.isJoker){
            jokerRemain--;
        }else{
            remain[t.val]--;
        }
    });

    let html = '';

    for(let v=0; v<=15; v++){

        html += `
        <div class="dist-tile ${remain[v]===0?'dist-empty':''}">
            <span class="dist-main">${v}</span>

             <span class="dist-remain">
                ${remain[v]}
            </span>
			<span class="dist-total">
                ${DISTRIB[v]}
            </span>

          
        </div>`;
    }

    html += `
    <div class="dist-tile dist-joker ${jokerRemain===0?'dist-empty':''}">
        <span class="dist-main">X</span>



        <span class="dist-remain">
            ${jokerRemain}
        </span>
		        <span class="dist-total">2</span>
				
    </div>`;

    const zone =
        document.getElementById(
            'tile-distribution'
        );

    if(zone){
        zone.innerHTML = html;
    }
}

// =====================================================
//  INTERACTIONS
// =====================================================
function selectTok(i){
  if(G.over)return;
  if(G.joueurs[G.cur].isAI)return;
  if(G.pend.some(p=>p.hi===i))return;
  selIdx=(selIdx===i)?null:i;
  render();
}

function onCellClick(r,c){
  if(G.over)return;
  if(G.joueurs[G.cur].isAI)return;
  if(selIdx===null){addLog('Sélectionnez d\'abord un jeton','b');return;}
  if(G.board[r][c])return;
  if(G.pend.some(p=>p.r===r&&p.c===c))return;

  const pl=G.joueurs[G.cur];
  const tok=pl.hand[selIdx];

  if(tok.isJoker){
    const cap=selIdx;
    openJoker(jv=>{
      G.pend.push({hi:cap,r,c,val:null,isJoker:true,jokerVal:jv});
      selIdx=null;render();
    });
  }else{
    G.pend.push({hi:selIdx,r,c,val:tok.val,isJoker:false,jokerVal:null});
    selIdx=null;render();
  }
}

function removePend(r,c){
  const i=G.pend.findIndex(p=>p.r===r&&p.c===c);
  if(i>-1){G.pend.splice(i,1);selIdx=null;render();}
}

// ── Joker ──
function openJoker(cb){
  jokerCB=cb;
  const grid=document.getElementById('jgrid');
  grid.innerHTML='';
  for(let v=0;v<=15;v++){
    const d=document.createElement('div');
    d.className='jval';d.textContent=v;
    d.addEventListener('click',()=>{
      document.getElementById('modal-joker').classList.remove('on');
      jokerCB=null;cb(v);
    });
    grid.appendChild(d);
  }
  document.getElementById('modal-joker').classList.add('on');
}

// ── Échange ──
function openEch(){
  if(G.joueurs[G.cur].isAI)return;
  if(G.pend.length>0){addLog('Annulez vos placements avant d\'échanger','b');return;}
if(G.sac.length < 5){
    addLog(
      "❌ Échange interdit : moins de 5 jetons dans le sac",
      "b"
    );
    return;
}
  echSel=[];
  const pl=G.joueurs[G.cur];
  const ct=document.getElementById('ech-toks');
  ct.innerHTML='';

  // FIX: Calculer le nombre max d'échanges possibles
  // = min(3 jetons à la main, jetons disponibles dans le sac)
  const maxEch=Math.min(3,G.sac.length);

  pl.hand.forEach((t,i)=>{
    const d=document.createElement('div');
    d.className='htok'+(t.isJoker?' joker':'');
    d.textContent=t.isJoker?'X':t.val;
    d.style.cursor='pointer';
    d.addEventListener('click',()=>{
      const idx=echSel.indexOf(i);
      if(idx>-1){echSel.splice(idx,1);d.classList.remove('sel');}
      else if(echSel.length<maxEch){echSel.push(i);d.classList.add('sel');}
    });
    ct.appendChild(d);
  });
  document.getElementById('modal-ech').classList.add('on');
}

function confirmEch(){
  const pl=G.joueurs[G.cur];

  if(echSel.length===0){
    addLog(`⏭️ ${pl.name} passe son tour`,'i');
    document.getElementById('modal-ech').classList.remove('on');
    echSel=[];
    saveGame();
    finishTurn();
    return;
  }

  const sorted=[...echSel].sort((a,b)=>b-a);
  const removed=sorted.map(i=>pl.hand.splice(i,1)[0]);
  G.sac.push(...removed);shuffle(G.sac);
  pl.hand.push(...drawN(G.sac,removed.length));
  addLog(`🔄 Échange de ${removed.length} jeton(s)`,'i');
  document.getElementById('modal-ech').classList.remove('on');
  echSel=[];
  saveGame();
  finishTurn();
}

// ── Journal ──
function addLog(msg,type){
  if(logMode==='min'&&type!=='score'&&type!=='b')return;
  const box=document.getElementById('logbox');
  const p=document.createElement('p');
  p.textContent=msg;
  p.className={score:'lg',g:'lg',b:'lb',i:'li',p:'lp'}[type]||'';
  box.prepend(p);
  while(box.children.length>40)box.removeChild(box.lastChild);
}
function setLog(mode){
  logMode=mode;
  document.getElementById('btn-ld').classList.toggle('on',mode==='detail');
  document.getElementById('btn-lm').classList.toggle('on',mode==='min');
}

// =====================================================
//  LOBBY — Configuration joueurs
// =====================================================
function buildPlayersConfig(){
  const ct=document.getElementById('players-config');
  ct.innerHTML='';

  // S'assurer que playersConfig a le bon nombre d'entrées
  while(playersConfig.length<nbPlayers){
    const i=playersConfig.length;
    playersConfig.push({
      name: i===0?'Joueur':`IA ${i}`,
      isAI: i>0
    });
  }
  playersConfig=playersConfig.slice(0,nbPlayers);

  playersConfig.forEach((cfg,i)=>{
    const row=document.createElement('div');
    row.className='player-row';

    // Numéro
    const num=document.createElement('div');
    num.className='player-num';
    num.textContent=i+1;

    // Nom
    const inp=document.createElement('input');
    inp.className='player-name-inp';
    inp.type='text';
    inp.maxLength=12;
    inp.placeholder=cfg.isAI?`IA ${i+1}`:`Joueur ${i+1}`;
    inp.value=cfg.name;
    inp.addEventListener('input',()=>{playersConfig[i].name=inp.value;});

    // Toggle Humain / IA
    const tog=document.createElement('div');
    tog.className='type-toggle';

    const btnH=document.createElement('button');
    btnH.className='type-btn'+(cfg.isAI?'':' on');
    btnH.textContent='👤';
    btnH.title='Humain';

    const btnAI=document.createElement('button');
    btnAI.className='type-btn'+(cfg.isAI?' on':'');
    btnAI.textContent='🤖';
    btnAI.title='IA';

    btnH.addEventListener('click',()=>{
      playersConfig[i].isAI=false;
      btnH.classList.add('on');
      btnAI.classList.remove('on');
      inp.placeholder=`Joueur ${i+1}`;
      if(!inp.value||inp.value.startsWith('IA'))
        {inp.value=`Joueur ${i+1}`;playersConfig[i].name=inp.value;}
    });
    btnAI.addEventListener('click',()=>{
      playersConfig[i].isAI=true;
      btnAI.classList.add('on');
      btnH.classList.remove('on');
      inp.placeholder=`IA ${i+1}`;
      if(!inp.value||inp.value.startsWith('Joueur'))
        {inp.value=`IA ${i+1}`;playersConfig[i].name=inp.value;}
    });

    tog.appendChild(btnH);
    tog.appendChild(btnAI);
    row.appendChild(num);
    row.appendChild(inp);
    row.appendChild(tog);
    ct.appendChild(row);
  });
}
function prepareStartDraw(){

    let bestValue = -1;
    let winnerIndex = 0;

    const rows = [];

    G.joueurs.forEach((j,i)=>{

        const highest = Math.max(
            ...j.hand.map(t => t.isJoker ? -1 : t.val)
        );

        rows.push({
            player:j,
            highest
        });

        if(highest > bestValue){
            bestValue = highest;
            winnerIndex = i;
        }
    });

    G.cur = winnerIndex;
    G.startPlayer = winnerIndex;

    const ct = document.getElementById('start-draw-results');

    ct.innerHTML = rows.map(r=>`
        <div class="start-row">
            <span class="start-player">
                ${r.player.isAI ? '🤖' : '👤'} ${r.player.name}
            </span>

            <div class="start-token">
                ${r.highest < 0 ? 'X' : r.highest}
            </div>
        </div>
    `).join('');

    document.getElementById('start-winner').innerHTML =
        `🏆 ${G.joueurs[winnerIndex].name} commence avec ${bestValue}`;

    document.getElementById('modal-start')
        .classList.add('on');
}
// =====================================================
//  INIT
// =====================================================
document.addEventListener('DOMContentLoaded',()=>{

  // Construire coordonnées
  function buildCoords(){
    const cc=document.getElementById('cc');
    const cr=document.getElementById('cr');
    if(cc.children.length)return;
    for(let i=1;i<=15;i++){
      const s=document.createElement('span');s.textContent=i;cc.appendChild(s);
    }
    for(let i=0;i<15;i++){
      const s=document.createElement('span');
      s.textContent=String.fromCharCode(65+i);cr.appendChild(s);
    }
  }

  // Boutons nombre de joueurs
  document.querySelectorAll('.nb-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      nbPlayers=parseInt(btn.dataset.nb);
      document.querySelectorAll('.nb-btn').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      buildPlayersConfig();
    });
  });

  // Config initiale
  buildPlayersConfig();

  // JOUER
  document.getElementById('btn-jouer').addEventListener('click',()=>{
    // Récupérer les noms depuis les inputs
    document.querySelectorAll('.player-name-inp').forEach((inp,i)=>{
      playersConfig[i].name=inp.value.trim()||
        (playersConfig[i].isAI?`IA ${i+1}`:`Joueur ${i+1}`);
    });

    G=newGame(playersConfig.slice(0,nbPlayers));

    document.getElementById('screen-lobby').style.display='none';
    document.getElementById('screen-game').style.display='block';

    buildCoords();
	prepareStartDraw();
  });

  // VALIDER
  document.getElementById('btn-valider').addEventListener('click',()=>{
    if(!G||G.over)return;
    if(G.joueurs[G.cur].isAI){addLog('Ce n\'est pas votre tour','b');return;}
    playMove();
  });

  // ANNULER
  document.getElementById('btn-annuler').addEventListener('click',()=>{
    if(!G)return;
    G.pend=[];selIdx=null;render();
  });

  // ÉCHANGER
  document.getElementById('btn-echanger').addEventListener('click',()=>{
    if(!G||G.over)return;
    openEch();
  });

  // QUITTER
  document.getElementById('btn-quitter').addEventListener('click',()=>{
    clearSavedGame();
    location.reload();
  });

  // JOKER annuler
  document.getElementById('btn-joker-cancel').addEventListener('click',()=>{
    document.getElementById('modal-joker').classList.remove('on');
    jokerCB=null;selIdx=null;
    if(G)render();
  });

  // ÉCHANGE
  document.getElementById('btn-ech-ok').addEventListener('click',confirmEch);
  document.getElementById('btn-ech-no').addEventListener('click',()=>{
    document.getElementById('modal-ech').classList.remove('on');echSel=[];
  });

  // FIN
  document.getElementById('btn-rejouer').addEventListener('click',()=>{
    clearSavedGame();
    location.reload();
  });

  document
  .getElementById('btn-start-game')
  .addEventListener('click',()=>{

      document
        .getElementById('modal-start')
        .classList.remove('on');

      addLog(
        '🎮 '+
        G.joueurs.map(j=>j.name).join(' vs ')+
        ' — Bonne partie !',
        'g'
      );

      addLog(
        `🎲 ${G.joueurs[G.cur].name} commence`,
        'g'
      );

      addLog(
        '📦 '+G.sac.length+' jetons dans le sac',
        'i'
      );

      saveGame();
      render();

      if(G.joueurs[G.cur].isAI)
          setTimeout(aiTurn,800);
  });
  // JOURNAL
  document.getElementById('btn-ld').addEventListener('click',()=>setLog('detail'));
  document.getElementById('btn-lm').addEventListener('click',()=>setLog('min'));

  // ── CHARGEMENT PARTIE SAUVEGARDÉE ──
  const saved=loadGame();
  if(saved){
    // Une partie est en cours
    G=saved;
    document.getElementById('screen-lobby').style.display='none';
    document.getElementById('screen-game').style.display='block';
    buildCoords();
    addLog('📥 Partie restaurée !','g');
    render();
    if(!G.over&&G.joueurs[G.cur].isAI)setTimeout(aiTurn,800);
  }
});
