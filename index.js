const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const rooms = new Map();

function buildBag() {
  const counts = [9,9,8,8,7,8,6,6,4,4,3,3,2,2,1,1];
  const bag = [];
  counts.forEach((cnt, val) => {
    for (let i = 0; i < cnt; i++) {
      bag.push({ val, id: `${val}-${i}`, isJoker: false });
    }
  });
  bag.push({ val: null, id: 'joker-0', isJoker: true });
  bag.push({ val: null, id: 'joker-1', isJoker: true });
  return shuffle(bag);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initGameState(players) {
  const PLAYER_COLORS = ["#e63946","#06d6a0","#ffd166","#118ab2"];
  const bag = buildBag();
  bag.splice(0, 3);
  
  const gamePlayers = players.map((p, i) => ({
    ...p,
    color: PLAYER_COLORS[i],
    hand: [bag.shift(), bag.shift(), bag.shift()],
    score: 0
  }));

  const drawn = gamePlayers.map(() => bag.shift());
  const vals = drawn.map(t => t.isJoker ? 0 : t.val);
  const maxVal = Math.max(...vals);
  const winners = vals.reduce((acc, v, i) => v === maxVal ? [...acc, i] : acc, []);
  const first = winners[Math.floor(Math.random() * winners.length)];

  gamePlayers.forEach((p, i) => {
    p.hand[0] = drawn[i];
  });

  return {
    players: gamePlayers,
    bag,
    grid: Array.from({ length: 15 }, () => Array(15).fill(null)),
    currentPlayer: first,
    turnCount: 0,
    specialUsedGame: [],
    gameOver: false
  };
}

io.on('connection', (socket) => {
  console.log('✅ Connecté:', socket.id);

  socket.on('getRooms', () => {
    socket.emit('roomList', Array.from(rooms.values()).map(r => ({
      id: r.id, name: r.name, players: r.players.length, status: r.status
    })));
  });

  socket.on('createRoom', ({ name, player }) => {
    const roomId = 'R' + Date.now();
    const room = {
      id: roomId,
      name,
      players: [{ id: socket.id, ...player }],
      host: socket.id,
      status: 'waiting',
      gameState: null
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.emit('joined', room);
    io.emit('roomList', Array.from(rooms.values()).map(r => ({
      id: r.id, name: r.name, players: r.players.length, status: r.status
    })));
  });

  socket.on('joinRoom', ({ roomId, player }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.players.some(p => p.id === socket.id)) return socket.emit('joined', room);
    room.players.push({ id: socket.id, ...player });
    socket.join(roomId);
    io.to(roomId).emit('updateRoom', room);
    io.emit('roomList', Array.from(rooms.values()).map(r => ({
      id: r.id, name: r.name, players: r.players.length, status: r.status
    })));
  });

  socket.on('chat', ({ roomId, name, text }) => {
    io.to(roomId).emit('chatMsg', { name, text, time: new Date().toLocaleTimeString() });
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id) return;
    room.gameState = initGameState(room.players);
    room.status = 'playing';
    io.to(roomId).emit('gameStarted', { message: '🎮 Partie lancée !', gameState: room.gameState });
    io.emit('roomList', Array.from(rooms.values()).map(r => ({
      id: r.id, name: r.name, players: r.players.length, status: r.status
    })));
  });

  socket.on('playTurn', ({ roomId, placements }) => {
    const room = rooms.get(roomId);
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    if (gs.players[gs.currentPlayer].id !== socket.id) return;

    const newGrid = gs.grid.map(row => [...row]);
    placements.forEach(p => { newGrid[p.r][p.c] = p.token; });

    const newPlayers = gs.players.map((pl, i) => {
      if (i !== gs.currentPlayer) return pl;
      const newHand = [...pl.hand];
      placements.forEach(p => { newHand[p.handIdx] = null; });
      for (let j = 0; j < 3; j++) {
        if (newHand[j] === null && gs.bag.length > 0) newHand[j] = gs.bag.shift();
      }
      return { ...pl, hand: newHand, score: pl.score + (placements.length * 5) };
    });

    room.gameState = {
      ...gs,
      players: newPlayers,
      grid: newGrid,
      currentPlayer: (gs.currentPlayer + 1) % gs.players.length,
      turnCount: gs.turnCount + 1,
      gameOver: gs.bag.length === 0 && newPlayers.every(p => p.hand.every(t => !t))
    };

    io.to(roomId).emit('gameUpdate', room.gameState);
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, id) => {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx > -1) {
        room.players.splice(idx, 1);
        if (room.players.length === 0) rooms.delete(id);
        else {
          if (room.host === socket.id) room.host = room.players[0].id;
          io.to(id).emit('updateRoom', room);
        }
        io.emit('roomList', Array.from(rooms.values()).map(r => ({
          id: r.id, name: r.name, players: r.players.length, status: r.status
        })));
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🎮 Serveur sur port', PORT));
