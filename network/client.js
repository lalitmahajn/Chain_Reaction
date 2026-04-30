import { PeerManager } from './peer.js';

export class GameClient {
    constructor(callbacks) {
        this.callbacks = callbacks; // { onPlayerList, onStart, onMove }
        this.peerManager = new PeerManager(
            null,
            this.handleData.bind(this),
            () => { if (this.callbacks.onDisconnect) this.callbacks.onDisconnect(); }
        );
        this.hostPeerId = null;
    }

    async join(roomName, name) {
        // We use a random ID for the client but connect to the prefixed room name
        await this.peerManager.init(Math.random().toString(36).substr(2, 9));
        const conn = this.peerManager.connect(roomName);
        
        conn.on('open', () => {
            this.hostPeerId = conn.peer;
            conn.send({
                type: 'JOIN',
                name: name
            });
        });
    }

    handleData(peerId, data) {
        switch (data.type) {
            case 'PLAYER_LIST':
                if (this.callbacks.onPlayerList) this.callbacks.onPlayerList(data.players);
                break;
            case 'START_GAME':
                if (this.callbacks.onStart) this.callbacks.onStart(data.gridConfig, data.players, data.gameState);
                break;
            case 'MOVE':
                if (this.callbacks.onMove) this.callbacks.onMove(data.x, data.y, data.playerId, data.nextTurnIndex);
                break;
            case 'PLAYER_KICKED':
                if (this.callbacks.onPlayerKicked) this.callbacks.onPlayerKicked(data.playerId);
                break;
            case 'REJECT_MOVE':
                if (this.callbacks.onReject) this.callbacks.onReject();
                break;
        }
    }

    sendMove(x, y) {
        this.peerManager.broadcast({
            type: 'REQUEST_MOVE',
            x, y
        });
    }
}
