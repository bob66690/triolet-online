// =====================================================
//  TRIOLET ONLINE – index.js  (version corrigée)
// =====================================================

// Distribution officielle
const DISTRIB = {
  0:9,1:9,2:8,3:8,4:7,5:8,6:6,
  7:6,8:4,9:4,10:3,11:3,12:2,13:2,14:1,15:1
};

// Cases spéciales (coordonnées officielles du plateau)
function makeSpecials() {
  const m = {};
  const RC = s => {
    const r = s.charCodeAt(0)-65;
    const c = parseInt(s.slice(1))-1;
    return [r,c];
  };
  [['A8','R'],['B2','R'],['B14','R'],['H1','R'],['H15','R'],['N2','R'],['N14','R'],['O8','R'],
   ['D8','D'],['E5','D'],['E11','D'],['H4','D'],['H12','D'],['K5','D'],['K11','D'],['L8','D'],
   ['B5','T'],['B11','T'],['E2','T'],['E14','T'],['K2','T'],['K14','T'],['N5','T'],['N11','T'],
   ['H8','C']
  ].forEach(([s,t])=>{const[r,c]=RC(s);m[r+','+c]=t;});
  return m;
}
const SPECS = makeSpecials();

// ─── ÉTAT ───
let G          = null;
let selIdx     = null;   // index du jeton sélectionné dans la main
let echSel     = [];     // sélection pour l'échange
let jokerCB    = null;   // callback joker
let logMode    = 'detail';

// ─── CRÉATION DE PARTIE ───
function newGame(players){
  const sac=[];
  Object.entries(DISTRIB).forEach(([v,q])=>{
    for(let i=0;i<q;i++) sac.push({val:parseInt(v),isJoker:false,jokerVal:null});
  });
  sac.push({val:null,isJoker:true,jokerVal:null});
  sac.push({val:null,isJoker:true,jokerVal:null});
  rnd(sac);
  sac.splice(0,3); // retirer 3 face cachée

  const joueurs=players.map((n,i)=>({
    name:n, score:0,
    hand:sac.splice(-3,3),
    isAI: i>0
  }));

  return {
    board: Array(15).fill(null).map(()=>Array(15).fill(null)),
    sac, joueurs,
    cur: 0,
    first: true,       // premier coup ?
    usedSp: new Set(), // cases spéciales consommées
    pend: [],          // jetons en cours : {hi,r,c,val,isJoker,jokerVal}
    rejouer: false,
    over: false
  };
}

