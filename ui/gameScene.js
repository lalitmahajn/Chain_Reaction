import { GameEngine } from '../game/engine.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.padding = 16;
    }

    init(data) {
        this.setupAudio();
        this.gridConfig = data.gridConfig || { width: 6, height: 9 };

        this.players = data.players || [
            { id: 1, name: 'Player 1', color: 0xff0000 },
            { id: 2, name: 'Player 2', color: 0x00ff00 }
        ];
        this.isHost = data.isHost;
        this.localPlayerId = data.localPlayerId;
        this.engine = new GameEngine(this.gridConfig.width, this.gridConfig.height, this.players);
        
        if (data.gameState) {
            this.engine.setState(data.gameState);
        }

        this.onMoveRequested = data.onMoveRequested; // Callback for networking
        this.onKickRequested = data.onKickRequested; // Callback for host to kick
        
        // UI references
        this.turnIndicator = document.getElementById('turn-indicator');
        this.playerStatsUI = document.getElementById('player-stats');

        // Calculate dynamic cell size based on viewport
        this.calculateCellSize();
    }

    calculateCellSize() {
        const { width, height } = this.gridConfig;
        const camW = this.cameras.main.width;
        const camH = this.cameras.main.height;

        // Reserve space for the game-ui header (turn indicator + player stats)
        const isMobile = camW < 600;
        const uiHeaderHeight = isMobile ? 60 : 80;
        const bottomPadding = this.padding;

        const availableWidth = camW - (this.padding * 2);
        const availableHeight = camH - uiHeaderHeight - bottomPadding;

        // Pick the largest cell that fits both dimensions
        const maxCellW = Math.floor(availableWidth / width);
        const maxCellH = Math.floor(availableHeight / height);
        this.cellSize = Math.min(maxCellW, maxCellH);

        // Clamp to a reasonable range
        this.cellSize = Math.max(24, Math.min(this.cellSize, 80));

        // Store the header height for grid offset
        this.uiHeaderHeight = uiHeaderHeight;
    }

    create() {
        this.createFlareTexture();
        this.createGrid();
        this.refreshBoard();
        this.updateTurnIndicator();
        this.updatePlayerStats();
        this.isAnimating = false;
        
        // Event listener for moves coming from network
        this.events.on('remote-move', (move) => {
            this.handleMove(move.x, move.y, move.playerId, move.nextTurnIndex);
        });

        // Handle window resize
        this.scale.on('resize', this.onResize, this);
    }

    onResize() {
        this.calculateCellSize();
        this.repositionGrid();
    }

    repositionGrid() {
        const { width, height } = this.gridConfig;
        const gridPixelW = width * this.cellSize;
        const gridPixelH = height * this.cellSize;

        const startX = (this.cameras.main.width - gridPixelW) / 2;
        const availableBelow = this.cameras.main.height - this.uiHeaderHeight - this.padding;
        const startY = this.uiHeaderHeight + (availableBelow - gridPixelH) / 2;
        const gap = Math.max(2, Math.round(this.cellSize * 0.06));

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const cellUI = this.cells[index];
                const posX = startX + x * this.cellSize + this.cellSize / 2;
                const posY = startY + y * this.cellSize + this.cellSize / 2;

                cellUI.rect.setPosition(posX, posY);
                cellUI.rect.setSize(this.cellSize - gap, this.cellSize - gap);
                cellUI.orbContainer.setPosition(posX, posY);
                
                // Refresh orbs in this cell to update their positions/sizes
                this.updateCellOrbs(x, y);
            }
        }
    }

    refreshBoard() {
        const { width, height } = this.gridConfig;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                this.updateCellOrbs(x, y);
            }
        }
    }

    createFlareTexture() {
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(8, 8, 8);
        graphics.generateTexture('flare', 16, 16);
    }

    createGrid() {
        const { width, height } = this.gridConfig;
        this.cells = [];

        const gridPixelW = width * this.cellSize;
        const gridPixelH = height * this.cellSize;

        // Center horizontally, and position below the UI header vertically
        const startX = (this.cameras.main.width - gridPixelW) / 2;
        const availableBelow = this.cameras.main.height - this.uiHeaderHeight - this.padding;
        const startY = this.uiHeaderHeight + (availableBelow - gridPixelH) / 2;

        // Gap between cells scales with cell size
        const gap = Math.max(2, Math.round(this.cellSize * 0.06));

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const posX = startX + x * this.cellSize + this.cellSize / 2;
                const posY = startY + y * this.cellSize + this.cellSize / 2;

                // Cell background
                const rect = this.add.rectangle(posX, posY, this.cellSize - gap, this.cellSize - gap, 0x1e293b)
                    .setStrokeStyle(1, 0x334155)
                    .setInteractive();

                rect.on('pointerdown', () => this.onCellClicked(x, y));

                // Container for orbs
                const orbContainer = this.add.container(posX, posY);

                this.cells.push({ x, y, rect, orbContainer });
            }
        }
    }

    onCellClicked(x, y) {
        if (this.isAnimating) return;
        
        const currentPlayer = this.engine.getCurrentPlayer();
        
        // ONLY allow clicking if it is actually OUR turn
        if (this.localPlayerId !== null && currentPlayer.id !== this.localPlayerId) {
            console.log("Not your turn!", { local: this.localPlayerId, current: currentPlayer.id });
            return;
        }
        
        // Find our local player ID (assuming Host is 1, Guest is 2... 
        // we'll need to know which one WE are. For now, let's just use the current turn.)
        // In multiplayer, the host validates, but we shouldn't even send if it's not our turn.
        
        // Block interaction if we aren't sure it's valid
        if (!this.engine.isValidMove(x, y, currentPlayer.id)) return;

        console.log("Cell clicked", { x, y, player: currentPlayer.name });
        this.isAnimating = true; // Lock immediately

        if (this.onMoveRequested) {
            this.onMoveRequested(x, y);
        } else {
            // Local fallback (Single Player / Testing)
            this.handleMove(x, y, currentPlayer.id);
        }
    }

    handleMove(x, y, playerId, nextTurnIndex = null) {
        if (!this.engine.isValidMove(x, y, playerId)) return;

        const result = this.engine.applyMove(x, y, playerId, nextTurnIndex);
        if (!result) return;

        this.playSound('move');
        this.animateMove(result);
    }

    async animateMove(result) {
        this.isAnimating = true;
        
        // 1. Initial placement
        await this.updateCellOrbs(result.move.x, result.move.y);
        
        // 2. Play back reaction steps
        for (const step of result.reactionSteps) {
            await this.playReactionStep(step);
        }

        this.isAnimating = false;
        this.updateTurnIndicator();
        this.updatePlayerStats();

        if (result.winner) {
            this.handleGameOver(result.winner);
        }
    }

    async updateCellOrbs(x, y) {
        const cellData = this.engine.getCell(x, y);
        const cellUI = this.cells[y * this.gridConfig.width + x];
        
        cellUI.orbContainer.removeAll(true);
        
        const player = this.players.find(p => p.id === cellData.owner);
        const color = player ? player.color : 0xffffff;

        const orbRadius = Math.max(4, Math.round(this.cellSize * 0.14));
        const orbStroke = Math.max(1, Math.round(this.cellSize * 0.035));

        for (let i = 0; i < cellData.count; i++) {
            const offset = this.getOrbOffset(i, cellData.count);
            const orb = this.add.circle(offset.x, offset.y, orbRadius, color);
            orb.setStrokeStyle(orbStroke, 0xffffff, 0.5);
            
            // Pulsing animation
            this.tweens.add({
                targets: orb,
                scale: 1.2,
                duration: 800 + Math.random() * 400,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            cellUI.orbContainer.add(orb);
        }

        // Add slow rotation to the container for multiple orbs
        this.tweens.killTweensOf(cellUI.orbContainer);
        cellUI.orbContainer.angle = 0; // Reset angle
        
        if (cellData.count > 1) {
            this.tweens.add({
                targets: cellUI.orbContainer,
                angle: 360,
                duration: 4000,
                repeat: -1,
                ease: 'Linear'
            });
        }
    }

    getOrbOffset(index, total) {
        const spread = Math.max(6, Math.round(this.cellSize * 0.2));
        const triSpread = Math.max(7, Math.round(this.cellSize * 0.24));
        if (total === 1) return { x: 0, y: 0 };
        if (total === 2) return { x: index === 0 ? -spread : spread, y: 0 };
        if (total === 3) {
            const angle = (index * 120 - 90) * (Math.PI / 180);
            return { x: Math.cos(angle) * triSpread, y: Math.sin(angle) * triSpread };
        }
        return { x: 0, y: 0 };
    }

    async playReactionStep(step) {
        const { width, height } = this.gridConfig;
        
        return new Promise(resolve => {
            const moveAnims = [];

            // Trigger explosion effects
            step.explosions.forEach(exp => {
                const cellUI = this.cells[exp.y * width + exp.x];
                const player = this.players.find(p => p.id === this.engine.getCell(exp.x, exp.y).owner) || { color: 0xffffff };
                const neighbors = [];
                if (exp.x > 0) neighbors.push({ x: exp.x - 1, y: exp.y });
                if (exp.x < width - 1) neighbors.push({ x: exp.x + 1, y: exp.y });
                if (exp.y > 0) neighbors.push({ x: exp.x, y: exp.y - 1 });
                if (exp.y < height - 1) neighbors.push({ x: exp.x, y: exp.y + 1 });

                // Screen shake
                this.cameras.main.shake(100, 0.005);
                this.playSound('pop');

                // Create sliding orbs
                neighbors.forEach(n => {
                    const targetCellUI = this.cells[n.y * width + n.x];
                    const orbR = Math.max(4, Math.round(this.cellSize * 0.14));
                    const orbS = Math.max(1, Math.round(this.cellSize * 0.035));
                    const tempOrb = this.add.circle(cellUI.rect.x, cellUI.rect.y, orbR, player.color);
                    tempOrb.setStrokeStyle(orbS, 0xffffff, 0.5);
                    
                    moveAnims.push(new Promise(r => {
                        this.tweens.add({
                            targets: tempOrb,
                            x: targetCellUI.rect.x,
                            y: targetCellUI.rect.y,
                            duration: 350,
                            ease: 'Back.easeOut',
                            easeParams: [1.5],
                            onComplete: () => {
                                tempOrb.destroy();
                                r();
                            }
                        });
                    }));
                });

                // Clear the exploding cell immediately
                this.updateCellOrbs(exp.x, exp.y);
            });

            if (moveAnims.length === 0) {
                resolve();
            } else {
                Promise.all(moveAnims).then(() => {
                    // Update all cells to catch final state
                    for (let i = 0; i < this.engine.cells.length; i++) {
                        const x = i % width;
                        const y = Math.floor(i / width);
                        this.updateCellOrbs(x, y);
                    }
                    this.time.delayedCall(100, resolve);
                });
            }
        });
    }

    updateTurnIndicator() {
        const player = this.engine.getCurrentPlayer();
        this.turnIndicator.innerText = `${player.name}'s Turn`;
        this.turnIndicator.style.borderColor = `#${player.color.toString(16).padStart(6, '0')}`;
        this.turnIndicator.style.color = `#${player.color.toString(16).padStart(6, '0')}`;
    }

    updatePlayerStats() {
        if (!this.playerStatsUI) return;
        
        const sideLeft = document.getElementById('side-stats-left');
        const sideRight = document.getElementById('side-stats-right');
        
        this.playerStatsUI.innerHTML = '';
        if (sideLeft) sideLeft.innerHTML = '';
        if (sideRight) sideRight.innerHTML = '';
        
        const midPoint = Math.ceil(this.players.length / 2);

        this.players.forEach((p, index) => {
            const orbCount = this.engine.getPlayerOrbCount(p.id);
            const isEliminated = this.engine.hasMovedOnce.has(p.id) && orbCount === 0;
            const isCurrent = this.engine.getCurrentPlayer().id === p.id;
            
            const createStatItem = () => {
                const div = document.createElement('div');
                const isOff = p.disconnected;
                div.className = `player-stat-item ${isEliminated ? 'eliminated' : ''} ${isCurrent ? 'current' : ''} ${isOff ? 'offline' : ''}`;
                div.style.color = `#${p.color.toString(16).padStart(6, '0')}`;
                
                let kickBtn = '';
                if (this.isHost && p.id !== this.localPlayerId) {
                    kickBtn = `<button class="kick-btn" title="Kick Player" data-id="${p.id}">×</button>`;
                }

                div.innerHTML = `
                    <span class="stat-color" style="background-color: #${p.color.toString(16).padStart(6, '0')}"></span>
                    <span class="stat-name">${p.name}${isOff ? ' <small>(Off)</small>' : ''}</span>
                    <span class="stat-count">${orbCount}</span>
                    ${kickBtn}
                `;

                if (kickBtn) {
                    const btn = div.querySelector('.kick-btn');
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`Kick ${p.name}?`)) {
                            this.onKickRequested(p.id);
                        }
                    });
                }

                return div;
            };

            // Add to top list (mobile)
            this.playerStatsUI.appendChild(createStatItem());

            // Add to side lists (desktop)
            if (index < midPoint) {
                if (sideLeft) sideLeft.appendChild(createStatItem());
            } else {
                if (sideRight) sideRight.appendChild(createStatItem());
            }
        });
    }

    setupAudio() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    playSound(type) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;

        if (type === 'move') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'pop') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    }

    handleGameOver(winner) {
        this.turnIndicator.innerText = `${winner.name} WINS!`;
        
        const isMobile = this.cameras.main.width < 600;
        const fontSize = isMobile ? '32px' : '64px';

        const winText = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY - 50, `${winner.name.toUpperCase()} WINS!`, {
            fontSize: fontSize,
            fontFamily: 'Inter',
            fontWeight: '900',
            fill: `#${winner.color.toString(16).padStart(6, '0')}`
        }).setOrigin(0.5).setStroke('#000', 8).setShadow(0, 0, 20, `#${winner.color.toString(16).padStart(6, '0')}`, true, true);

        // Pulsing win text
        this.tweens.add({
            targets: winText,
            scale: 1.1,
            duration: 500,
            yoyo: true,
            repeat: -1
        });

        // Rematch button (DOM)
        const btn = document.createElement('button');
        btn.innerText = 'Back to Lobby';
        btn.className = 'btn-primary';
        btn.style.position = 'absolute';
        btn.style.top = '70%';
        btn.style.left = '50%';
        btn.style.transform = 'translate(-50%, -50%)';
        btn.style.zIndex = '10';
        btn.style.pointerEvents = 'auto';
        btn.onclick = () => location.reload();
        document.getElementById('ui-layer').appendChild(btn);
    }

    removePlayer(playerId) {
        const winner = this.engine.removePlayer(playerId);
        
        // Refresh all cells to clear removed player's orbs
        this.refreshBoard();
        
        // Refresh UI
        this.updatePlayerStats();
        this.updateTurnIndicator();

        if (winner) {
            this.handleGameOver(winner);
        }
    }
}
