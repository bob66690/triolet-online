// ============================================================
//  TRIOLET ONLINE - Version optimisée
// ============================================================

const DISTRIBUTION = {
  0:9, 1:9, 2:8, 3:8, 4:7, 5:8, 6:6,
  7:6, 8:4, 9:4, 10:3, 11:3, 12:2, 13:2, 14:1, 15:1
};

// Cases spéciales exactes du plateau photo
const SPECIAL_CASES = {};
const CASES_REJOUER = ['A8','B2','B14','H1','H15','N2','N14','O8'];
const CASES_DOUBLE  = ['D8','E5','E11','H4','H12','K5','K11','L8'];
const CASES_TRIPLE  = ['B5','B11','E2','E14','K2','K14','N5','N11'];
const CASE_CENTRE   = 'H8';

function toCoords(code) {
  const row = code.charCodeAt(0) - 65; // A=0
  const col = parseInt(code.slice(1)) - 1; // 1=0
  return [row, col];
}

[...CASES_REJOUER, ...CASES_DOUBLE, ...CASES_TRIPLE, CASE_CENTRE].forEach(c => {
  const [r, col] = toCoords(c);
  if (CASES_REJOUER.includes(c)) SPECIAL_CASES[`${r},${col}`] = 'R';
  else if (CASES_DOUBLE.includes(c)) SPECIAL_CASES[`${r},${col}`] = 'D';
  else if (CASES_TRIPLE.includes(c)) SPECIAL_CASES[`${r},${col}`] = 'T';
  else if (c === CASE_CENTRE) SPECIAL_CASES[`${r},${col}`] = 'C';
});

let G = null;
let logMode = 'detailed'; // 'detailed' ou 'compact'
let selectedTokenIdx = null;
let jokerCallback = null;
let echangeSelection = [];

function initGame(players) {
  const sac = [];
  Object.entries(DISTRIBUTION).forEach(([v,q]) => {
    for(let i=0;i<q;i++) sac.push({val: parseInt(v), isJoker: false});
  });
  sac.push({val:null, isJoker:true, jokerVal:null});
  sac.push({val:null, isJoker:true, jokerVal:null});
  
  shuffle(sac);
  sac.splice(0,3); // Retirer 3
  
  const joueurs = players.map((name,i) => ({
    name, 
    score: 0, 
    hand: draw(sac, 3),
    isAI: i>0
  }));
  
  return {
    board: Array(15).fill(null).map(() => Array(15).fill(null)),
    sac,
    joueurs,
    current: 0,
    firstMove: true,
    usedSpecs: new Set(),
    pending: [], // {idx, r, c, val, isJoker, jokerVal}
    over: false
  };
}

function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} }
function draw(sac, n) { return sac.splice(-n, n); }
function getSpec(r,c) { const k=`${r},${c}`; if(G.usedSpecs.has(k))return null; return SPECIAL_CASES[k]||null; }

// ---------- VALIDATION ----------

function isAdj(r,c) {
  for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
    const[nr,nc]=[r+dr,c+dc];
    if(nr>=0&&nr<15&&nc>=0&&nc<15&&G.board[nr][nc])return true;
  }
  return false;
}

