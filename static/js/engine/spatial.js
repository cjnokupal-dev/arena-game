export class SpatialGrid {
  constructor(w, h, cell = 120) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(w / cell));
    this.rows = Math.max(1, Math.ceil(h / cell));
    this.grid = new Array(this.cols * this.rows);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
  }

  clear() {
    for (let i = 0; i < this.grid.length; i++) this.grid[i].length = 0;
  }

  insert(obj) {
    let minX, minY, maxX, maxY;
    if (obj.type === 'wall' || obj.w !== undefined) {
      minX = obj.x; minY = obj.y;
      maxX = obj.x + obj.w; maxY = obj.y + obj.h;
    } else {
      const r = obj.r || 0;
      minX = obj.x - r; minY = obj.y - r;
      maxX = obj.x + r; maxY = obj.y + r;
    }
    const x0 = Math.max(0, Math.floor(minX / this.cell));
    const y0 = Math.max(0, Math.floor(minY / this.cell));
    const x1 = Math.min(this.cols - 1, Math.floor(maxX / this.cell));
    const y1 = Math.min(this.rows - 1, Math.floor(maxY / this.cell));
    for (let y = y0; y <= y1; y++) {
      const row = y * this.cols;
      for (let x = x0; x <= x1; x++) {
        this.grid[row + x].push(obj);
      }
    }
  }

  query(x, y, r, out) {
    out.length = 0;
    const x0 = Math.max(0, Math.floor((x - r) / this.cell));
    const y0 = Math.max(0, Math.floor((y - r) / this.cell));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / this.cell));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / this.cell));
    for (let yy = y0; yy <= y1; yy++) {
      const row = yy * this.cols;
      for (let xx = x0; xx <= x1; xx++) {
        const cell = this.grid[row + xx];
        for (let i = 0; i < cell.length; i++) out.push(cell[i]);
      }
    }
    return out;
  }
}
