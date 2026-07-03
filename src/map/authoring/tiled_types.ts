export type TiledProperty = {
  readonly name: string;
  readonly type?: string;
  readonly value: unknown;
};

export type TiledTilesetTile = {
  readonly id: number;
  readonly type?: string;
  readonly properties?: readonly TiledProperty[];
};

export type TiledTileset = {
  readonly name?: string;
  readonly tilecount?: number;
  readonly columns?: number;
  readonly tiles?: readonly TiledTilesetTile[];
  readonly properties?: readonly TiledProperty[];
};

export type TiledTilesetReference = TiledTileset & {
  readonly firstgid: number;
  readonly source?: string;
};

export type TiledObject = {
  readonly id?: number;
  readonly name?: string;
  readonly type?: string;
  readonly template?: string;
  readonly gid?: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly visible?: boolean;
  readonly properties?: readonly TiledProperty[];
  readonly point?: boolean;
  readonly ellipse?: boolean;
  readonly polygon?: readonly unknown[];
  readonly polyline?: readonly unknown[];
  readonly text?: unknown;
};

export type TiledLayer = {
  readonly id?: number;
  readonly name: string;
  readonly type: string;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly x?: number;
  readonly y?: number;
  readonly properties?: readonly TiledProperty[];
  readonly width?: number;
  readonly height?: number;
  readonly data?: readonly number[];
  readonly chunks?: readonly unknown[];
  readonly encoding?: string;
  readonly compression?: string;
  readonly objects?: readonly TiledObject[];
};

export type TiledMap = {
  readonly type?: string;
  readonly orientation: string;
  readonly infinite?: boolean | number;
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly properties?: readonly TiledProperty[];
  readonly tilesets?: readonly TiledTilesetReference[];
  readonly layers: readonly TiledLayer[];
};