function validate() {
  if(G.pending.length===0)return{ok:false,msg:'Aucun jeton'};
  if(G.pending.length>3)return{ok:false,msg:'Max 3 jetons'};
  
  const rows=[...new Set(G.pending.map(p=>p.r))];
  const cols=[...new Set(G.pending.map(p=>p.c))];
  if(rows.length>1&&cols.length>1)return{ok:false,msg:'Alignement requis'};
  
  if(G.firstMove){
    if(!G.pending.some(p=>p.r===7&&p.c===7))return{ok:false,msg:'Commencer sur H8'};
  }else{
    if(!G.pending.some(p=>isAdj(p.r,p.c)))return{ok:false,msg:'Adjacence requise'};
  }
  
  // Vérifier lignes
  const b=G.board.map(r=>[...r]);
  G.pending.forEach(p=>b[p.r][p.c]={val:p.val,isJoker:p.isJoker,jokerVal:p.jokerVal});
  
  for(const p of G.pending){
    // Horiz
    let line=[p];
    let c=p.c-1; while(c>=0&&b[p.r][c])line.unshift({r:p.r,c:c,token:b[p.r][c--]});
    c=p.c+1; while(c<15&&b[p.r][c])line.push({r:p.r,c:c,token:b[p.r][c++]});
    if(line.length>3)return{ok:false,msg:'Max 3 alignés'};
    if(line.length>=2){
      const vals=line.map(x=>x.token.isJoker?x.token.jokerVal:x.token.val);
      if(vals.some(v=>v===null))return{ok:false,msg:'Joker sans valeur'};
      const sum=vals.reduce((a,b)=>a+b,0);
      if(line.length===2&&sum>15)return{ok:false,msg:'Paire >15'};
      if(line.length===3&&sum!==15)return{ok:false,msg:'Trio !=15'};
    }
    // Vert
    line=[p];
    let r=p.r-1; while(r>=0&&b[r][p.c])line.unshift({r:r,c:p.c,token:b[r--][p.c]});
    r=p.r+1; while(r<15&&b[r][p.c])line.push({r:r,c:p.c,token:b[r++][p.c]});
    if(line.length>3)return{ok:false,msg:'Max 3 alignés'};
    if(line.length>=2){
      const vals=line.map(x=>x.token.isJoker?x.token.jokerVal:x.token.val);
      if(vals.some(v=>v===null))return{ok:false,msg:'Joker sans valeur'};
      const sum=vals.reduce((a,b)=>a+b,0);
      if(line.length===2&&sum>15)return{ok:false,msg:'Paire >15'};
      if(line.length===3&&sum!==15)return{ok:false,msg:'Trio !=15'};
    }
  }
  
  // Carré interdit uniquement 1er tour
  if(G.firstMove){
    for(let r=0;r<14;r++)for(let c=0;c<14;c++){
      if(b[r][c]&&b[r+1][c]&&b[r][c+1]&&b[r+1][c+1]){
        if(G.pending.some(p=>(p.r===r||p.r===r+1)&&(p.c===c||p.c===c+1)))
          return{ok:false,msg:'Pas de carré au 1er tour'};
      }
    }
  }
  
  if(G.pending.filter(p=>p.isJoker).length>=2)return{ok:false,msg:'Un seul joker/tour'};
  
  return{ok:true};
}

// ---------- SCORE ----------

