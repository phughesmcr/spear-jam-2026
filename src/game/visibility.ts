export interface TileVisibility {
  isVisible(x: number, y: number): boolean;
  isExplored(x: number, y: number): boolean;
}
