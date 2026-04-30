/**
 * Helper functions for Chain Reaction grid logic
 */

export const getCriticalMass = (x, y, width, height) => {
    let mass = 4;
    const isEdgeX = x === 0 || x === width - 1;
    const isEdgeY = y === 0 || y === height - 1;

    if (isEdgeX && isEdgeY) {
        mass = 2; // Corner
    } else if (isEdgeX || isEdgeY) {
        mass = 3; // Edge
    }

    return mass;
};

export const getNeighbors = (x, y, width, height) => {
    const neighbors = [];
    if (x > 0) neighbors.push({ x: x - 1, y });
    if (x < width - 1) neighbors.push({ x: x + 1, y });
    if (y > 0) neighbors.push({ x, y: y - 1 });
    if (y < height - 1) neighbors.push({ x, y: y + 1 });
    return neighbors;
};

export const createBoard = (width, height) => {
    const cells = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            cells.push({
                x,
                y,
                owner: null,
                count: 0,
                criticalMass: getCriticalMass(x, y, width, height)
            });
        }
    }
    return cells;
};

export const getCell = (cells, x, y, width) => {
    return cells[y * width + x];
};