function calcScore() {
  let total=0;
  const b=G.board.map(r=>[...r]);
  G.pending.forEach(p=>b[p.r][p.c]={val:p.val,isJoker:p.isJoker,jokerVal:p.jokerVal});
  
  // Détection Triolet (3 jetons posés en une fois formant un trio)
  let isTriolet=false;
  if(G.pending.length===3&&!G.pending.some(p=>p.isJoker)){
    // Vérifier si les 3 sont sur une même ligne et font 15
    const rows=[...new Set(G.pending.map(p=>p.r))];
    const cols=[...new Set(G.pending.map(p=>p.c))];
    if(rows.length===1){
      const r=rows[0];
      const sorted=G.pending.sort((a,b)=>a.c-b.c);
      if(sorted[2].c-sorted[0].c===2){ // consécutifs
        const sum=sorted.reduce((a,p)=>a+(p.isJoker?p.jokerVal:p.val),0);
        if(sum===15)isTriolet=true;
      }
    }else if(cols.length===1){
      const c=cols[0];
      const sorted=G.pending.sort((a,b)=>a.r-b.r);
      if(sorted[2].r-sorted[0].r===2){
        const sum=sorted.reduce((a,p)=>a+(p.isJoker?p.jokerVal:p.val),0);
        if(sum===15)isTriolet=true;
      }
    }
  }
  
  const lines=new Set();
  G.pending.forEach(p=>{
    // Ligne horiz
    let h=[{r:p.r,c:p.c}];
    let c=p.c-1; while(c>=0&&b[p.r][c])h.unshift({r:p.r,c:c--});
    c=p.c+1; while(c<15&&b[p.r][c])h.push({r:p.r,c:c++});
    if(h.length>=2)lines.add(JSON.stringify(h.sort((a,b)=>a.c-b.c)));
    // Ligne vert
    let v=[{r:p.r,c:p.c}];
    let r=p.r-1; while(r>=0&&b[r][p.c])v.unshift({r:r--,c:p.c});
    r=p.r+1; while(r<15&&b[r][p.c])v.push({r:r++,c:p.c});
    if(v.length>=2)lines.add(JSON.stringify(v.sort((a,b)=>a.r-b.r)));
  });
  
  lines.forEach(json=>{
    const line=JSON.parse(json);
    const tokens=line.map(p=>b[p.r][p.c]);
    const vals=tokens.map(t=>t.isJoker?t.jokerVal:t.val);
    const sum=vals.reduce((a,b)=>a+b,0);
    const len=line.length;
    
    // Multiplicateur case spéciale
    let mult=1;
    line.forEach(pos=>{
      if(G.pending.some(p=>p.r===pos.r&&p.c===pos.c)){
        const sp=getSpec(pos.r,pos.c);
        if(sp==='D'||sp==='C'){mult=2;G.usedSpecs.add(`${pos.r},${pos.c}`);}
        if(sp==='T'){mult=3;G.usedSpecs.add(`${pos.r},${pos.c}`);}
      }
    });
    
    if(len===3&&sum===15){
      let pts=30*mult;
      let txt=`Trio×${mult}=${pts}`;
      if(isTriolet&&line.every(pos=>G.pending.some(p=>p.r===pos.r&&p.c===pos.c))){
        pts+=50;
        txt+=` +50 Triolet!`;
      }
      total+=pts;
      log(txt, 'points');
    }else if(len===2){
      let pts=0;
      line.forEach(pos=>{
        const t=b[pos.r][pos.c];
        const v=t.isJoker?t.jokerVal:t.val;
        if(G.pending.some(p=>p.r===pos.r&&p.c===pos.c)){
          const sp=getSpec(pos.r,pos.c);
          if(sp==='D'||sp==='C'){pts+=v*2;G.usedSpecs.add(`${pos.r},${pos.c}`);}
          else if(sp==='T'){pts+=v*3;G.usedSpecs.add(`${pos.r},${pos.c}`);}
          else pts+=v;
        }else pts+=v;
      });
      total+=pts;
      log(`Paire=${pts}`, 'info');
    }
  });
  
  // Rejouer
  G.pending.forEach(p=>{
    if(getSpec(p.r,p.c)==='R'){
      G.usedSpecs.add(`${p.r},${p.c}`);
      G.rejouer=true;
      log('Rejouer!', 'good');
    }
  });
  
  return total;
}

// ---------- ACTIONS ----------

function playTurn() {
  const v=validate();
  if(!v.ok){log(v.msg,'bad');return;}
  
  const pts=calcScore();
  const p=G.joueurs[G.current];
  p.score+=pts;
  log(`${p.name}: +${pts} pts (Total:${p.score})`, 'good');
  
  // Fixer jetons
  G.pending.forEach(x=>{
    G.board[x.r][x.c]={val:x.val,isJoker:x.isJoker,jokerVal:x.jokerVal};
  });
  
  // Retirer de la main (indices décroissants)
  const idxs=[...new Set(G.pending.map(p=>p.idx))].sort((a,b)=>b-a);
  idxs.forEach(i=>p.hand.splice(i,1));
  
  // Repiocher
  p.hand.push(...draw(G.sac, G.pending.length));
  
  G.pending=[];
  selectedTokenIdx=null;
  G.firstMove=false;
  
  if(checkEnd())return;
  
  if(G.rejouer){
    G.rejouer=false;
    render();
    if(G.joueurs[G.current].isAI)setTimeout(aiPlay,800);
  }else{
    nextTurn();
  }
}

