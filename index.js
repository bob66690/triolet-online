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
let logMode = 'min';
let pendingStartConfigs = null;
let startPlayerIndex = 0;
let drawState = null;

// Config lobby
let nbPlayers = 2;
let playersConfig = [
  {name:'Joueur', isAI:false},
  {name:'IA',     isAI:true}
];

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
  let total=0;
  const lines=affectedLines();
  const hasJok=G.pend.some(p=>p.isJoker);

  // ── Cas : 1 seul jeton posé sans voisin ──
  if(G.pend.length===1&&lines.length===0){
    const p=G.pend[0];
    const sp=specAt(p.r,p.c);
    const sv=scoreVal({val:p.val,isJoker:p.isJoker,jokerVal:p.jokerVal});

    if(sp==='C'||sp==='D'){
      const pts=sv*2;
      G.usedSp.add(p.r+','+p.c);
      total+=pts;
      addLog(p.isJoker
        ?`Joker sur ×2 : 0×2 = 0 pt`
        :`Case ×2 : ${sv}×2 = ${pts} pts`,'p');
    }else if(sp==='T'){
      const pts=sv*3;
      G.usedSp.add(p.r+','+p.c);
      total+=pts;
      addLog(p.isJoker
        ?`Joker sur ×3 : 0×3 = 0 pt`
        :`Case ×3 : ${sv}×3 = ${pts} pts`,'p');
    }else{
      addLog(`Jeton posé seul — 0 pt`,'i');
    }
    if(sp==='R'){
      G.usedSp.add(p.r+','+p.c);
      G.rejouer=true;
      addLog('🔁 Case Rejouer !','g');
    }
    return total;
  }

  // ── Détection Triolet ──
  // 3 jetons TOUS nouveaux, même ligne, somme=15, SANS joker
  let isTriolet=false,trioletLineId=-1;
  if(G.pend.length===3&&!hasJok){
    lines.forEach((line,idx)=>{
      if(line.length!==3)return;
      const allNew=line.every(l=>G.pend.some(p=>p.r===l.r&&p.c===l.c));
      if(!allNew)return;
      const sum=line.map(l=>ev(l.tok)).reduce((a,b)=>a+b,0);
      if(sum===15){isTriolet=true;trioletLineId=idx;}
    });
  }

  // ── Calcul ligne par ligne ──
  lines.forEach((line,lineIdx)=>{
    const len=line.length;
    const evVals=line.map(l=>ev(l.tok));
    const evSum=evVals.reduce((a,b)=>a+b,0);

    if(len===3&&evSum===15){
      // ════════════════════════════════════════
      //  TRIO — règle officielle :
      //  Le trio vaut 30 pts de base.
      //  Si UN des jetons posés est sur case ×2 → 30×2 = 60
      //  Si UN des jetons posés est sur case ×3 → 30×3 = 90
      //  La case spéciale s'applique au TRIO ENTIER (pas au jeton seul)
      //  Un seul multiplicateur par trio (le plus grand disponible)
      // ════════════════════════════════════════
      let mult=1;
      let spKey=null;

      // Chercher la meilleure case spéciale parmi les jetons
      // NOUVEAUX de cette ligne (au choix du joueur → on prend le max)
      for(const p of G.pend){
        if(!line.some(l=>l.r===p.r&&l.c===p.c))continue;
        const sp=specAt(p.r,p.c);
        if((sp==='D'||sp==='C')&&mult<2){
          mult=2;spKey=p.r+','+p.c;
        }
        if(sp==='T'&&mult<3){
          mult=3;spKey=p.r+','+p.c;
        }
      }

      let pts=30*mult;
      let msg=`Trio (${evVals.join('+')}=15)`;
      if(mult>1) msg+=` sur case ×${mult}`;
      msg+=` = ${30*mult} pts`;

      // Bonus Triolet (seulement si pas de joker)
      if(isTriolet&&lineIdx===trioletLineId&&!hasJok){
        pts+=50;
        msg=`🎉 TRIOLET ! ${msg} + 50 bonus = ${pts} pts`;
      }else if(hasJok){
        msg+=` (joker inclus — pas de bonus triolet)`;
      }

      // Marquer la case spéciale comme utilisée
      if(spKey)G.usedSp.add(spKey);

      total+=pts;
      addLog(msg,'p');

    }else if(len===2){
      // ════════════════════════════════════════
      //  PAIRE — règle officielle :
      //  Somme des scoreVal (joker = 0)
      //  La case spéciale s'applique UNIQUEMENT
      //  sur la valeur du jeton nouvellement posé
      //  (pas sur la somme totale)
      // ════════════════════════════════════════
      let pts=0;
      const detail=[];

      line.forEach(item=>{
        const sv=scoreVal(item.tok); // 0 si joker
        const isNew=G.pend.some(p=>p.r===item.r&&p.c===item.c);

        if(isNew){
          const sp=specAt(item.r,item.c);
          if(sp==='D'||sp==='C'){
            pts+=sv*2;
            G.usedSp.add(item.r+','+item.c);
            detail.push(item.tok.isJoker?`X(×2=0)`:`${sv}×2=${sv*2}`);
          }else if(sp==='T'){
            pts+=sv*3;
            G.usedSp.add(item.r+','+item.c);
            detail.push(item.tok.isJoker?`X(×3=0)`:`${sv}×3=${sv*3}`);
          }else{
            pts+=sv;
            detail.push(item.tok.isJoker?`X(=0)`:`${sv}`);
          }
        }else{
          // Jeton déjà en place : sa valeur brute (scoreVal)
          pts+=sv;
          detail.push(`${sv}`);
        }
      });

      total+=pts;
      addLog(`Paire (${detail.join('+')} = ${pts} pts)`,'i');
    }
    // len===1 seul dans une ligne : pas de points (déjà géré plus haut)
  });

  // ── Case Rejouer ──
  G.pend.forEach(p=>{
    if(specAt(p.r,p.c)==='R'){
      G.usedSp.add(p.r+','+p.c);
      G.rejouer=true;
      addLog('🔁 Case Rejouer !','g');
    }
  });

  return total;
}

