import { PeerManager } from './peer.js';

export class GameHost {
    constructor(roomName, callbacks) {
        this.roomName = roomName;
        this.callbacks = callbacks; // { onPlayerJoined, onMoveReceived, onStart }
        this.players = []; // [{ peerId, name, color, id }]
        this.gameStarted = false;
        this.currentGridConfig = null;
        this.peerManager = new PeerManager(
            this.handleNewConnection.bind(this),
            this.handleData.bind(this),
            this.handleDisconnect.bind(this)
        );
        
        // Colors palette (Neon)
        this.colorPalette = [0xef4444, 0x06b6d4, 0x22c55e, 0xeab308, 0xa855f7, 0xf97316, 0xec4899, 0x64748b];
    }

    async start(hostName = "Host") {
        await this.peerManager.init(this.roomName);
        // Host is always Player 1
        this.addPlayer(this.peerManager.peer.id, hostName, true);
    }

    handleNewConnection(conn) {
        // A new peer connected, but we don't know their name yet
        // We wait for a 'JOIN' message
    }

    handleData(peerId, data) {
        switch (data.type) {
            case 'JOIN':
                this.addPlayer(peerId, data.name);
                if (this.gameStarted) {
                    // Tell this specific player to start
                    this.peerManager.sendTo(peerId, {
                        type: 'START_GAME',
                        gridConfig: this.currentGridConfig,
                        players: this.players
                    });
                }
                break;
            case 'REQUEST_MOVE':
                if (this.callbacks.onMoveReceived) {
                    this.callbacks.onMoveReceived(peerId, data.x, data.y);
                }
                break;
        }
    }

    handleDisconnect(peerId) {
        this.players = this.players.filter(p => p.peerId !== peerId);
        this.broadcastPlayerList();
        if (this.callbacks.onPlayerJoined) {
            this.callbacks.onPlayerJoined(this.players);
        }
    }

    addPlayer(peerId, name, isHost = false) {
        if (this.players.length >= 8) return;

        const player = {
            peerId,
            name,
            id: this.players.length + 1,
            color: this.colorPalette[this.players.length]
        };

        this.players.push(player);
        
        // Broadcast new player list to everyone
        this.broadcastPlayerList();
        
        if (this.callbacks.onPlayerJoined) {
            this.callbacks.onPlayerJoined(this.players);
        }
    }

    broadcastPlayerList() {
        this.peerManager.broadcast({
            type: 'PLAYER_LIST',
            players: this.players
        });
    }

    startGame(gridConfig) {
        this.gameStarted = true;
        this.currentGridConfig = gridConfig;
        this.peerManager.broadcast({
            type: 'START_GAME',
            gridConfig,
            players: this.players
        });
        if (this.callbacks.onStart) {
            this.callbacks.onStart(gridConfig, this.players);
        }
    }

    broadcastMove(x, y, playerId) {
        this.peerManager.broadcast({
            type: 'MOVE',
            x, y, playerId
        });
    }

    rejectMove(peerId) {
        this.peerManager.sendTo(peerId, { type: 'REJECT_MOVE' });
    }
}