function rnd(a){for(let i=a.length-1;i>0;i--){const j=~~(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function drawN(sac,n){return sac.length>=n?sac.splice(-n,n):sac.splice(0,sac.length);}
function specAt(r,c){const k=r+','+c;return G.usedSp.has(k)?null:SPECS[k]||null;}
function ev(t){return t.isJoker?t.jokerVal:t.val;}  // valeur effective

// ─── PLATEAU VIRTUEL (board + pending) ───
function vboard(){
  const b=G.board.map(r=>r.map(c=>c?{...c}:null));
  G.pend.forEach(p=>{b[p.r][p.c]={val:p.val,isJoker:p.isJoker,jokerVal:p.jokerVal};});
  return b;
}

// ─── LIGNE CONTINUE passant par (r,c) dans direction (dr,dc) ───
function getLine(b,r,c,dr,dc){
  let sr=r,sc=c;
  while(sr-dr>=0&&sr-dr<15&&sc-dc>=0&&sc-dc<15&&b[sr-dr][sc-dc])
    {sr-=dr;sc-=dc;}
  const line=[];
  let cr=sr,cc=sc;
  while(cr>=0&&cr<15&&cc>=0&&cc<15&&b[cr][cc]){
    line.push({r:cr,c:cc,tok:b[cr][cc]});
    cr+=dr;cc+=dc;
  }
  return line;
}

// ─── TOUTES LES LIGNES AFFECTÉES (≥2 jetons) ───
function affectedLines(){
  const b=vboard();
  const res=[];
  const seen=new Set();
  G.pend.forEach(p=>{
    ['H'+p.r,'V'+p.c].forEach((key,i)=>{
      if(seen.has(key))return;
      seen.add(key);
      const l=i===0?getLine(b,p.r,p.c,0,1):getLine(b,p.r,p.c,1,0);
      if(l.length>=2)res.push(l);
    });
  });
  return res;
}

// ─── ADJACENCE à un jeton FIXÉ (pas pending) ───
function adjFixed(r,c){
  for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
    const nr=r+dr,nc=c+dc;
    if(nr>=0&&nr<15&&nc>=0&&nc<15&&G.board[nr][nc])return true;
  }
  return false;
}

// ══════════════════════════════════════════════
//  VALIDATION
// ══════════════════════════════════════════════
function validate(){
  const p=G.pend;
  if(p.length===0)return err('Aucun jeton à placer');
  if(p.length>3) return err('Max 3 jetons par tour');

  // Joker sans valeur ?
  if(p.some(x=>x.isJoker&&x.jokerVal===null))
    return err('Définissez la valeur du joker');

  // Alignement
  const rows=[...new Set(p.map(x=>x.r))];
  const cols=[...new Set(p.map(x=>x.c))];
  if(rows.length>1&&cols.length>1)
    return err('Jetons non alignés');

  // Premier coup : doit couvrir H8 (r=7,c=7)
  if(G.first){
    if(!p.some(x=>x.r===7&&x.c===7))
      return err('1er jeton doit couvrir H8 (case centrale)');
  }else{
    // Au moins 1 adjacent à un jeton FIXÉ
    if(!p.some(x=>adjFixed(x.r,x.c)))
      return err('Doit être adjacent à un jeton existant');
  }

  // Vérifier chaque séquence créée
  const b=vboard();
  for(const px of p){
    for(const[dr,dc]of[[0,1],[1,0]]){
      const line=getLine(b,px.r,px.c,dr,dc);
      if(line.length<2)continue;
      if(line.length>3)
        return err('Plus de 3 jetons alignés');
      const vals=line.map(l=>ev(l.tok));
      if(vals.some(v=>v===null))
        return err('Joker sans valeur');
      const sum=vals.reduce((a,b)=>a+b,0);
      if(line.length===2&&sum>15)
        return err(`Paire trop grande (${sum} > 15)`);
      if(line.length===3&&sum!==15)
        return err(`Trio doit faire 15 (actuellement ${sum})`);
    }
  }

  // Carré 2×2 interdit SEULEMENT au 1er tour
  if(G.first){
    const b2=vboard();
    for(let r=0;r<14;r++)for(let c=0;c<14;c++){
      if(b2[r][c]&&b2[r+1][c]&&b2[r][c+1]&&b2[r+1][c+1]){
        if(p.some(x=>(x.r===r||x.r===r+1)&&(x.c===c||x.c===c+1)))
          return err('Carré interdit au 1er tour');
      }
    }
  }

  // Pas 2 jokers au même tour
  if(p.filter(x=>x.isJoker).length>=2)
    return err('1 seul joker par tour');

  return {ok:true};
}
function err(msg){return {ok:false,msg};}

// ══════════════════════════════════════════════
//  CALCUL DES POINTS
// ══════════════════════════════════════════════
function calcPoints(){
  let total=0;
  const lines=affectedLines();
  const hasJoker=G.pend.some(p=>p.isJoker);

  // Détection Triolet :
  // Les 3 jetons posés sont TOUS dans la même ligne ET
  // cette ligne a exactement 3 éléments ET somme = 15 ET pas de joker
  let trioletLine=null;
  if(G.pend.length===3&&!hasJoker){
    for(const line of lines){
      if(line.length===3){
        const allNew=line.every(l=>G.pend.some(p=>p.r===l.r&&p.c===l.c));
        if(allNew){
          const sum=line.map(l=>ev(l.tok)).reduce((a,b)=>a+b,0);
          if(sum===15){trioletLine=line;break;}
        }
      }
    }
  }

  lines.forEach(line=>{
    const vals=line.map(l=>ev(l.tok));
    const sum=vals.reduce((a,b)=>a+b,0);
    const len=line.length;

    // Multiplicateur : chercher case spéciale parmi les pending de cette ligne
    let mult=1;
    for(const p of G.pend){
      if(!line.some(l=>l.r===p.r&&l.c===p.c))continue;
      const sp=specAt(p.r,p.c);
      if(sp==='D'||sp==='C'){mult=2;G.usedSp.add(p.r+','+p.c);break;}
      if(sp==='T'){mult=3;G.usedSp.add(p.r+','+p.c);break;}
    }

    if(len===3&&sum===15){
      let pts=30*mult;
      let msg=`Trio ${vals.join('+')}=15 → 30×${mult}=${30*mult}`;

      // Bonus Triolet si c'est la ligne triolet
      if(trioletLine&&line===trioletLine){
        pts+=50;
        msg+=` + Bonus Triolet +50 = ${pts}`;
      }
      total+=pts;
      addLog(msg,'p');

    }else if(len===2){
      // Paire : calcul avec case spéciale sur le jeton posé
      let pts=0;
      line.forEach(item=>{
        const v=ev(item.tok);
        const isNew=G.pend.some(p=>p.r===item.r&&p.c===item.c);
        if(isNew){
          const sp=specAt(item.r,item.c);
          if(sp==='D'||sp==='C'){pts+=v*2;G.usedSp.add(item.r+','+item.c);}
          else if(sp==='T'){pts+=v*3;G.usedSp.add(item.r+','+item.c);}
          else pts+=v;
        }else{
          pts+=v;
        }
      });
      total+=pts;
      addLog(`Paire ${vals.join('+')}=${sum} → ${pts} pts`,'i');
    }
  });

  // Case Rejouer
  G.pend.forEach(p=>{
    if(specAt(p.r,p.c)==='R'){
      G.usedSp.add(p.r+','+p.c);
      G.rejouer=true;
      addLog('🔁 Case Rejouer !','g');
    }
  });

  return total;
}

// ══════════════════════════════════════════════
//  JOUER UN COUP
// ══════════════════════════════════════════════
function playMove(){
  const v=validate();
  if(!v.ok){addLog('❌ '+v.msg,'b');return;}

  const pts=calcPoints();
  const pl=G.joueurs[G.cur];
  pl.score+=pts;
  addLog(`✅ ${pl.name} marque ${pts} pts → Total : ${pl.score}`,'g');

  // Fixer sur le plateau
  G.pend.forEach(p=>{
    G.board[p.r][p.c]={val:p.val,isJoker:p.isJoker,jokerVal:p.jokerVal};
  });

  // Retirer de la main (indices décroissants pour ne pas décaler)
  const idxs=[...new Set(G.pend.map(p=>p.hi))].sort((a,b)=>b-a);
  idxs.forEach(i=>pl.hand.splice(i,1));

  // Repioche exactement le nombre posé
  const nb=G.pend.length;
  const drawn=drawN(G.sac,nb);
  drawn.forEach(t=>pl.hand.push(t));

  G.pend=[];
  selIdx=null;
  G.first=false;

  if(checkEnd())return;

  if(G.rejouer){
    G.rejouer=false;
    render();
    // Si c'est l'IA qui a le rejouer, elle rejoue
    if(G.joueurs[G.cur].isAI) setTimeout(aiTurn,800);
    return;
  }

  nextTurn();
}

// ─── TOUR SUIVANT ───
function nextTurn(){
  G.cur=(G.cur+1)%G.joueurs.length;
  G.pend=[];
  selIdx=null;
  render();
  if(G.joueurs[G.cur].isAI) setTimeout(aiTurn,900);
}

// ─── FIN DE PARTIE ───
function checkEnd(){
  const pl=G.joueurs[G.cur];
  if(G.sac.length===0&&pl.hand.length===0){
    let bonus=0;
    G.joueurs.forEach((j,i)=>{
      if(i!==G.cur){
        const s=j.hand.reduce((a,t)=>a+(t.isJoker?0:t.val),0);
        bonus+=s;
        addLog(`${j.name} perd ${s} pts (jetons restants)`,'b');
      }
    });
    pl.score+=bonus;
    if(bonus>0)addLog(`${pl.name} gagne +${bonus} pts bonus`,'g');
    G.over=true;
    render();
    setTimeout(showEnd,600);
    return true;
  }
  return false;
}

function showEnd(){
  const sorted=[...G.joueurs].sort((a,b)=>b.score-a.score);
  const medals=['🥇','🥈','🥉','4️⃣'];
  document.getElementById('fin-scores').innerHTML=
    sorted.map((j,i)=>`
      <div class="fin-row">
        <span>${medals[i]} ${j.name}</span>
        <span class="fin-pts">${j.score}</span>
      </div>`).join('');
  document.getElementById('modal-fin').classList.add('on');
}

// ══════════════════════════════════════════════
//  IA
// ══════════════════════════════════════════════
function aiTurn(){
  const pl=G.joueurs[G.cur];
  if(!pl.isAI){return;} // sécurité
  if(pl.hand.length===0){nextTurn();return;}

  let best=null,bestPts=-1;

  // Tester chaque jeton sur chaque case
  for(let hi=0;hi<pl.hand.length;hi++){
    const tok=pl.hand[hi];
    for(let r=0;r<15;r++){
      for(let c=0;c<15;c++){
        if(G.board[r][c])continue;
        if(G.first&&!(r===7&&c===7))continue;
        if(!G.first&&!adjFixed(r,c))continue;

        // Tester avec jokerVal=7 si joker (valeur par défaut IA)
        const jokerVal=tok.isJoker?7:null;
        G.pend=[{hi,r,c,val:tok.val,isJoker:tok.isJoker,jokerVal}];
        const v=validate();
        if(v.ok){
          const pts=calcPoints();
          if(pts>bestPts){bestPts=pts;best={hi,r,c,tok,jokerVal};}
        }
        G.pend=[];
      }
    }
  }

  if(best){
    // Jouer le meilleur coup trouvé
    G.pend=[{
      hi:best.hi,r:best.r,c:best.c,
      val:best.tok.val,isJoker:best.tok.isJoker,jokerVal:best.jokerVal
    }];
    // Calcul réel des points
    const pts=calcPoints();
    pl.score+=pts;
    addLog(`🤖 ${pl.name} joue en ${String.fromCharCode(65+best.r)}${best.c+1} → +${pts} pts`,'i');

    G.board[best.r][best.c]={
      val:best.tok.val,isJoker:best.tok.isJoker,jokerVal:best.jokerVal
    };
    pl.hand.splice(best.hi,1);
    pl.hand.push(...drawN(G.sac,1));
    G.pend=[];
    G.first=false;

    if(!checkEnd()){
      if(G.rejouer){
        G.rejouer=false;
        render();
        setTimeout(aiTurn,900);
      }else{
        nextTurn();
      }
    }
  }else{
    // Pas de coup : échanger si possible, sinon passer
    if(G.sac.length>=5&&pl.hand.length>0){
      const removed=pl.hand.splice(-1,1);
      G.sac.push(...removed);
      rnd(G.sac);
      pl.hand.push(...drawN(G.sac,1));
      addLog(`🤖 ${pl.name} échange 1 jeton`,'i');
    }else{
      addLog(`🤖 ${pl.name} passe`,'i');
    }
    nextTurn();
  }
}

// ══════════════════════════════════════════════
//  RENDU
// ══════════════════════════════════════════════
function render(){
  renderBoard();
  renderHand();
  renderScores();
  document.getElementById('sac-count').textContent=G.sac.length;
  const pl=G.joueurs[G.cur];
  document.getElementById('current-name').textContent=
    (pl.isAI?'🤖 ':'')+pl.name;
}

// ── Plateau ──
function renderBoard(){
  const bd=document.getElementById('board');
  bd.innerHTML='';

  const pendingIdx=new Set(G.pend.map(p=>p.r+','+p.c));

  for(let r=0;r<15;r++){
    for(let c=0;c<15;c++){
      const cell=document.createElement('div');
      cell.className='cell';

      const sp=SPECS[r+','+c];
      const used=G.usedSp.has(r+','+c);

      if(!used){
        if(sp==='R')cell.classList.add('sp-rejouer');
        else if(sp==='D')cell.classList.add('sp-double');
        else if(sp==='T')cell.classList.add('sp-triple');
        else if(sp==='C')cell.classList.add('sp-centre');
      }

      const key=r+','+c;
      const boardTok=G.board[r][c];
      const pendTok=G.pend.find(p=>p.r===r&&p.c===c);

      if(boardTok){
        // Jeton fixé
        cell.appendChild(makeTok(boardTok,false));
        cell.style.cursor='default';
      }else if(pendTok){
        // Jeton en attente de validation
        const tk=makeTok({val:pendTok.val,isJoker:pendTok.isJoker,jokerVal:pendTok.jokerVal},true);
        cell.appendChild(tk);
        // Clic sur jeton pending → le récupérer
        cell.addEventListener('click',()=>removePend(r,c));
        cell.style.cursor='pointer';
      }else{
        // Case vide
        if(!used&&sp){
          const lbl=document.createElement('span');
          lbl.className='cell-label';
          lbl.textContent=sp==='R'?'↺':(sp==='D'||sp==='C')?'×2':'×3';
          cell.appendChild(lbl);
        }
        // Surbrillance si sélection active
        if(selIdx!==null&&!G.joueurs[G.cur].isAI){
          if(G.first){
            if(r===7&&c===7)cell.classList.add('can-place');
          }else{
            if(adjFixed(r,c))cell.classList.add('can-place');
          }
        }
        cell.addEventListener('click',()=>onCellClick(r,c));
      }

      bd.appendChild(cell);
    }
  }
}

function makeTok(t,isPend){
  const div=document.createElement('div');
  div.className='token'+(t.isJoker?' is-joker':'')+(isPend?' is-pending':'');
  if(t.isJoker){
    div.textContent='X';
    if(t.jokerVal!==null&&t.jokerVal!==undefined){
      const cor=document.createElement('span');
      cor.className='joker-corner';
      cor.textContent=t.jokerVal;
      div.appendChild(cor);
    }
  }else{
    div.textContent=t.val;
  }
  return div;
}

// ── Main (chevalet) ──
function renderHand(){
  const ct=document.getElementById('hand-tokens');
  ct.innerHTML='';

  // En mode 2 joueurs local, afficher uniquement le joueur actif
  const pl=G.joueurs[G.cur];
  if(pl.isAI){
    ct.innerHTML='<span style="color:#94a3b8;font-size:0.85rem;">L\'IA réfléchit...</span>';
    return;
  }

  const usedHi=new Set(G.pend.map(p=>p.hi));

  pl.hand.forEach((t,i)=>{
    const div=document.createElement('div');
    if(usedHi.has(i)){
      // Slot vide (jeton posé sur le plateau)
      div.className='hand-tok';
      div.style.background='#334155';
      div.style.boxShadow='inset 0 2px 4px rgba(0,0,0,0.4)';
      div.style.cursor='default';
    }else{
      div.className='hand-tok'+(t.isJoker?' is-joker':'')+(selIdx===i?' selected':'');
      div.textContent=t.isJoker?'X':t.val;
      div.addEventListener('click',()=>selectTok(i));
    }
    ct.appendChild(div);
  });
}

// ── Scores ──
function renderScores(){
  document.getElementById('scores-list').innerHTML=
    G.joueurs.map((j,i)=>`
      <div class="score-row">
        <span class="score-name ${i===G.cur?'is-current':''}">
          ${j.isAI?'🤖':'👤'} ${j.name} ${i===G.cur?'◀':''}
        </span>
        <span class="score-pts">${j.score}</span>
      </div>`).join('');
}

// ══════════════════════════════════════════════
//  INTERACTIONS JOUEUR
// ══════════════════════════════════════════════
function selectTok(i){
  if(G.over)return;
  if(G.joueurs[G.cur].isAI)return;
  if(G.pend.some(p=>p.hi===i))return; // déjà posé
  selIdx=(selIdx===i)?null:i;
  render();
}

function onCellClick(r,c){
  if(G.over)return;
  if(G.joueurs[G.cur].isAI)return;
  if(selIdx===null)return;
  if(G.board[r][c])return;
  if(G.pend.some(p=>p.r===r&&p.c===c))return;

  const pl=G.joueurs[G.cur];
  const tok=pl.hand[selIdx];

  if(tok.isJoker){
    openJoker(jokerVal=>{
      G.pend.push({hi:selIdx,r,c,val:null,isJoker:true,jokerVal});
      selIdx=null;
      render();
    });
  }else{
    G.pend.push({hi:selIdx,r,c,val:tok.val,isJoker:false,jokerVal:null});
    selIdx=null;
    render();
  }
}

function removePend(r,c){
  const i=G.pend.findIndex(p=>p.r===r&&p.c===c);
  if(i>-1){G.pend.splice(i,1);selIdx=null;render();}
}

// ── Joker ──
function openJoker(cb){
  jokerCB=cb;
  const grid=document.getElementById('joker-grid');
  grid.innerHTML='';
  for(let v=0;v<=15;v++){
    const d=document.createElement('div');
    d.className='jv';
    d.textContent=v;
    d.addEventListener('click',()=>{
      cb(v);
      closeJoker();
    });
    grid.appendChild(d);
  }
  document.getElementById('modal-joker').classList.add('on');
}
function closeJoker(){
  document.getElementById('modal-joker').classList.remove('on');
  jokerCB=null;
}

// ── Échange ──
function openEch(){
  if(G.joueurs[G.cur].isAI)return;
  if(G.pend.length>0){addLog('Annulez vos jetons avant d\'échanger','b');return;}
  if(G.sac.length<5){addLog('Moins de 5 jetons dans le sac, échange impossible','b');return;}
  echSel=[];
  const pl=G.joueurs[G.cur];
  const ct=document.getElementById('ech-tokens');
  ct.innerHTML='';
  pl.hand.forEach((t,i)=>{
    const d=document.createElement('div');
    d.className='hand-tok'+(t.isJoker?' is-joker':'');
    d.textContent=t.isJoker?'X':t.val;
    d.style.cursor='pointer';
    d.addEventListener('click',()=>{
      const idx=echSel.indexOf(i);
      if(idx>-1){echSel.splice(idx,1);d.classList.remove('selected');}
      else if(echSel.length<3){echSel.push(i);d.classList.add('selected');}
    });
    ct.appendChild(d);
  });
  document.getElementById('modal-ech').classList.add('on');
}
function confirmEch(){
  if(echSel.length===0){addLog('Sélectionnez au moins 1 jeton','b');return;}
  const pl=G.joueurs[G.cur];
  const sorted=[...echSel].sort((a,b)=>b-a);
  const removed=sorted.map(i=>pl.hand.splice(i,1)[0]);
  G.sac.push(...removed);
  rnd(G.sac);
  pl.hand.push(...drawN(G.sac,removed.length));
  addLog(`🔄 Échange de ${removed.length} jeton(s)`,'i');
  closeEch();
  nextTurn();
}
function closeEch(){
  document.getElementById('modal-ech').classList.remove('on');
  echSel=[];
}

// ── Journal ──
let logDetail=true;
function addLog(msg,type){
  // En mode minimum : n'afficher que les scores (type 'g' avec "marque")
  if(logMode==='min'&&type!=='g')return;
  if(logMode==='min'&&!msg.includes('marque')&&!msg.includes('🏆'))return;

  const box=document.getElementById('log-box');
  const p=document.createElement('p');
  p.textContent=msg;
  if(type==='g')p.className='lg';
  if(type==='b')p.className='lb';
  if(type==='i')p.className='li';
  if(type==='p')p.className='lp';
  box.prepend(p);
  while(box.children.length>30)box.removeChild(box.lastChild);
}
function setLog(mode){
  logMode=mode;
  document.getElementById('btn-lg-detail').classList.toggle('on',mode==='detail');
  document.getElementById('btn-lg-min').classList.toggle('on',mode==='min');
}

// ── Boutons ──
document.getElementById('btn-valider').addEventListener('click',()=>{
  if(G.joueurs[G.cur].isAI){addLog('Pas votre tour','b');return;}
  playMove();
});
document.getElementById('btn-annuler').addEventListener('click',()=>{
  G.pend=[];selIdx=null;render();
});
document.getElementById('btn-echanger').addEventListener('click',openEch);
document.getElementById('btn-quitter').addEventListener('click',()=>location.reload());

// ══════════════════════════════════════════════
//  DÉMARRAGE
// ══════════════════════════════════════════════
function startGame(){
  const pseudo=document.getElementById('inp-pseudo').value.trim()||'Joueur';
  const mode=document.getElementById('inp-mode').value;
  const players=mode==='solo'?[pseudo,'IA']:[pseudo,'Joueur 2'];
  G=newGame(players);
  document.getElementById('screen-lobby').style.display='none';
  document.getElementById('screen-game').style.display='block';
  addLog('🎮 Nouvelle partie ! '+players.join(' vs '),'g');
  addLog('📦 '+G.sac.length+' jetons dans le sac','i');
  render();
}
