import GameScene from './gameScene.js';
import { GameHost } from '../network/host.js';
import { GameClient } from '../network/client.js';

let game;
let networkRole = null;

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%'
    },
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
const modeHostBtn = document.getElementById('mode-host-btn');
const modeJoinBtn = document.getElementById('mode-join-btn');
const roomContainer = document.getElementById('room-input-container');
const roomLabel = document.getElementById('room-label');
const roomInput = document.getElementById('room-input');
const confirmBtn = document.getElementById('confirm-btn');
const startBtn = document.getElementById('start-game-btn');

let currentMode = null; // 'host' or 'join'

const playerListUI = document.getElementById('player-list');
const playerCountUI = document.getElementById('player-count');

// Load saved name
const savedName = localStorage.getItem('cr-player-name');
if (savedName) nameInput.value = savedName;

const chatMessagesUI = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

function addChatMessage(sender, text) {
    if (!chatMessagesUI) return;
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<span class="sender">${sender}:</span><span class="text">${text}</span>`;
    chatMessagesUI.appendChild(msg);
    chatMessagesUI.scrollTop = chatMessagesUI.scrollHeight;
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
            <div class="player-name">${p.name} ${p.id === 1 ? '<br><small>(Host)</small>' : ''}${p.disconnected ? '<br><small>(Offline)</small>' : ''}</div>
        `;
        playerListUI.appendChild(li);
    });

    // Also update GameScene if it exists
    if (game) {
        const scene = game.scene.getScene('GameScene');
        if (scene) {
            // Update in-place to keep references in GameEngine valid
            scene.players.splice(0, scene.players.length, ...players);
            scene.updatePlayerStats();
        }
    }
}

// Networking Callbacks
const onStartGame = (gridConfig, players, gameState) => {
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
            gameState,
            onMoveRequested: (x, y) => {
                if (networkRole.sendMove) {
                    networkRole.sendMove(x, y);
                } else {
                    handleHostMoveRequest(networkRole.peerManager.peer.id, x, y);
                }
            },
            onKickRequested: (playerId) => {
                if (networkRole.kickPlayer) {
                    networkRole.kickPlayer(playerId);
                }
            }
        });

        // Setup role-specific callbacks
        if (!isHost) {
            networkRole.callbacks.onMove = (x, y, playerId, nextTurnIndex) => {
                const scene = game.scene.getScene('GameScene');
                if (scene) scene.events.emit('remote-move', { x, y, playerId, nextTurnIndex });
            };
            networkRole.callbacks.onReject = () => {
                const scene = game.scene.getScene('GameScene');
                if (scene) scene.isAnimating = false;
            };
            networkRole.callbacks.onPlayerKicked = (playerId) => {
                if (playerId === localPlayerId) {
                    alert('You have been kicked from the room.');
                    location.reload();
                    return;
                }
                const scene = game.scene.getScene('GameScene');
                if (scene) scene.removePlayer(playerId);
            };
        } else {
            networkRole.callbacks.onPlayerKicked = (playerId) => {
                const scene = game.scene.getScene('GameScene');
                if (scene) scene.removePlayer(playerId);
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
        // Host calculates the next turn state
        const result = scene.engine.applyMove(x, y, player.id);
        
        // Broadcast the move AND the next turn to everyone
        networkRole.broadcastMove(x, y, player.id, scene.engine.turnIndex);
        
        // Host handles its own animation (engine state already updated above)
        scene.playSound('move');
        scene.animateMove(result);
    } else {
        networkRole.rejectMove(peerId);
    }
};

// Menu Mode Selection
modeHostBtn.addEventListener('click', () => {
    currentMode = 'host';
    modeHostBtn.classList.add('active');
    modeJoinBtn.classList.remove('active');
    roomContainer.classList.remove('hidden');
    roomLabel.innerText = 'Create Room Name';
    roomInput.placeholder = 'e.g. My Secret Room';
    confirmBtn.innerText = 'Create Lobby';
});

modeJoinBtn.addEventListener('click', () => {
    currentMode = 'join';
    modeJoinBtn.classList.add('active');
    modeHostBtn.classList.remove('active');
    roomContainer.classList.remove('hidden');
    roomLabel.innerText = 'Enter Room ID';
    roomInput.placeholder = 'e.g. abcd-1234';
    confirmBtn.innerText = 'Join Game';
});

confirmBtn.addEventListener('click', async () => {
    const playerName = nameInput.value.trim() || (currentMode === 'host' ? 'Host' : 'Guest');
    const roomName = roomInput.value.trim();
    
    if (!roomName) return alert('Please enter a room name');
    
    localStorage.setItem('cr-player-name', playerName);
    document.getElementById('display-room-name').innerText = roomName;
    document.querySelector('#room-code-display span').innerText = roomName;

    if (currentMode === 'host') {
        networkRole = new GameHost(roomName, {
            onPlayerJoined: (players) => updatePlayerListUI(players),
            onMoveReceived: (peerId, x, y) => handleHostMoveRequest(peerId, x, y),
            onChat: (sender, text) => addChatMessage(sender, text),
            onStart: onStartGame,
            onSyncRequested: () => {
                const scene = game.scene.getScene('GameScene');
                return scene ? scene.engine.getState() : null;
            }
        });
        await networkRole.start(playerName);
        showScreen('lobby');
        document.getElementById('host-controls').classList.remove('hidden');
        document.getElementById('waiting-msg').classList.add('hidden');
    } else {
        networkRole = new GameClient({
            onPlayerList: (players) => updatePlayerListUI(players),
            onChat: (sender, text) => addChatMessage(sender, text),
            onStart: onStartGame,
            onMove: (x, y, pid, nextTurnIndex) => {
                // Handled in onStartGame
            }
        });
        await networkRole.join(roomName, playerName);
        showScreen('lobby');
    }
});

startBtn.addEventListener('click', () => {
    if (networkRole && networkRole.broadcastMove) {
        const [w, h] = document.getElementById('grid-config').value.split('x').map(Number);
        networkRole.startGame({ width: w, height: h });
    }
});

// Click to Copy Room ID
document.getElementById('room-code-display').addEventListener('click', () => {
    const roomCode = document.querySelector('#room-code-display span').innerText;
    navigator.clipboard.writeText(roomCode).then(() => {
        const originalText = document.getElementById('room-code-display').innerHTML;
        document.getElementById('room-code-display').innerText = 'COPIED!';
        setTimeout(() => {
            document.getElementById('room-code-display').innerHTML = originalText;
        }, 2000);
    });
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const text = chatInput.value.trim();
        if (text && networkRole && networkRole.sendChat) {
            networkRole.sendChat(text);
            chatInput.value = '';
        }
    }
});