function nextTurn() {
  G.current=(G.current+1)%G.joueurs.length;
  render();
  if(G.joueurs[G.current].isAI)setTimeout(aiPlay,1000);
}

function checkEnd() {
  const p=G.joueurs[G.current];
  if(G.sac.length===0&&p.hand.length===0){
    // Bonus fin
    let bonus=0;
    G.joueurs.forEach((j,i)=>{
      if(i!==G.current){
        const s=j.hand.reduce((a,t)=>a+(t.isJoker?0:t.val),0);
        bonus+=s;
      }
    });
    p.score+=bonus;
    showEnd();
    return true;
  }
  return false;
}

function showEnd() {
  const sorted=[...G.joueurs].sort((a,b)=>b.score-a.score);
  const html=sorted.map((j,i)=>`
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;">
      <span>${['🥇','🥈','🥉','4️⃣'][i]} ${j.name}</span>
      <span style="font-weight:800;color:#fbbf24;">${j.score}</span>
    </div>
  `).join('');
  document.getElementById('final-scores').innerHTML=html;
  document.getElementById('modal-fin').classList.add('active');
}

// ---------- IA ----------

function aiPlay() {
  const p=G.joueurs[G.current];
  if(p.hand.length===0){nextTurn();return;}
  
  let best=null, bestPts=-1;
  
  for(let i=0;i<p.hand.length;i++){
    const t=p.hand[i];
    for(let r=0;r<15;r++)for(let c=0;c<15;c++){
      if(G.board[r][c])continue;
      if(G.firstMove&&!(r===7&&c===7))continue;
      if(!G.firstMove&&!isAdj(r,c))continue;
      
      G.pending=[{idx:i,r,c,val:t.val,isJoker:t.isJoker,jokerVal:t.isJoker?7:t.jokerVal}];
      if(validate().ok){
        const pts=calcScore();
        if(pts>bestPts){bestPts=pts;best={i,r,c,val:t.val,isJoker:t.isJoker};}
      }
      G.pending=[];
    }
  }
  
  if(best){
    const t=p.hand[best.i];
    G.board[best.r][best.c]={val:best.val,isJoker:best.isJoker,jokerVal:best.isJoker?7:null};
    p.hand.splice(best.i,1);
    p.hand.push(...draw(G.sac,1));
    p.score+=bestPts;
    log(`🤖 ${p.name}: +${bestPts} pts`, 'info');
    G.firstMove=false;
    if(!checkEnd())nextTurn();
  }else{
    if(G.sac.length>=5&&p.hand.length>0){
      const t=p.hand.pop();
      G.sac.push(t);shuffle(G.sac);
      p.hand.push(...draw(G.sac,1));
      log(`🤖 ${p.name} échange`, 'info');
    }else{
      log(`🤖 ${p.name} passe`, 'info');
    }
    nextTurn();
  }
}

// ---------- RENDU ----------

function render() {
  renderBoard();
  renderHand();
  renderScores();
  document.getElementById('sac-count').textContent=G.sac.length;
}

