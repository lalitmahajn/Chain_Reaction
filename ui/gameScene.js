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
        this.createFlareTexture();
        this.createGrid();
        this.updateTurnIndicator();
        this.isAnimating = false;
        
        // Event listener for moves coming from network
        this.events.on('remote-move', (move) => {
            this.handleMove(move.x, move.y, move.playerId);
        });
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
            orb.setStrokeStyle(2, 0xffffff, 0.5);
            
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
        if (total === 1) return { x: 0, y: 0 };
        if (total === 2) return { x: index === 0 ? -12 : 12, y: 0 };
        if (total === 3) {
            const angle = (index * 120 - 90) * (Math.PI / 180);
            return { x: Math.cos(angle) * 14, y: Math.sin(angle) * 14 };
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

                // Create sliding orbs
                neighbors.forEach(n => {
                    const targetCellUI = this.cells[n.y * width + n.x];
                    const tempOrb = this.add.circle(cellUI.rect.x, cellUI.rect.y, 8, player.color);
                    tempOrb.setStrokeStyle(2, 0xffffff, 0.5);
                    
                    moveAnims.push(new Promise(r => {
                        this.tweens.add({
                            targets: tempOrb,
                            x: targetCellUI.rect.x,
                            y: targetCellUI.rect.y,
                            duration: 300,
                            ease: 'Cubic.out',
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
