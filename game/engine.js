import { getCell, getNeighbors } from './board.js';

export class GameEngine {
    constructor(width, height, players) {
        this.width = width;
        this.height = height;
        this.players = players; // Array of player objects { id, color, name }
        this.cells = this.createInitialBoard();
        this.turnIndex = 0;
        this.isGameOver = false;
        this.hasMovedOnce = new Set(); // To track Round 1 safety
    }

    createInitialBoard() {
        const cells = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                cells.push({
                    owner: null,
                    count: 0,
                    criticalMass: this.calculateCriticalMass(x, y)
                });
            }
        }
        return cells;
    }

    calculateCriticalMass(x, y) {
        const isEdgeX = x === 0 || x === this.width - 1;
        const isEdgeY = y === 0 || y === this.height - 1;
        if (isEdgeX && isEdgeY) return 2;
        if (isEdgeX || isEdgeY) return 3;
        return 4;
    }

    getCell(x, y) {
        return this.cells[y * this.width + x];
    }

    isValidMove(x, y, playerId) {
        if (this.isGameOver) return false;
        const cell = this.getCell(x, y);
        // Can only place on empty cell or own cell
        return cell.owner === null || cell.owner === playerId;
    }

    applyMove(x, y, playerId, forcedNextTurnIndex = null) {
        if (!this.isValidMove(x, y, playerId)) return null;

        const cell = this.getCell(x, y);
        cell.owner = playerId;
        cell.count++;
        this.hasMovedOnce.add(playerId);

        const reactionSteps = this.resolveChainReactions(playerId);
        
        if (forcedNextTurnIndex !== null) {
            this.turnIndex = forcedNextTurnIndex;
        } else {
            this.nextTurn();
        }

        const winner = this.checkWinner();
        
        return {
            move: { x, y, playerId },
            reactionSteps,
            winner,
            nextTurnIndex: this.turnIndex
        };
    }

    resolveChainReactions(currentPlayerId) {
        const steps = [];
        let unstableCells = this.getUnstableCells();

        while (unstableCells.length > 0) {
            const step = {
                explosions: [], // Cells that exploded in this wave
                changes: []     // Resulting state changes for UI
            };

            const nextUnstableCandidates = new Set();

            // All currently unstable cells explode simultaneously
            for (const cellIdx of unstableCells) {
                const cell = this.cells[cellIdx];
                const x = cellIdx % this.width;
                const y = Math.floor(cellIdx / this.width);

                step.explosions.push({ x, y, count: cell.count });

                const neighbors = getNeighbors(x, y, this.width, this.height);
                
                // Exploding cell loses orbs equal to its neighbors count (standard rule)
                // or loses all? Most versions: loses orbs equal to critical mass.
                cell.count -= cell.criticalMass;
                if (cell.count === 0) cell.owner = null;

                for (const neighbor of neighbors) {
                    const nCell = this.getCell(neighbor.x, neighbor.y);
                    nCell.owner = currentPlayerId; // Conquer!
                    nCell.count++;
                    
                    nextUnstableCandidates.add(neighbor.y * this.width + neighbor.x);
                }
            }

            // Capture the state after this wave
            step.boardState = JSON.parse(JSON.stringify(this.cells));
            steps.push(step);

            // Find truly unstable cells for the next wave
            unstableCells = this.getUnstableCells();
        }

        return steps;
    }

    getUnstableCells() {
        const unstable = [];
        for (let i = 0; i < this.cells.length; i++) {
            if (this.cells[i].count >= this.cells[i].criticalMass) {
                unstable.push(i);
            }
        }
        return unstable;
    }

    nextTurn() {
        const totalPlayers = this.players.length;
        let nextIndex = this.turnIndex;

        for (let i = 0; i < totalPlayers; i++) {
            nextIndex = (nextIndex + 1) % totalPlayers;
            const nextPlayer = this.players[nextIndex];
            
            // Player is valid if:
            // 1. They haven't moved yet (Round 1 safety)
            // 2. OR they have orbs on the board
            const hasOrbs = this.getPlayerOrbCount(nextPlayer.id) > 0;
            const hasNotMoved = !this.hasMovedOnce.has(nextPlayer.id);

            if (hasNotMoved || hasOrbs) {
                this.turnIndex = nextIndex;
                console.log("Turn switched to:", nextPlayer.name, "ID:", nextPlayer.id);
                return;
            }
        }
    }

    getPlayerOrbCount(playerId) {
        return this.cells.reduce((acc, cell) => acc + (cell.owner === playerId ? cell.count : 0), 0);
    }

    checkWinner() {
        // Only check for winner if at least 2 players have moved
        if (this.hasMovedOnce.size < 2) return null;

        const activePlayers = this.players.filter(p => {
            const hasMoved = this.hasMovedOnce.has(p.id);
            const orbCount = this.getPlayerOrbCount(p.id);
            return !hasMoved || orbCount > 0;
        });

        if (activePlayers.length === 1) {
            this.isGameOver = true;
            return activePlayers[0];
        }

        return null;
    }

    getCurrentPlayer() {
        return this.players[this.turnIndex];
    }

    getState() {
        return {
            cells: JSON.parse(JSON.stringify(this.cells)),
            turnIndex: this.turnIndex,
            hasMovedOnce: Array.from(this.hasMovedOnce),
            isGameOver: this.isGameOver
        };
    }

    setState(state) {
        this.cells = state.cells;
        this.turnIndex = state.turnIndex;
        this.hasMovedOnce = new Set(state.hasMovedOnce);
        this.isGameOver = state.isGameOver;
    }

    removePlayer(playerId) {
        // 1. Remove their orbs
        this.cells.forEach(cell => {
            if (cell.owner === playerId) {
                cell.owner = null;
                cell.count = 0;
            }
        });

        // 2. Remove from player list
        const index = this.players.findIndex(p => p.id === playerId);
        if (index === -1) return;
        
        this.players.splice(index, 1);

        // 3. Adjust turn index if needed
        if (this.turnIndex >= index) {
            this.turnIndex = Math.max(0, this.turnIndex - 1);
        }
        
        // Ensure turn index is valid
        if (this.players.length > 0) {
            this.turnIndex = this.turnIndex % this.players.length;
        }

        // 4. Check for winner
        return this.checkWinner();
    }
}