function renderBoard() {
  const b=document.getElementById('board');
  b.innerHTML='';
  
  // Coords
  const cols=document.getElementById('coord-cols');
  const rows=document.getElementById('coord-rows');
  if(!cols.innerHTML){
    for(let i=1;i<=15;i++){
      const s=document.createElement('span');
      s.className='coord-col';
      s.textContent=i;
      cols.appendChild(s);
    }
    for(let i=0;i<15;i++){
      const s=document.createElement('span');
      s.textContent=String.fromCharCode(65+i);
      rows.appendChild(s);
    }
  }
  
  for(let r=0;r<15;r++)for(let c=0;c<15;c++){
    const cell=document.createElement('div');
    cell.className='cell';
    const sp=getSpec(r,c);
    if(sp==='R')cell.classList.add('rejouer');
    if(sp==='D')cell.classList.add('double');
    if(sp==='T')cell.classList.add('triple');
    if(sp==='C')cell.classList.add('center');
    
    // Jeton fixé
    if(G.board[r][c]){
      cell.appendChild(createToken(G.board[r][c],false));
      cell.classList.add('occupied');
    }else{
      // Pending?
      const pend=G.pending.find(p=>p.r===r&&p.c===c);
      if(pend){
        cell.appendChild(createToken({val:pend.val,isJoker:pend.isJoker,jokerVal:pend.jokerVal},true));
        cell.onclick=()=>removePending(r,c);
      }else{
        // Label case spéciale vide
        if(sp){
          const l=document.createElement('span');
          l.className='cell-label';
          l.textContent=sp==='R'?'↺':(sp==='D'||sp==='C')?'×2':'×3';
          cell.appendChild(l);
        }
        // Highlight si sélection
        if(selectedTokenIdx!==null){
          if(G.firstMove){
            if(r===7&&c===7)cell.classList.add('highlight');
          }else{
            if(isAdj(r,c))cell.classList.add('highlight');
          }
        }
        cell.onclick=()=>placeToken(r,c);
      }
    }
    b.appendChild(cell);
  }
}

function createToken(t,isPending){
  const div=document.createElement('div');
  div.className='token'+(t.isJoker?' joker':'')+(isPending?' pending-token':'');
  if(t.isJoker){
    const main=document.createElement('span');
    main.textContent='X';
    div.appendChild(main);
    if(t.jokerVal!==null){
      const cor=document.createElement('span');
      cor.className='corner-val';
      cor.textContent=t.jokerVal;
      div.appendChild(cor);
    }
  }else{
    div.textContent=t.val;
  }
  return div;
}

function renderHand() {
  const container=document.getElementById('hand-tokens');
  container.innerHTML='';
  const p=G.joueurs[0];
  
  // Indices utilisés dans pending
  const used=new Set(G.pending.map(x=>x.idx));
  
  for(let i=0;i<3;i++){
    if(i<p.hand.length&&!used.has(i)){
      const t=p.hand[i];
      const div=document.createElement('div');
      div.className='hand-token'+(t.isJoker?' joker':'')+(selectedTokenIdx===i?' selected':'');
      div.textContent=t.isJoker?'X':t.val;
      div.onclick=()=>selectToken(i);
      container.appendChild(div);
    }else if(i>=p.hand.length&&!used.has(i)){
      const div=document.createElement('div');
      div.className='hand-token empty-slot';
      container.appendChild(div);
    }
  }
}

function renderScores() {
  const div=document.getElementById('scores-list');
  div.innerHTML=G.joueurs.map((j,i)=>`
    <div class="score-row">
      <div class="score-name">
        ${j.isAI?'🤖':'👤'} 
        <span class="${i===G.current?'current-turn':''}">${j.name}</span>
        ${i===G.current?'⬅️':''}
      </div>
      <div class="score-val">${j.score}</div>
    </div>
  `).join('');
}

// ---------- INTERACTIONS ----------

function selectToken(idx) {
  if(G.joueurs[G.current].isAI)return;
  if(G.pending.some(p=>p.idx===idx))return;
  selectedTokenIdx=selectedTokenIdx===idx?null:idx;
  render();
}

function placeToken(r,c) {
  if(selectedTokenIdx===null)return;
  if(G.board[r][c])return;
  if(G.pending.some(p=>p.r===r&&p.c===c))return;
  
  const p=G.joueurs[0];
  const t=p.hand[selectedTokenIdx];
  
  if(t.isJoker){
    openJokerModal(val=>{
      G.pending.push({idx:selectedTokenIdx,r,c,val:null,isJoker:true,jokerVal:val});
      selectedTokenIdx=null;
      render();
    });
  }else{
    G.pending.push({idx:selectedTokenIdx,r,c,val:t.val,isJoker:false,jokerVal:null});
    selectedTokenIdx=null;
    render();
  }
}

function removePending(r,c) {
  const i=G.pending.findIndex(p=>p.r===r&&p.c===c);
  if(i>-1){
    G.pending.splice(i,1);
    render();
  }
}

