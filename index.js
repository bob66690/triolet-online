/**
 * TRIOLET - Moteur de jeu complet (Règles Gigamic)
 * Plateau 15x15, 81 jetons (0-15) + 2 Jokers
 */

const BOARD_SIZE = 15;
const CENTER = { x: 7, y: 7 }; // Case centrale (index 0-based)

// Configuration des cases spéciales (coordonnées 0-based)
const SPECIAL_CELLS = {
  double: [
    { x: 7, y: 7 }, // Centre
    { x: 3, y: 3 }, { x: 3, y: 11 },
    { x: 11, y: 3 }, { x: 11, y: 11 },
    { x: 0, y: 7 }, { x: 7, y: 0 }, { x: 7, y: 14 }, { x: 14, y: 7 },
    { x: 2, y: 7 }, { x: 7, y: 2 }, { x: 7, y: 12 }, { x: 12, y: 7 }
  ],
  triple: [
    { x: 5, y: 5 }, { x: 5, y: 9 },
    { x: 9, y: 5 }, { x: 9, y: 9 }
  ],
  replay: [
    { x: 1, y: 1 }, { x: 1, y: 13 },
    { x: 13, y: 1 }, { x: 13, y: 13 }
  ]
};

// Distribution des jetons : valeur => quantité
const TILE_DISTRIBUTION = {
  0: 5, 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6, 7: 6,
  8: 6, 9: 6, 10: 6, 11: 3, 12: 3, 13: 3, 14: 3, 15: 3
};

class Tile {
  constructor(value, isJoker = false) {
    this.value = value; // 0-15
    this.isJoker = isJoker;
    this.jokerValue = null; // Valeur choisie si joker (0-15)
    this.used = false; // Pour cases spéciales (une seule utilisation)
  }

  getEffectiveValue() {
    return this.isJoker ? (this.jokerValue !== null ? this.jokerValue : 0) : this.value;
  }

  getScoreValue() {
    return this.isJoker ? 0 : this.value;
  }
}

class Placement {
  constructor(x, y, tile) {
    this.x = x;
    this.y = y;
    this.tile = tile;
  }
}

class TrioletGame {
  constructor() {
    this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.bag = [];
    this.players = [];
    this.currentPlayerIndex = 0;
    this.turn = 0;
    this.firstMovePlayed = false;
    this.gameEnded = false;
    this.usedSpecialCells = new Set(); // Cases spéciales déjà utilisées
    
    this.initBag();
  }

  initBag() {
    // Créer les jetons numérotés
    for (let value = 0; value <= 15; value++) {
      const count = TILE_DISTRIBUTION[value] || 0;
      for (let i = 0; i < count; i++) {
        this.bag.push(new Tile(value));
      }
    }
    // Ajouter les 2 jokers
    this.bag.push(new Tile(0, true));
    this.bag.push(new Tile(0, true));
    
    this.shuffleBag();
  }

  shuffleBag() {
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }

  drawTile() {
    return this.bag.length > 0 ? this.bag.pop() : null;
  }

  addPlayer(id, name) {
    const player = {
      id,
      name,
      rack: [],
      score: 0,
      hasDrawnThisTurn: false
    };
    
    // Piocher 3 jetons initiaux
    for (let i = 0; i < 3; i++) {
      const tile = this.drawTile();
      if (tile) player.rack.push(tile);
    }
    
    this.players.push(player);
    return player;
  }

  getCellType(x, y) {
    const key = `${x},${y}`;
    if (this.usedSpecialCells.has(key)) return 'normal';
    
    if (SPECIAL_CELLS.double.some(c => c.x === x && c.y === y)) return 'double';
    if (SPECIAL_CELLS.triple.some(c => c.x === x && c.y === y)) return 'triple';
    if (SPECIAL_CELLS.replay.some(c => c.x === x && c.y === y)) return 'replay';
    return 'normal';
  }

