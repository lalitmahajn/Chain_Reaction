import GameScene from './gameScene.js';
import { GameHost } from '../network/host.js';
import { GameClient } from '../network/client.js';

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0f172a',
    scene: [] // Start scenes manually to avoid double-init
};

let game;
let networkRole; // Host or Client object

// DOM Elements
const screens = {
    menu: document.getElementById('menu-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-ui')
};

const buttons = {
    host: document.getElementById('host-btn'),
    join: document.getElementById('join-btn'),
    start: document.getElementById('start-game-btn')
};

const playerListUI = document.getElementById('player-list');
const playerCountUI = document.getElementById('player-count');

// Helper to switch screens
function showScreen(name) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.remove('active');
    });
    screens[name].classList.add('active');
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
    
    // Add scene manually
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

        // Listen for moves/rejections from network
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
    console.log("Host: Received move request from", peerId, { x, y });
    const scene = game.scene.getScene('GameScene');
    if (!scene || !scene.engine) {
        console.warn("Host: Scene or Engine not ready");
        return;
    }

    const player = networkRole.players.find(p => p.peerId === peerId);
    if (!player) {
        console.warn("Host: Player not found for peerId", peerId);
        return;
    }

    if (scene.engine.isValidMove(x, y, player.id)) {
        console.log("Host: Move valid, broadcasting to all");
        networkRole.broadcastMove(x, y, player.id);
        scene.events.emit('remote-move', { x, y, playerId: player.id });
    } else {
        console.warn("Host: Invalid move attempt", { x, y, player: player.name });
        networkRole.rejectMove(peerId);
    }
};

// Button Actions
buttons.host.onclick = async () => {
    const name = document.getElementById('room-name').value || 'MyRoom';
    document.getElementById('display-room-name').innerText = name;
    
    networkRole = new GameHost(name, {
        onPlayerJoined: (players) => updatePlayerListUI(players),
        onMoveReceived: (peerId, x, y) => handleHostMoveRequest(peerId, x, y),
        onStart: onStartGame
    });

    await networkRole.start();
    showScreen('lobby');
    document.getElementById('host-controls').classList.remove('hidden');
    document.getElementById('waiting-msg').classList.add('hidden');
};

buttons.join.onclick = async () => {
    const roomName = document.getElementById('join-room-name').value;
    if (!roomName) return alert("Please enter a Room ID");

    networkRole = new GameClient({
        onPlayerList: (players) => updatePlayerListUI(players),
        onStart: onStartGame,
        onMove: (x, y, playerId) => {
            // This is handled in onStartGame for the scene reference
        }
    });

    await networkRole.join(roomName, "Guest " + Math.floor(Math.random() * 1000));
    showScreen('lobby');
};

buttons.start.onclick = () => {
    const gridConfigStr = document.getElementById('grid-config').value;
    const [w, h] = gridConfigStr.split('x').map(Number);
    networkRole.startGame({ width: w, height: h });
};

window.addEventListener('resize', () => {
    if (game) game.scale.resize(window.innerWidth, window.innerHeight);
});