// =====================================================
//  JOUER UN COUP
// =====================================================
function playMove(){
  const v=validate();
  if(!v.ok){addLog('❌ '+v.msg,'b');return;}

  const pts=calcPoints();
  const pl=G.joueurs[G.cur];
  pl.score+=pts;
  addLog(`✅ ${pl.name} : +${pts} pt${pts!==1?'s':''} → Total ${pl.score}`,'score');

  G.pend.forEach(p=>{
    G.board[p.r][p.c]={val:p.val,isJoker:p.isJoker,jokerVal:p.jokerVal};
  });
  const idxs=[...new Set(G.pend.map(p=>p.hi))].sort((a,b)=>b-a);
  idxs.forEach(i=>pl.hand.splice(i,1));
  pl.hand.push(...drawN(G.sac,idxs.length));

  const rejouer=G.rejouer;
  G.pend=[];selIdx=null;G.first=false;G.rejouer=false;

  if(checkEnd())return;
  if(rejouer){
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
  const sorted=[...G.joueurs].sort((a,b)=>b.score-a.score);
  const medals=['🥇','🥈','🥉','4️⃣'];
  document.getElementById('fin-scores').innerHTML=
    sorted.map((j,i)=>
      `<div class="finrow">
         <span>${medals[i]} ${j.name}</span>
         <span class="finpts">${j.score} pts</span>
       </div>`
    ).join('');
  document.getElementById('modal-fin').classList.add('on');
}

// =====================================================
//  IA
// =====================================================
function aiTurn(){
  const pl=G.joueurs[G.cur];
  if(!pl||!pl.isAI)return;
  if(pl.hand.length===0){finishTurn();return;}

  let best=null,bestPts=-1;
  const usedSpBackup=new Set(G.usedSp);

  for(let hi=0;hi<pl.hand.length;hi++){
    const tok=pl.hand[hi];
    for(let r=0;r<15;r++){
      for(let c=0;c<15;c++){
        if(G.board[r][c])continue;
        if(G.board[7][7]===null&&!(r===7&&c===7))continue;
        if(G.board[7][7]!==null&&!adjFixed(r,c))continue;

        const jokerVals=tok.isJoker
          ?[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
          :[null];

        for(const jv of jokerVals){
          G.pend=[{
            hi,r,c,
            val:tok.val,isJoker:tok.isJoker,
            jokerVal:tok.isJoker?jv:null
          }];

          if(validate().ok){
            const pts=calcPoints();
            G.usedSp=new Set(usedSpBackup);
            G.rejouer=false;

            if(pts>bestPts){
              bestPts=pts;
              best={hi,r,c,val:tok.val,isJoker:tok.isJoker,
                    jokerVal:tok.isJoker?jv:null};
            }
          }else{
            G.usedSp=new Set(usedSpBackup);
            G.rejouer=false;
          }

          G.pend=[];
        }
      }
    }
  }

  if(best){
    G.pend=[{...best}];
    const pts=calcPoints();
    pl.score+=pts;
    addLog(`🤖 ${pl.name} → ${String.fromCharCode(65+best.r)}${best.c+1} +${pts} pts → Total ${pl.score}`,'score');

    G.board[best.r][best.c]={val:best.val,isJoker:best.isJoker,jokerVal:best.jokerVal};
    pl.hand.splice(best.hi,1);
    pl.hand.push(...drawN(G.sac,1));

    const rejouer=G.rejouer;
    G.pend=[];G.first=false;G.rejouer=false;

    if(checkEnd())return;
    if(rejouer){finishTurn({samePlayer:true});}
    else finishTurn();

  }else{
    if(G.sac.length>=5&&pl.hand.length>0){
      const idx=Math.floor(Math.random()*pl.hand.length);
      const t=pl.hand.splice(idx,1);
      G.sac.push(...t);shuffle(G.sac);
      pl.hand.push(...drawN(G.sac,1));
      addLog(`🤖 ${pl.name} échange`,'i');
    }else{
      addLog(`🤖 ${pl.name} passe`,'i');
    }
    finishTurn();
  }
}
 

// =====================================================
//  RENDU
// =====================================================
function render(){
  renderBoard();
  renderHand();
  renderScores();
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

      if(!used&&sp){
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
          const canPlace = G.board[7][7]===null
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
  if(G.sac.length<5){addLog('Il faut ≥5 jetons dans le sac pour échanger','b');return;}

  echSel=[];
  const pl=G.joueurs[G.cur];
  const ct=document.getElementById('ech-toks');
  ct.innerHTML='';

  pl.hand.forEach((t,i)=>{
    const d=document.createElement('div');
    d.className='htok'+(t.isJoker?' joker':'');
    d.textContent=t.isJoker?'X':t.val;
    d.style.cursor='pointer';
    d.addEventListener('click',()=>{
      const idx=echSel.indexOf(i);
      if(idx>-1){echSel.splice(idx,1);d.classList.remove('sel');}
      else if(echSel.length<3){echSel.push(i);d.classList.add('sel');}
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


function buildStartBag(){
  const sac=[];
  Object.entries(DISTRIB).forEach(([v,q])=>{
    for(let i=0;i<q;i++) sac.push({val:parseInt(v),isJoker:false,jokerVal:null});
  });
  sac.push({val:null,isJoker:true,jokerVal:null});
  sac.push({val:null,isJoker:true,jokerVal:null});
  shuffle(sac);
  sac.splice(0,3);
  return sac;
}

function tokLabel(t){
  return t.isJoker?'X':String(t.val);
}

function renderDrawScreen(){
  const list=document.getElementById('draw-list');
  const status=document.getElementById('draw-status');
  const btnRun=document.getElementById('btn-draw-run');
  const btnStart=document.getElementById('btn-draw-start');
  if(!list||!drawState)return;

  list.innerHTML='';
  drawState.entries.forEach((e,idx)=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #334155;border-radius:10px;background:#0f172a;';
    const left=document.createElement('div');
    left.style.cssText='display:flex;align-items:center;gap:10px;min-width:0;';
    const badge=document.createElement('div');
    badge.style.cssText='width:28px;height:28px;border-radius:50%;background:#334155;color:#fbbf24;font-weight:700;font-size:.85rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    badge.textContent=idx+1;
    const name=document.createElement('div');
    name.style.color='#e2e8f0';
    name.textContent=(e.cfg.isAI?'🤖 ':'👤 ')+e.cfg.name;
    left.appendChild(badge);left.appendChild(name);

    const right=document.createElement('div');
    right.style.cssText='display:flex;align-items:center;gap:10px;';
    const tok=document.createElement('div');
    tok.className='htok'+(e.drawn&&e.drawn.isJoker?' joker':'');
    tok.style.minWidth='48px';
    tok.textContent=e.drawn?tokLabel(e.drawn):'?';
    const val=document.createElement('div');
    val.style.cssText='color:#94a3b8;font-size:.9rem;min-width:44px;text-align:right;';
    val.textContent=e.drawn?(e.drawn.isJoker?'joker':e.drawn.val):'—';
    right.appendChild(tok);right.appendChild(val);

    row.appendChild(left);row.appendChild(right);list.appendChild(row);
  });

  status.textContent=drawState.message||'';
  btnRun.style.display=drawState.ready?'none':'inline-block';
  btnStart.style.display=drawState.ready?'inline-block':'none';
}

function runStartDraw(){
  if(!drawState)return;

  const active=drawState.entries.filter(e=>drawState.active.has(e.idx));
  const pool=drawState.pool;

  active.forEach(e=>{
    e.drawn=pool.splice(-1,1)[0];
  });

  const numeric=active.map(e=>({idx:e.idx,val:e.drawn.isJoker?-1:e.drawn.val}));
  const best=Math.max(...numeric.map(x=>x.val));
  const winners=numeric.filter(x=>x.val===best).map(x=>x.idx);

  if(winners.length===1){
    startPlayerIndex=winners[0];
    drawState.ready=true;
    drawState.message=`${drawState.entries[startPlayerIndex].cfg.name} commence avec ${best}.`;
    renderDrawScreen();
  }else{
    drawState.message=`Égalité à ${best}. Nouveau tirage entre ${winners.map(i=>drawState.entries[i].cfg.name).join(', ')}.`;
    drawState.active=new Set(winners);
    renderDrawScreen();
  }
}

function beginStartDraw(configs){
  pendingStartConfigs=configs.map(c=>({...c}));
  drawState={
    pool: buildStartBag(),
    entries: pendingStartConfigs.map((cfg,idx)=>({idx,cfg,drawn:null})),
    active: new Set(pendingStartConfigs.map((_,idx)=>idx)),
    ready:false,
    message:''
  };
  document.getElementById('screen-lobby').style.display='none';
  document.getElementById('screen-draw').style.display='block';
  document.getElementById('screen-game').style.display='none';
  renderDrawScreen();
}

function startGameAfterDraw(){
  if(!drawState||!drawState.ready||!pendingStartConfigs)return;

  G=newGame(pendingStartConfigs.slice(0,nbPlayers));
  G.cur=startPlayerIndex;

  G.joueurs.forEach((j,i)=>{
    if(drawState.entries[i].drawn) j.hand.unshift(drawState.entries[i].drawn);
  });

  document.getElementById('screen-draw').style.display='none';
  document.getElementById('screen-game').style.display='block';

  buildCoords();
  render();

  addLog('🎮 '+G.joueurs.map(j=>j.name).join(' vs ')+' — Bonne partie !','g');
  addLog(`🎲 ${drawState.entries[startPlayerIndex].cfg.name} commence après le tirage au sort`,'i');
  addLog('📦 '+G.sac.length+' jetons dans le sac','i');

  if(G.joueurs[G.cur].isAI)setTimeout(aiTurn,800);
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

    beginStartDraw(playersConfig.slice(0,nbPlayers));
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

  // TIRAGE AU SORT
  document.getElementById('btn-draw-run').addEventListener('click',runStartDraw);
  document.getElementById('btn-draw-start').addEventListener('click',startGameAfterDraw);

  // ÉCHANGER
  document.getElementById('btn-echanger').addEventListener('click',()=>{
    if(!G||G.over)return;
    openEch();
  });

  // QUITTER
  document.getElementById('btn-quitter').addEventListener('click',()=>location.reload());

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
  document.getElementById('btn-rejouer').addEventListener('click',()=>location.reload());

  // JOURNAL
  document.getElementById('btn-ld').addEventListener('click',()=>setLog('detail'));
  document.getElementById('btn-lm').addEventListener('click',()=>setLog('min'));
});
