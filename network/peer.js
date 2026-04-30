/**
 * Common PeerJS wrapper
 */

export const PEER_PREFIX = 'cr-v1-';

export class PeerManager {
    constructor(onConnection, onData, onDisconnect) {
        this.peer = null;
        this.connections = new Map();
        this.onConnection = onConnection;
        this.onData = onData;
        this.onDisconnect = onDisconnect;
    }

    init(id) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer(PEER_PREFIX + id);
            
            this.peer.on('open', (id) => {
                console.log('Peer open with ID:', id);
                resolve(id);
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                reject(err);
            });

            this.peer.on('connection', (conn) => {
                this.setupConnection(conn);
            });
        });
    }

    setupConnection(conn) {
        console.log('Setup connection for:', conn.peer);
        conn.on('open', () => {
            console.log('SUCCESS: Connection opened to:', conn.peer);
            this.connections.set(conn.peer, conn);
            if (this.onConnection) this.onConnection(conn);
        });

        conn.on('data', (data) => {
            console.log('DEBUG: Data received from', conn.peer, data);
            if (this.onData) this.onData(conn.peer, data);
        });

        conn.on('close', () => {
            console.log('WARNING: Connection closed:', conn.peer);
            this.connections.delete(conn.peer);
            if (this.onDisconnect) this.onDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('ERROR: Connection error for', conn.peer, err);
        });
    }

    connect(targetId) {
        const conn = this.peer.connect(PEER_PREFIX + targetId);
        this.setupConnection(conn);
        return conn;
    }

    broadcast(data) {
        this.connections.forEach(conn => {
            conn.send(data);
        });
    }

    sendTo(peerId, data) {
        const conn = this.connections.get(peerId);
        if (conn) conn.send(data);
    }

    disconnectPeer(peerId) {
        const conn = this.connections.get(peerId);
        if (conn) {
            conn.close();
            this.connections.delete(peerId);
        }
    }
}