  isValidPlacement(placements) {
    // Règle : 1 à 3 jetons
    if (!placements || placements.length === 0 || placements.length > 3) {
      return { valid: false, error: "Vous devez poser 1, 2 ou 3 jetons" };
    }

    // Vérifier que toutes les positions sont libres
    for (const p of placements) {
      if (this.board[p.y][p.x] !== null) {
        return { valid: false, error: "Case déjà occupée" };
      }
      if (p.x < 0 || p.x >= BOARD_SIZE || p.y < 0 || p.y >= BOARD_SIZE) {
        return { valid: false, error: "Hors du plateau" };
      }
    }

    // Vérifier alignement (même ligne ou même colonne)
    const sameX = placements.every(p => p.x === placements[0].x);
    const sameY = placements.every(p => p.y === placements[0].y);
    
    if (!sameX && !sameY) {
      return { valid: false, error: "Les jetons doivent être alignés" };
    }

    // Vérifier contiguïté des jetons posés (pas d'espaces entre eux)
    if (placements.length > 1) {
      const sorted = [...placements].sort((a, b) => sameX ? a.y - b.y : a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sameX ? sorted[i-1].y : sorted[i-1].x;
        const curr = sameX ? sorted[i].y : sorted[i].x;
        if (curr - prev !== 1) {
          return { valid: false, error: "Les jetons doivent être accolés" };
        }
      }
    }

    // Premier coup : doit être sur la case centrale
    if (!this.firstMovePlayed) {
      const onCenter = placements.some(p => p.x === CENTER.x && p.y === CENTER.y);
      if (!onCenter) {
        return { valid: false, error: "Le premier coup doit couvrir la case centrale" };
      }
    } else {
      // Coups suivants : doit toucher au moins un jeton existant
      const touchesExisting = placements.some(p => this.hasAdjacentTile(p.x, p.y));
      if (!touchesExisting) {
        return { valid: false, error: "Doit toucher un jeton déjà placé" };
      }
    }

    // Vérifier les règles de somme (≤15 pour 2, =15 pour 3)
    const lines = this.getAffectedLines(placements);
    for (const line of lines) {
      const fullLine = this.getFullLine(line.x, line.y, line.dx, line.dy, placements);
      const length = fullLine.length;
      const sum = fullLine.reduce((acc, t) => acc + t.getEffectiveValue(), 0);

      if (length === 2 && sum > 15) {
        return { valid: false, error: `Somme de 2 jetons (${sum}) ne peut pas dépasser 15` };
      }
      if (length === 3 && sum !== 15) {
        return { valid: false, error: `Un Trio doit faire exactement 15 (actuel: ${sum})` };
      }
      if (length > 3) {
        return { valid: false, error: "Pas plus de 3 jetons côte à côte" };
      }
    }

    // Vérifier jokers (max 1 par tour)
    const jokersCount = placements.filter(p => p.tile.isJoker).length;
    if (jokersCount > 1) {
      return { valid: false, error: "Impossible de poser 2 jokers en même temps" };
    }

    return { valid: true };
  }

