import GameScene from './gameScene.js';
import { GameHost } from '../network/host.js';
import { GameClient } from '../network/client.js';

let game;
let networkRole = null;

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0f172a',
    transparent: true,
    scene: [] 
};

// UI Elements
const screens = {
    menu: document.getElementById('menu-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-ui')
};

const nameInput = document.getElementById('player-name');
const roomInput = document.getElementById('room-name');
const joinRoomInput = document.getElementById('join-room-name');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const startBtn = document.getElementById('start-game-btn');

const playerListUI = document.getElementById('player-list');
const playerCountUI = document.getElementById('player-count');

// Load saved name
const savedName = localStorage.getItem('cr-player-name');
if (savedName) nameInput.value = savedName;

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

function updatePlayerListUI(players) {
    playerListUI.innerHTML = '';
    playerCountUI.innerText = players.length;
    const localPeerId = networkRole.peerManager.peer.id;
    
    players.forEach(p => {
        const isYou = p.peerId === localPeerId;
        const li = document.createElement('li');
        li.className = 'player-item';
        li.innerHTML = `
            ${isYou ? '<span class="you-badge">YOU</span>' : ''}
            <div class="player-color-dot" style="background-color: #${p.color.toString(16).padStart(6, '0')}; color: #${p.color.toString(16).padStart(6, '0')}"></div>
            <div class="player-name">${p.name} ${p.id === 1 ? '<br><small>(Host)</small>' : ''}</div>
        `;
        playerListUI.appendChild(li);
    });
}

// Networking Callbacks
const onStartGame = (gridConfig, players) => {
    const isHost = !!networkRole.broadcastMove;
    const localPlayer = players.find(p => p.peerId === networkRole.peerManager.peer.id);
    const localPlayerId = localPlayer ? localPlayer.id : null;

    showScreen('game');
    game = new Phaser.Game(config);
    game.scene.add('GameScene', GameScene);

    game.events.once('ready', () => {
        game.scene.start('GameScene', {
            gridConfig,
            players,
            isHost,
            localPlayerId,
            onMoveRequested: (x, y) => {
                if (networkRole.sendMove) {
                    networkRole.sendMove(x, y);
                } else {
                    handleHostMoveRequest(networkRole.peerManager.peer.id, x, y);
                }
            }
        });

        if (!isHost) {
            networkRole.callbacks.onMove = (x, y, playerId) => {
                const scene = game.scene.getScene('GameScene');
                if (scene) scene.events.emit('remote-move', { x, y, playerId });
            };
            networkRole.callbacks.onReject = () => {
                const scene = game.scene.getScene('GameScene');
                if (scene) scene.isAnimating = false;
            };
        }
    });
};

const handleHostMoveRequest = (peerId, x, y) => {
    const scene = game.scene.getScene('GameScene');
    if (!scene) return;
    
    const player = networkRole.players.find(p => p.peerId === peerId);
    if (!player) return;

    if (scene.engine.isValidMove(x, y, player.id)) {
        networkRole.broadcastMove(x, y, player.id);
        scene.events.emit('remote-move', { x, y, playerId: player.id });
    } else {
        networkRole.rejectMove(peerId);
    }
};

// Event Listeners
hostBtn.addEventListener('click', async () => {
    const roomName = roomInput.value.trim();
    const playerName = nameInput.value.trim() || 'Host';
    if (!roomName) return alert('Enter room name');
    
    localStorage.setItem('cr-player-name', playerName);
    document.getElementById('display-room-name').innerText = roomName;
    
    networkRole = new GameHost(roomName, {
        onPlayerJoined: (players) => updatePlayerListUI(players),
        onMoveReceived: (peerId, x, y) => handleHostMoveRequest(peerId, x, y),
        onStart: onStartGame
    });

    await networkRole.start(playerName);
    showScreen('lobby');
    document.getElementById('host-controls').classList.remove('hidden');
    document.getElementById('waiting-msg').classList.add('hidden');
});

joinBtn.addEventListener('click', async () => {
    const roomName = joinRoomInput.value.trim();
    const playerName = nameInput.value.trim() || 'Guest';
    if (!roomName) return alert('Enter Room ID');
    
    localStorage.setItem('cr-player-name', playerName);
    document.getElementById('display-room-name').innerText = roomName;
    
    networkRole = new GameClient({
        onPlayerList: (players) => updatePlayerListUI(players),
        onStart: onStartGame,
        onMove: (x, y, pid) => {
             // This will be set properly in onStartGame
        }
    });

    await networkRole.join(roomName, playerName);
    showScreen('lobby');
});

startBtn.addEventListener('click', () => {
    if (networkRole && networkRole.broadcastMove) {
        const [w, h] = document.getElementById('grid-config').value.split('x').map(Number);
        networkRole.startGame(w, h);
    }
});