// ---------- MODALS ----------

function openJokerModal(callback) {
  jokerCallback=callback;
  const grid=document.getElementById('joker-grid');
  grid.innerHTML='';
  for(let v=0;v<=15;v++){
    const d=document.createElement('div');
    d.className='joker-val';
    d.textContent=v;
    d.onclick=()=>{
      callback(v);
      closeJokerModal();
    };
    grid.appendChild(d);
  }
  document.getElementById('modal-joker').classList.add('active');
}

function closeJokerModal() {
  document.getElementById('modal-joker').classList.remove('active');
  jokerCallback=null;
}

function openEchange() {
  if(G.joueurs[G.current].isAI)return;
  if(G.pending.length>0){log('Annulez d\'abord','bad');return;}
  echangeSelection=[];
  const p=G.joueurs[0];
  const list=document.getElementById('echange-list');
  list.innerHTML='';
  p.hand.forEach((t,i)=>{
    const d=document.createElement('div');
    d.className='hand-token'+(t.isJoker?' joker':'');
    d.textContent=t.isJoker?'X':t.val;
    d.onclick=()=>{
      if(echangeSelection.includes(i)){
        echangeSelection=echangeSelection.filter(x=>x!==i);
        d.style.opacity='1';
        d.style.transform='scale(1)';
      }else if(echangeSelection.length<3){
        echangeSelection.push(i);
        d.style.opacity='0.6';
        d.style.transform='scale(0.9)';
      }
    };
    list.appendChild(d);
  });
  document.getElementById('modal-echange').classList.add('active');
}

function confirmEchange() {
  if(echangeSelection.length===0)return;
  if(G.sac.length<5){log('Sac presque vide','bad');closeEchangeModal();return;}
  
  const p=G.joueurs[0];
  const idxs=[...echangeSelection].sort((a,b)=>b-a);
  const removed=idxs.map(i=>p.hand.splice(i,1)[0]);
  G.sac.push(...removed);
  shuffle(G.sac);
  p.hand.push(...draw(G.sac,removed.length));
  
  log(`🔄 Échange ${removed.length} jeton(s)`, 'info');
  closeEchangeModal();
  nextTurn();
}

function closeEchangeModal() {
  document.getElementById('modal-echange').classList.remove('active');
}

// ---------- LOG ----------

function log(msg,type='info') {
  const div=document.getElementById('message-log');
  const p=document.createElement('p');
  p.textContent=msg;
  if(type==='good')p.className='log-good';
  if(type==='bad')p.className='log-bad';
  if(type==='points')p.className='log-points';
  if(type==='info')p.className='log-info';
  
  if(logMode==='compact'&&type!=='points'&&type!=='good'){
    // En mode compact, on n'affiche que les points et les actions importantes
    return; 
  }
  
  div.prepend(p);
  while(div.children.length>20)div.removeChild(div.lastChild);
}

function setLogMode(mode) {
  logMode=mode;
  document.getElementById('btn-detailed').classList.toggle('active',mode==='detailed');
  document.getElementById('btn-compact').classList.toggle('active',mode==='compact');
  const div=document.getElementById('message-log');
  div.classList.toggle('compact',mode==='compact');
}

// ---------- INIT ----------

document.getElementById('btn-valider').onclick=playTurn;
document.getElementById('btn-annuler').onclick=()=>{
  G.pending=[];
  selectedTokenIdx=null;
  render();
};
document.getElementById('btn-echanger').onclick=openEchange;
document.getElementById('btn-quitter').onclick=()=>location.reload();

function startGame() {
  const pseudo=document.getElementById('input-pseudo').value||'Joueur';
  const mode=document.getElementById('select-mode').value;
  
  const players=mode==='solo'?[pseudo,'IA']:[pseudo,'Joueur 2'];
  G=initGame(players);
  
  document.getElementById('screen-lobby').style.display='none';
  document.getElementById('screen-game').style.display='block';
  
  log('🎮 Début de partie!', 'good');
  render();
}
