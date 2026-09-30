// Downloadable offline regions. PMTiles files are produced by the data pipeline
// (`data/scripts/build_tiles.ps1`) and served from `web/public/tiles/`.
// "planned" = the pipeline hasn't produced this file yet (availability is also
// checked live at runtime).

export interface Region {
  id: string;
  name: string;
  states: string;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  /** Where the built .pmtiles lives (also used to flyTo). */
  pmtilesUrl: string;
  approxMB: number;
}

export const REGIONS: Region[] = [
  {
    id: "pnw",
    name: "Pacific Northwest",
    states: "WA · OR · ID",
    bounds: [-125.0, 41.9, -110.9, 49.1],
    pmtilesUrl: "/tiles/pnw.pmtiles",
    approxMB: 190,
  },
  {
    id: "pacific",
    name: "Pacific West",
    states: "CA · NV",
    bounds: [-124.6, 32.0, -114.0, 42.1],
    pmtilesUrl: "/tiles/pacific.pmtiles",
    approxMB: 240,
  },
  {
    id: "mountain-west",
    name: "Mountain West",
    states: "CO · UT · AZ · NM · WY · MT",
    bounds: [-117.5, 31.0, -104.0, 49.1],
    pmtilesUrl: "/tiles/mountain-west.pmtiles",
    approxMB: 340,
  },
];

export const regionCenter = (r: Region): [number, number] => [
  (r.bounds[0] + r.bounds[2]) / 2,
  (r.bounds[1] + r.bounds[3]) / 2,
];