  hasAdjacentTile(x, y) {
    const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (this.board[ny][nx] !== null) return true;
      }
    }
    return false;
  }

  getAffectedLines(placements) {
    const lines = [];
    // Pour chaque placement, checker horizontal et vertical
    for (const p of placements) {
      // Horizontal
      if (!lines.some(l => l.x === p.x && l.y === p.y && l.dx === 1 && l.dy === 0)) {
        lines.push({ x: p.x, y: p.y, dx: 1, dy: 0 });
      }
      // Vertical
      if (!lines.some(l => l.x === p.x && l.y === p.y && l.dx === 0 && l.dy === 1)) {
        lines.push({ x: p.x, y: p.y, dx: 0, dy: 1 });
      }
    }
    return lines;
  }

  getFullLine(x, y, dx, dy, newPlacements) {
    const tiles = [];
    
    // Reculer au début de la ligne
    let cx = x, cy = y;
    while (true) {
      const nx = cx - dx, ny = cy - dy;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
      if (this.board[ny][nx] === null) break;
      cx = nx; cy = ny;
    }
    
    // Avancer et collecter
    while (true) {
      // Chercher si ce jeton est dans les nouveaux placements
      const newTile = newPlacements.find(p => p.x === cx && p.y === cy);
      if (newTile) {
        tiles.push(newTile.tile);
      } else if (this.board[cy][cx] !== null) {
        tiles.push(this.board[cy][cx]);
      } else {
        break;
      }
      cx += dx; cy += dy;
      if (cx < 0 || cx >= BOARD_SIZE || cy < 0 || cy >= BOARD_SIZE) break;
    }
    
    return tiles;
  }

  calculateScore(placements, isTriolet = false) {
    let totalScore = 0;
    let hasReplay = false;
    const lines = this.getAffectedLines(placements);
    const processedLines = new Set(); // Éviter de compter 2x la même ligne

    for (const line of lines) {
      const lineKey = `${line.x},${line.y},${line.dx},${line.dy}`;
      if (processedLines.has(lineKey)) continue;
      
      const fullLine = this.getFullLine(line.x, line.y, line.dx, line.dy, placements);
      if (fullLine.length < 2) continue; // On ne score que les ensembles de 2 ou 3
      
      processedLines.add(lineKey);
      
      let lineScore = 0;
      const isTrio = fullLine.length === 3;
      
      if (isTrio) {
        // Trio = 15 + 15 bonus = 30 points
        lineScore = 30;
      } else {
        // Duo = somme des valeurs
        lineScore = fullLine.reduce((acc, t) => acc + t.getScoreValue(), 0);
      }

      // Gestion des cases spéciales (x2, x3, replay)
      // On applique le multiplicateur sur l'ensemble si un jeton est sur case spéciale
      let multiplier = 1;
      let hasSpecialInLine = false;
      
      // Vérifier si un jeton de cette ligne est sur une case spéciale non utilisée
      for (const p of placements) {
        const cellType = this.getCellType(p.x, p.y);
        if (cellType === 'replay') hasReplay = true;
        
        if ((cellType === 'double' || cellType === 'triple') && this.isInLine(p, line)) {
          hasSpecialInLine = true;
          multiplier = cellType === 'double' ? 2 : 3;
          // Marquer la case comme utilisée (sera fait définitivement après validation)
        }
      }

      if (hasSpecialInLine && isTrio) {
        // Si Trio sur case spéciale : on double/triple le Trio (30 * mult)
        lineScore *= multiplier;
      } else if (hasSpecialInLine && !isTrio) {
        // Si Duo sur case spéciale : on double/triple la valeur du jeton sur la case
        // Mais pour simplifier et suivant la règle "au choix du joueur", 
        // on applique sur l'ensemble pour maximiser (ou on pourrait demander au joueur)
        lineScore *= multiplier;
      }

      totalScore += lineScore;
    }

    // Bonus Triolet : +50 si pose des 3 jetons de la main formant un Trio, sans joker
    if (isTriolet && placements.length === 3) {
      const hasJoker = placements.some(p => p.tile.isJoker);
      if (!hasJoker) {
        totalScore += 50;
      }
    }

    return {
      score: totalScore,
      replay: hasReplay,
      lines: Array.from(processedLines).length
    };
  }

  isInLine(placement, line) {
    if (line.dx === 1 && line.dy === 0) { // Horizontal
      return placement.y === line.y;
    } else { // Vertical
      return placement.x === line.x;
    }
  }

  playTurn(placements, jokerValues = {}) {
    // jokerValues : { "x,y": valeurChoisie } pour les jokers
    
    // Définir les valeurs des jokers
    for (const p of placements) {
      if (p.tile.isJoker) {
        const key = `${p.x},${p.y}`;
        if (jokerValues[key] !== undefined) {
          p.tile.jokerValue = jokerValues[key];
        } else {
          p.tile.jokerValue = 0; // Défaut
        }
      }
    }

    // Validation
    const validation = this.isValidPlacement(placements);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Vérifier que c'est bien le tour du joueur (optionnel selon l'implémentation UI)
    const player = this.players[this.currentPlayerIndex];
    
    // Vérifier que le joueur possède bien ces jetons
    for (const p of placements) {
      const hasTile = player.rack.some(t => t === p.tile);
      if (!hasTile) {
        return { success: false, error: "Vous ne possédez pas ce jeton" };
      }
    }

    // Déterminer si c'est un Triolet (pose des 3 jetons de la main en un coup)
    const isTriolet = placements.length === 3 && player.rack.length === 3;

    // Calculer le score
    const scoreResult = this.calculateScore(placements, isTriolet);

    // Appliquer le coup
    for (const p of placements) {
      this.board[p.y][p.x] = p.tile;
      // Retirer du rack
      const idx = player.rack.indexOf(p.tile);
      if (idx > -1) player.rack.splice(idx, 1);
      
      // Marquer les cases spéciales comme utilisées
      const key = `${p.x},${p.y}`;
      const cellType = this.getCellType(p.x, p.y);
      if (cellType !== 'normal') {
        this.usedSpecialCells.add(key);
      }
    }

    // Mettre à jour le score
    player.score += scoreResult.score;

    // Premier coup joué
    if (!this.firstMovePlayed) this.firstMovePlayed = true;

    // Piocher de nouveaux jetons pour compléter à 3 (si possible)
    while (player.rack.length < 3 && this.bag.length > 0) {
      const newTile = this.drawTile();
      if (newTile) player.rack.push(newTile);
    }

    // Vérifier fin de partie
    const endGame = this.checkEndGame(player);

    // Passer au joueur suivant (sauf si replay)
    let nextPlayer = this.currentPlayerIndex;
    if (!scoreResult.replay && !endGame.ended) {
      nextPlayer = (this.currentPlayerIndex + 1) % this.players.length;
      this.currentPlayerIndex = nextPlayer;
    }

    return {
      success: true,
      score: scoreResult.score,
      replay: scoreResult.replay,
      isTriolet,
      nextPlayer,
      endGame,
      board: this.board,
      rack: player.rack
    };
  }

  checkEndGame(currentPlayer) {
    // Fin si sac vide et un joueur a posé son dernier jeton
    if (this.bag.length === 0 && currentPlayer.rack.length === 0) {
      // Calcul des scores de fin
      const winner = this.calculateEndGameScores(currentPlayer);
      return { ended: true, winner };
    }
    
    // Cas exceptionnel : sac vide, personne ne peut jouer
    if (this.bag.length === 0) {
      const canPlay = this.players.some(p => this.canPlayerPlay(p));
      if (!canPlay) {
        // Chacun soustrait ses jetons restants
        this.players.forEach(p => {
          const remaining = p.rack.reduce((sum, t) => sum + t.getScoreValue(), 0);
          p.score -= remaining;
        });
        const winner = this.players.reduce((best, p) => p.score > best.score ? p : best);
        return { ended: true, winner };
      }
    }
    
    return { ended: false };
  }

  calculateEndGameScores(emptyPlayer) {
    // Le joueur vide ajoute la valeur des jetons adverses à son score
    let bonus = 0;
    this.players.forEach(p => {
      if (p !== emptyPlayer) {
        bonus += p.rack.reduce((sum, t) => sum + t.getScoreValue(), 0);
      }
    });
    emptyPlayer.score += bonus;
    
    return this.players.reduce((best, p) => p.score > best.score ? p : best);
  }

  canPlayerPlay(player) {
    // Simplification : on suppose qu'il peut toujours jouer s'il a des jetons
    // (La vérification complète nécessiterait de tester toutes les possibilités)
    return player.rack.length > 0;
  }

  exchangeTiles(playerIndex, tilesToExchange) {
    // Action alternative : échanger 1, 2 ou 3 jetons (si sac >= 5)
    if (this.bag.length < 5) {
      return { success: false, error: "Pas assez de jetons dans le sac (minimum 5)" };
    }
    
    const player = this.players[playerIndex];
    if (tilesToExchange.length > player.rack.length) {
      return { success: false, error: "Pas assez de jetons en main" };
    }

    // Retourner les jetons
    tilesToExchange.forEach(tile => {
      const idx = player.rack.indexOf(tile);
      if (idx > -1) {
        player.rack.splice(idx, 1);
        this.bag.push(tile);
      }
    });

    this.shuffleBag();

    // Piocher le même nombre
    tilesToExchange.forEach(() => {
      const newTile = this.drawTile();
      if (newTile) player.rack.push(newTile);
    });

    // Passer au joueur suivant
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    return { 
      success: true, 
      newRack: player.rack,
      nextPlayer: this.currentPlayerIndex 
    };
  }

  // Utilitaires pour l'UI
  getBoardState() {
    return this.board;
  }

  getPlayerState(playerIndex) {
    return this.players[playerIndex];
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getBagCount() {
    return this.bag.length;
  }
}

// Export pour modules ou usage global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TrioletGame, Tile, Placement };
}

// Exemple d'utilisation / Test rapide :
/*
const game = new TrioletGame();
game.addPlayer(1, "Alice");
game.addPlayer(2, "Bob");

// Premier coup (doit être au centre)
const p1 = game.players[0];
const tile1 = p1.rack[0];
const result = game.playTurn([
  { x: 7, y: 7, tile: tile1 }
]);
console.log(result);
*/
