import { GameEngine } from '../game/engine.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.cellSize = 60;
        this.padding = 40;
    }

    init(data) {
        this.gridConfig = data.gridConfig || { width: 6, height: 9 };
        this.players = data.players || [
            { id: 1, name: 'Player 1', color: 0xff0000 },
            { id: 2, name: 'Player 2', color: 0x00ff00 }
        ];
        this.isHost = data.isHost;
        this.localPlayerId = data.localPlayerId;
        this.engine = new GameEngine(this.gridConfig.width, this.gridConfig.height, this.players);
        this.onMoveRequested = data.onMoveRequested; // Callback for networking
        
        // UI references
        this.turnIndicator = document.getElementById('turn-indicator');
    }

    create() {
        this.createGrid();
        this.updateTurnIndicator();
        this.isAnimating = false;
        
        // Event listener for moves coming from network
        this.events.on('remote-move', (move) => {
            this.handleMove(move.x, move.y, move.playerId);
        });
    }

    createGrid() {
        const { width, height } = this.gridConfig;
        this.cells = [];
        
        const startX = (this.cameras.main.width - (width * this.cellSize)) / 2;
        const startY = (this.cameras.main.height - (height * this.cellSize)) / 2;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const posX = startX + x * this.cellSize + this.cellSize / 2;
                const posY = startY + y * this.cellSize + this.cellSize / 2;

                // Cell background
                const rect = this.add.rectangle(posX, posY, this.cellSize - 4, this.cellSize - 4, 0x1e293b)
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

    handleMove(x, y, playerId) {
        if (!this.engine.isValidMove(x, y, playerId)) return;

        const result = this.engine.applyMove(x, y, playerId);
        if (!result) return;

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

        for (let i = 0; i < cellData.count; i++) {
            const offset = this.getOrbOffset(i, cellData.count);
            const orb = this.add.circle(offset.x, offset.y, 8, color);
            orb.setStrokeStyle(2, 0xffffff, 0.3);
            cellUI.orbContainer.add(orb);
        }

        // Add slow rotation to the container for multiple orbs
        this.tweens.killTweensOf(cellUI.orbContainer);
        cellUI.orbContainer.angle = 0; // Reset angle
        
        if (cellData.count > 1) {
            this.tweens.add({
                targets: cellUI.orbContainer,
                angle: 360,
                duration: 3000,
                repeat: -1,
                ease: 'Linear'
            });
        }
    }

    getOrbOffset(index, total) {
        if (total === 1) return { x: 0, y: 0 };
        if (total === 2) return { x: index === 0 ? -10 : 10, y: 0 };
        if (total === 3) {
            const angle = (index * 120) * (Math.PI / 180);
            return { x: Math.cos(angle) * 12, y: Math.sin(angle) * 12 };
        }
        // For 4 or more (shouldn't happen with wave logic but safety)
        const angle = (index * (360 / total)) * (Math.PI / 180);
        return { x: Math.cos(angle) * 12, y: Math.sin(angle) * 12 };
    }

    async playReactionStep(step) {
        return new Promise(resolve => {
            const explosionAnims = [];

            // Trigger explosion effects
            step.explosions.forEach(exp => {
                const cellUI = this.cells[exp.y * this.gridConfig.width + exp.x];
                
                // Visual explosion effect
                const ring = this.add.circle(cellUI.rect.x, cellUI.rect.y, 10, 0xffffff, 0.5);
                explosionAnims.push(new Promise(r => {
                    this.tweens.add({
                        targets: ring,
                        scale: 4,
                        alpha: 0,
                        duration: 300,
                        onComplete: () => {
                            ring.destroy();
                            r();
                        }
                    });
                }));
            });

            // Update all cells to the state after this wave
            this.time.delayedCall(150, () => {
                for (let i = 0; i < this.engine.cells.length; i++) {
                    const x = i % this.gridConfig.width;
                    const y = Math.floor(i / this.gridConfig.width);
                    this.updateCellOrbs(x, y);
                }
            });

            Promise.all(explosionAnims).then(() => {
                this.time.delayedCall(200, resolve); // Brief pause between waves
            });
        });
    }

    updateTurnIndicator() {
        const player = this.engine.getCurrentPlayer();
        this.turnIndicator.innerText = `${player.name}'s Turn`;
        this.turnIndicator.style.borderColor = `#${player.color.toString(16).padStart(6, '0')}`;
        this.turnIndicator.style.color = `#${player.color.toString(16).padStart(6, '0')}`;
    }

    handleGameOver(winner) {
        this.turnIndicator.innerText = `${winner.name} WINS!`;
        this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, `${winner.name.toUpperCase()} WINS!`, {
            fontSize: '48px',
            fontFamily: 'Inter',
            fontWeight: 'bold',
            fill: `#${winner.color.toString(16).padStart(6, '0')}`
        }).setOrigin(0.5);
    }
}
