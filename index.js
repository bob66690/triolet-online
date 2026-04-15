document.addEventListener('DOMContentLoaded', () => {
    const board = document.getElementById('board');
    const messageDiv = document.getElementById('message');
    const newGameButton = document.getElementById('new-game');
    const undoButton = document.getElementById('undo');

    let game = null;
    let moveHistory = []; // Pour l'historique des coups

    function initGame() {
        game = {
            board: Array(8).fill(null).map(() => Array(8).fill(null)),
            currentPlayer: 'black', // Les noirs commencent
            gameOver: false,
            winner: null,
            validMoves: []
        };
        initializePieces();
        calculateValidMoves();
        renderBoard();
        updateMessage(`Nouvelle partie ! C'est au tour des ${game.currentPlayer}s.`);
        moveHistory = []; // Réinitialiser l'historique
    }

    function initializePieces() {
        // Position initiale standard
        game.board[3][3] = 'white';
        game.board[3][4] = 'black';
        game.board[4][3] = 'black';
        game.board[4][4] = 'white';
    }

    function calculateValidMoves() {
        game.validMoves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (isValidMove(row, col, game.currentPlayer)) {
                    game.validMoves.push({row, col});
                }
            }
        }
    }

    function isValidMove(row, col, player) {
        if (game.board[row][col] !== null) return false;
        
        const opponent = player === 'white' ? 'black' : 'white';
        let hasValidDirection = false;
        
        // Directions: haut, bas, gauche, droite, diagonales
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];
        
        for (const [dRow, dCol] of directions) {
            let r = row + dRow;
            let c = col + dCol;
            let foundOpponent = false;
            
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                if (game.board[r][c] === null) break;
                if (game.board[r][c] === opponent) {
                    foundOpponent = true;
                } else if (game.board[r][c] === player && foundOpponent) {
                    return true; // Coup valide
                } else {
                    break;
                }
                r += dRow;
                c += dCol;
            }
        }
        
        return false;
    }

    function makeMove(row, col) {
        if (!game.validMoves.some(m => m.row === row && m.col === col)) return;
        
        // Sauvegarder l'état actuel
        moveHistory.push(JSON.parse(JSON.stringify(game)));
        
        // Placer la pièce
        game.board[row][col] = game.currentPlayer;
        
        // Retourner les pièces capturées
        flipPieces(row, col, game.currentPlayer);
        
        // Vérifier s'il y a des coups valides pour l'adversaire
        game.currentPlayer = game.currentPlayer === 'white' ? 'black' : 'white';
        calculateValidMoves();
        
        // Si le joueur actuel n'a pas de coups valides, passer au joueur suivant
        if (game.validMoves.length === 0) {
            game.currentPlayer = game.currentPlayer === 'white' ? 'black' : 'white';
            calculateValidMoves();
            if (game.validMoves.length === 0) {
                endGame();
            } else {
                updateMessage(`Aucun coup valide pour les ${game.currentPlayer === 'white' ? 'blancs' : 'noirs'}. Passage de tour.`);
            }
        } else {
            updateMessage(`C'est au tour des ${game.currentPlayer}s.`);
        }
        
        renderBoard();
        updateScore();
    }

    function flipPieces(row, col, player) {
        const opponent = player === 'white' ? 'black' : 'white';
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];
        
        for (const [dRow, dCol] of directions) {
            let r = row + dRow;
            let c = col + dCol;
            let piecesToFlip = [];
            let foundPlayer = false;
            
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                if (game.board[r][c] === null) break;
                if (game.board[r][c] === opponent) {
                    piecesToFlip.push({r, c});
                } else if (game.board[r][c] === player && piecesToFlip.length > 0) {
                    foundPlayer = true;
                    break;
                } else {
                    break;
                }
                r += dRow;
                c += dCol;
            }
            
            if (foundPlayer) {
                for (const {r, c} of piecesToFlip) {
                    game.board[r][c] = player;
                }
            }
        }
    }

    function endGame() {
        game.gameOver = true;
        const whiteCount = countPieces('white');
        const blackCount = countPieces('black');
        
        if (whiteCount > blackCount) {
            game.winner = 'white';
            updateMessage(`Partie terminée ! Les blancs gagnent ${whiteCount} à ${blackCount}.`);
        } else if (blackCount > whiteCount) {
            game.winner = 'black';
            updateMessage(`Partie terminée ! Les noirs gagnent ${blackCount} à ${whiteCount}.`);
        } else {
            game.winner = 'draw';
            updateMessage(`Partie terminée ! Égalité ${whiteCount} partout.`);
        }
    }

    function countPieces(color) {
        let count = 0;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (game.board[row][col] === color) count++;
            }
        }
        return count;
    }

    function updateScore() {
        const whiteCount = countPieces('white');
        const blackCount = countPieces('black');
        updateMessage(`${whiteCount} blancs - ${blackCount} noirs`);
    }

    function undo() {
        if (moveHistory.length > 0) {
            game = moveHistory.pop();
            // Retourner au joueur précédent
            game.currentPlayer = game.currentPlayer === 'white' ? 'black' : 'white';
            calculateValidMoves();
            renderBoard();
            updateScore();
            updateMessage(`C'est au tour des ${game.currentPlayer}s.`);
        }
    }

    function renderBoard() {
        board.innerHTML = '';
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Ajouter une pièce si présente
                if (game.board[row][col]) {
                    const piece = document.createElement('div');
                    piece.className = `piece ${game.board[row][col]}`;
                    cell.appendChild(piece);
                }
                
                // Mettre en évidence les coups valides
                if (!game.gameOver && game.validMoves.some(m => m.row === row && m.col === col)) {
                    cell.classList.add('valid-move');
                    cell.style.backgroundColor = '#90EE90';
                }
                
                // Gestion des clics
                cell.addEventListener('click', () => handleCellClick(row, col));
                board.appendChild(cell);
            }
        }
    }

    function handleCellClick(row, col) {
        if (game.gameOver) return;
        makeMove(row, col);
    }

    function updateMessage(text) {
        messageDiv.textContent = text;
    }

    newGameButton.addEventListener('click', initGame);
    undoButton.addEventListener('click', undo);

    initGame();
});
