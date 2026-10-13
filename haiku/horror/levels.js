/*
 * 鳴き井戸: the farmhouse floor plan and everything placed in it.
 * Each character is one 1 m cell. Row 0 is the north edge of the garden.
 * Walls are generated on every edge between two walkable cells of different
 * rooms, unless a door is listed or the pair is in openPairs. Walls on the
 * boundary of the map and garden fences are generated the same way.
 */
(function () {
  "use strict";

  const PROP_TYPES = {
    chabudai: { w: 0.9, d: 0.6, h: 0.36, solid: true },
    clock: { w: 0.45, d: 0.3, h: 2.0, solid: true },
    hibachi: { w: 0.5, d: 0.5, h: 0.42, solid: true },
    zabuton: { w: 0.6, d: 0.6, h: 0.06, solid: false },
    butsudan: { w: 1.0, d: 0.6, h: 2.0, solid: true },
    tsukue: { w: 0.5, d: 0.4, h: 0.5, solid: true },
    tansu: { w: 1.0, d: 0.45, h: 1.1, solid: true },
    kakejiku: { w: 0.7, d: 0.03, h: 1.2, solid: false, hang: 0.95 },
    andon: { w: 0.4, d: 0.4, h: 1.1, solid: true },
    geta: { w: 1.0, d: 0.35, h: 1.0, solid: true },
    kamado: { w: 1.1, d: 0.7, h: 0.9, solid: true },
    sink: { w: 1.2, d: 0.5, h: 0.9, solid: true },
    hako: { w: 0.6, d: 0.5, h: 0.5, solid: true },
    shelf: { w: 1.0, d: 0.3, h: 1.6, solid: true },
    toilet: { w: 0.5, d: 0.6, h: 0.42, solid: true },
    kurachest: { w: 1.0, d: 0.6, h: 0.8, solid: true },
    desk: { w: 0.9, d: 0.5, h: 0.7, solid: true },
    lantern: { w: 0.5, d: 0.5, h: 1.5, solid: true },
    bucket: { w: 0.35, d: 0.35, h: 0.4, solid: true },
    bell: { w: 0.2, d: 0.2, h: 0.4, solid: false, hang: 2.05 },
    tree: { w: 0.5, d: 0.5, h: 3.2, solid: false }
  };

  const LEVEL = {
    id: "naki-ido",
    seed: 20261012,
    // y=0 north garden ... y=13 south wall. x=0 west wall. 16 x 14 cells.
    rows: [
      "#wwwwwwwwwwwwwxx",
      "#wwwwwWpwwwwwwxx",
      "#wwwwwwpwwwwwwxx",
      "#wwwwwwpwwwwwwxx",
      "#wwwwwwpwwwwww##",
      "#eeeeeeeeeeeee##",
      "#iiiizzzzbbbbb##",
      "#iiiizzzzbbbbb##",
      "#iiiizzzzbbbbb##",
      "#iiiizzzzbbbbb##",
      "#hhhhhhhhhhhhh##",
      "#ggddkknnnnncc##",
      "#ggddkknnnnncc##",
      "################"
    ],
    glyphs: {
      g: { room: "genkan", floor: "earth" },
      h: { room: "hall", floor: "wood" },
      i: { room: "ima", floor: "wood" },
      z: { room: "zashiki", floor: "tatami" },
      b: { room: "butsuma", floor: "tatami" },
      d: { room: "kitchen", floor: "earth" },
      k: { room: "kitchen", floor: "wood" },
      n: { room: "nando", floor: "wood" },
      c: { room: "benjo", floor: "tile" },
      e: { room: "engawa", floor: "wood" },
      w: { room: "garden", floor: "mud" },
      p: { room: "garden", floor: "stone" },
      x: { room: "kura", floor: "wood" },
      W: { room: "garden", floor: "stone", solid: true }
    },
    rooms: {
      genkan: { label: "玄関", light: "dark" },
      hall: { label: "廊下", light: "dark" },
      ima: { label: "居間", light: "dark" },
      zashiki: { label: "座敷", light: "dark" },
      butsuma: { label: "仏間", light: "dark", save: true },
      kitchen: { label: "台所", light: "dark" },
      nando: { label: "納戸", light: "dark" },
      benjo: { label: "便所", light: "dark" },
      engawa: { label: "縁側", light: "moon", outdoor: true },
      garden: { label: "庭", light: "moon", outdoor: true },
      kura: { label: "蔵", light: "dark" }
    },
    openPairs: [["engawa", "garden"]],
    // Doors sit on the edge from (x,y) toward dir (N, E, S or W).
    // open: true means the door starts open.
    doors: [
      { id: "d-veranda-ima", x: 2, y: 5, dir: "S", kind: "shoji" },
      { id: "d-veranda-zashiki", x: 6, y: 5, dir: "S", kind: "shoji" },
      { id: "d-veranda-butsuma", x: 11, y: 5, dir: "S", kind: "shoji" },
      { id: "d-ima-zashiki", x: 4, y: 7, dir: "E", kind: "fusuma" },
      { id: "d-zashiki-butsuma", x: 8, y: 8, dir: "E", kind: "fusuma" },
      { id: "d-ima-hall", x: 2, y: 9, dir: "S", kind: "fusuma" },
      { id: "d-zashiki-hall", x: 6, y: 9, dir: "S", kind: "fusuma" },
      { id: "d-butsuma-hall", x: 11, y: 9, dir: "S", kind: "fusuma" },
      { id: "d-genkan", x: 2, y: 10, dir: "S", kind: "genkan", open: true },
      { id: "d-kitchen", x: 4, y: 10, dir: "S", kind: "hikido", open: true },
      { id: "d-nando", x: 8, y: 10, dir: "S", kind: "fusuma" },
      { id: "d-benjo", x: 12, y: 10, dir: "S", kind: "hikido" },
      { id: "d-kura", x: 13, y: 2, dir: "E", kind: "hikido" }
    ],
    spawn: { x: 2.5, y: 11.7, yaw: 0 },
    well: { x: 6, y: 1 },
    // Where the well's voice is heard from: just south of the well mouth.
    wellMouth: { x: 6.5, y: 2.35 },
    // Props. face is the direction the front points (N, E, S, W).
    // interact: { kind, label, reveals } makes the prop a target for E.
    props: [
      { type: "chabudai", x: 2.5, y: 7.5, face: "S" },
      { type: "clock", x: 1.2, y: 8.6, face: "E", sound: "clock" },
      { type: "hibachi", x: 3.7, y: 9.2, face: "S" },
      { type: "zabuton", x: 2.2, y: 8.9, face: "N" },
      { type: "zabuton", x: 3.3, y: 6.7, face: "E" },
      { type: "kakejiku", x: 5.03, y: 9.0, face: "E" },
      { type: "andon", x: 5.6, y: 6.5, face: "S" },
      { type: "tansu", x: 8.75, y: 6.6, face: "W", interact: { kind: "search", id: "tansu", label: "引き出しを開ける", reveals: ["diary-2", "shell-4"] } },
      { type: "zabuton", x: 6.4, y: 8.2, face: "N" },
      { type: "zabuton", x: 7.2, y: 7.0, face: "W" },
      { type: "butsudan", x: 13.62, y: 7.5, face: "W", interact: { kind: "search", id: "ihai", label: "位牌の下を見る", reveals: ["fuda-2"] } },
      { type: "tsukue", x: 12.3, y: 8.7, face: "N", interact: { kind: "burn", id: "senko", label: "線香を焚く" } },
      { type: "zabuton", x: 11.2, y: 8.4, face: "N" },
      { type: "kamado", x: 3.6, y: 12.63, face: "N" },
      { type: "sink", x: 5.3, y: 11.27, face: "S" },
      { type: "shelf", x: 7.17, y: 11.5, face: "E" },
      { type: "hako", x: 10.3, y: 12.3, face: "N", interact: { kind: "search", id: "hako", label: "箱をどかす", reveals: ["fuda-1"] } },
      { type: "hako", x: 9.4, y: 12.5, face: "E" },
      { type: "hako", x: 11.3, y: 11.5, face: "W" },
      { type: "toilet", x: 13.2, y: 12.2, face: "N" },
      { type: "geta", x: 1.18, y: 11.6, face: "E" },
      { type: "bell", x: 9.5, y: 5.5, face: "S" },
      { type: "lantern", x: 3.5, y: 1.4, face: "S" },
      { type: "lantern", x: 10.5, y: 3.5, face: "N" },
      { type: "bucket", x: 5.6, y: 3.6, face: "E" },
      { type: "tree", x: 12.2, y: 0.8, face: "S" },
      { type: "kurachest", x: 14.5, y: 0.33, face: "S", interact: { kind: "search", id: "chest", label: "箱を開ける", reveals: ["fuda-3"] } },
      { type: "desk", x: 15.68, y: 2.0, face: "W" }
    ],
    items: [
      { id: "bat-1", kind: "battery", x: 1.6, y: 6.6 },
      { id: "bat-2", kind: "battery", x: 4.5, y: 11.8 },
      { id: "bat-3", kind: "battery", x: 6.6, y: 6.5 },
      { id: "bat-4", kind: "battery", x: 3.5, y: 5.5 },
      { id: "bat-5", kind: "battery", x: 12.6, y: 3.6 },
      { id: "shell-1", kind: "shell", x: 2.4, y: 12.4 },
      { id: "shell-2", kind: "shell", x: 6.4, y: 12.6 },
      { id: "shell-3", kind: "shell", x: 7.7, y: 11.6 },
      { id: "shell-4", kind: "shell", x: 8.75, y: 6.6, hidden: true },
      { id: "shell-5", kind: "shell", x: 4.3, y: 6.6 },
      { id: "shell-6", kind: "shell", x: 10.6, y: 9.3 },
      { id: "shell-7", kind: "shell", x: 4.3, y: 5.5 },
      { id: "shell-8", kind: "shell", x: 14.4, y: 2.9 },
      { id: "shell-9", kind: "shell", x: 9.6, y: 3.4 },
      { id: "fuda-1", kind: "fuda", x: 10.3, y: 12.3, hidden: true },
      { id: "fuda-2", kind: "fuda", x: 13.5, y: 7.5, hidden: true },
      { id: "fuda-3", kind: "fuda", x: 14.5, y: 0.33, hidden: true },
      { id: "diary-1", kind: "diary", x: 2.5, y: 7.4 },
      { id: "diary-2", kind: "diary", x: 8.75, y: 6.6, hidden: true },
      { id: "diary-3", kind: "diary", x: 15.6, y: 2.0 }
    ],
    // Places where the storehouse and the storage room are heard, for ambience.
    soundSpots: { nando: { x: 9.5, y: 12 }, veranda: { x: 9.5, y: 5.5 } },
    // Doors that the house slams. The entrance and the kitchen are left alone.
    slamDoors: ["d-ima-hall", "d-zashiki-hall", "d-butsuma-hall", "d-nando", "d-ima-zashiki", "d-zashiki-butsuma"],
    silhouetteDoors: ["d-veranda-ima", "d-veranda-zashiki", "d-veranda-butsuma"],
    propTypes: PROP_TYPES
  };

  const API = { LEVEL, PROP_TYPES };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.NakiIdoLevels = API;
})();
