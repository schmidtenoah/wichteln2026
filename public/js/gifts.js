/**
 * The ten gift designs. Person n (in participants order) gets GIFTS[n % 10].
 * The same values drive the Blender renders on the landing page and the
 * live 3D gift in the reveal, so the gift you tap is the gift that opens.
 *
 * paper:  index of public/models/papiere/papier{n}_*.webp
 * ribbon: linear RGB tint, metalness, roughness of the satin band
 * scale:  [width, height, depth] of the box (Three.js axes)
 * anchor: where the paper tag and the gift sit in the render (see ANCHORS)
 */

export const RIBBONS = {
  gold: { color: [0.92, 0.68, 0.32], metalness: 0.6, roughness: 0.32 },
  elfenbein: { color: [0.93, 0.88, 0.78], metalness: 0.05, roughness: 0.38 },
  silber: { color: [0.8, 0.82, 0.86], metalness: 0.75, roughness: 0.28 },
  rot: { color: [0.62, 0.04, 0.06], metalness: 0.1, roughness: 0.36 },
  bordeaux: { color: [0.38, 0.03, 0.06], metalness: 0.1, roughness: 0.4 },
};

export const GIFTS = [
  { paper: 0, ribbon: 'gold', scale: [1, 1, 1] },
  { paper: 1, ribbon: 'elfenbein', scale: [0.9, 1.25, 0.9] },
  { paper: 2, ribbon: 'silber', scale: [1.15, 0.75, 1.15] },
  { paper: 3, ribbon: 'rot', scale: [0.85, 0.9, 0.85] },
  { paper: 4, ribbon: 'bordeaux', scale: [1, 1.05, 1] },
  { paper: 5, ribbon: 'bordeaux', scale: [0.95, 0.85, 0.95] },
  { paper: 6, ribbon: 'gold', scale: [1.1, 1.1, 1.1] },
  { paper: 7, ribbon: 'gold', scale: [0.9, 1, 0.9] },
  { paper: 2, ribbon: 'gold', scale: [0.8, 1.3, 0.8] },
  { paper: 1, ribbon: 'rot', scale: [1.05, 0.8, 1.05] },
];

/**
 * Where each gift sits in the tree scenes (public/img/baum-breit.webp for wide screens,
 * baum-hoch.webp for phones), as fractions of the image, computed in Blender
 * (blender/wichtel-baum.blend, text block wichtel_layout.py) with world_to_camera_view:
 * tag = writing area of the paper tag on the gift [centre x, centre y, width, height, angle°]
 *       (width and height as fractions of the image HEIGHT), box = tap target [x, y, w, h].
 */
export const ANCHORS = {
  breit: [
    {tag: [0.342, 0.6419, 0.0389, 0.0238, 2.1], box: [0.2943, 0.5519, 0.0699, 0.135]},
    {tag: [0.6617, 0.6252, 0.0393, 0.0236, -5], box: [0.6424, 0.5236, 0.0577, 0.1571]},
    {tag: [0.2234, 0.6852, 0.0425, 0.0248, -9.9], box: [0.1608, 0.6015, 0.091, 0.123]},
    {tag: [0.7796, 0.6705, 0.0423, 0.0249, 2.9], box: [0.7605, 0.5845, 0.0642, 0.1287]},
    {tag: [0.423, 0.7145, 0.0449, 0.0271, 3.6], box: [0.3759, 0.6062, 0.0729, 0.1586]},
    {tag: [0.5787, 0.7295, 0.0452, 0.0272, 0.4], box: [0.5546, 0.6346, 0.0691, 0.1316]},
    {tag: [0.3008, 0.7382, 0.0476, 0.0286, -3.7], box: [0.2368, 0.6182, 0.0945, 0.185]},
    {tag: [0.7038, 0.7456, 0.0479, 0.0285, -1.4], box: [0.6805, 0.6362, 0.0731, 0.1632]},
    {tag: [0.0947, 0.7257, 0.0506, 0.0286, -0.7], box: [0.0469, 0.599, 0.0824, 0.1979]},
    {tag: [0.888, 0.7537, 0.0505, 0.0285, 3], box: [0.8577, 0.6551, 0.0919, 0.1461]},
  ],
  hoch: [
    {tag: [0.1924, 0.5492, 0.041, 0.0235, -1.7], box: [0.0915, 0.4688, 0.1423, 0.1139]},
    {tag: [0.8529, 0.537, 0.042, 0.0234, 4.6], box: [0.778, 0.4466, 0.1182, 0.1286]},
    {tag: [0.2486, 0.6488, 0.0454, 0.0233, -23.6], box: [0.1387, 0.5586, 0.1993, 0.116]},
    {tag: [0.4961, 0.6506, 0.0441, 0.0248, 16.9], box: [0.4234, 0.5631, 0.1512, 0.116]},
    {tag: [0.8005, 0.6267, 0.044, 0.025, 1.9], box: [0.6894, 0.5353, 0.1623, 0.1244]},
    {tag: [0.3272, 0.7257, 0.0498, 0.0266, 1.7], box: [0.2762, 0.6361, 0.1576, 0.1145]},
    {tag: [0.7215, 0.7091, 0.0453, 0.0272, -10], box: [0.5637, 0.6018, 0.2161, 0.1564]},
    {tag: [0.0887, 0.7813, 0.0476, 0.0285, 4.7], box: [0.0375, 0.6779, 0.1949, 0.145]},
    {tag: [0.5362, 0.7774, 0.0537, 0.0286, -4.5], box: [0.4261, 0.6606, 0.159, 0.1693]},
    {tag: [0.8078, 0.7911, 0.052, 0.0287, 12.1], box: [0.7537, 0.6901, 0.2129, 0.1433]},
  ],
};

/**
 * Gift design for a participant.
 * @param {number} index position in data.json people[]
 * @param {'breit'|'hoch'} [layout] which tree scene
 */
export function giftFor(index, layout = 'breit') {
  const i = ((index % GIFTS.length) + GIFTS.length) % GIFTS.length;
  return { id: i, ...GIFTS[i], ribbon: RIBBONS[GIFTS[i].ribbon], anchor: ANCHORS[layout][i] };
}

/**
 * The tree scene as Blender saw it (blender/wichtel-baum.blend, wichtel_layout.py),
 * in Three.js axes (Blender x, y, z -> x, z, -y). The reveal uses the very same
 * camera, so the live 3D gift sits exactly where the rendered one was.
 * vfov: vertical field of view in degrees; aspect: width / height of the render.
 */
export const VIEWS = {
  breit: { camera: [0, 7.2, 20.5], target: [0, 2.7, 1.9], vfov: (2 * Math.atan(Math.tan((29 * Math.PI) / 180) / 1.6) * 180) / Math.PI, aspect: 1.6 },
  hoch: { camera: [0, 11.8, 20], target: [0, 2.4, 2.6], vfov: 42, aspect: 1000 / 1500 },
};

/** Gift positions on the floor (Blender x, y) and turn (radians) per layout; uniform 0.8 base scale. */
const FLOOR = {
  breit: [[-3.9, -0.9], [3.9, -0.8], [-6.35, -2.05], [6.35, -1.95], [-1.75, -3.6], [1.75, -3.7], [-4.1, -4.45], [4.1, -4.55], [-7.7, -4.6], [7.7, -4.4]],
  hoch: [[-3.9, -0.3], [3.9, -0.2], [-2.75, -2.75], [0, -3.15], [2.8, -2.65], [-1.35, -4.9], [1.6, -4.8], [-3.2, -6.3], [0, -6.55], [3.2, -6.3]],
};
const YAW = [0.32, -0.18, 0.5, -0.42, 0.12, -0.08, 0.38, -0.3, 0.2, -0.5];
const BASE_SCALE = 0.8;

/**
 * "Clean plates" rendered by tools/render-plates.py: the part of the tree scene
 * around gift i WITHOUT that gift (public/img/leer/{layout}-{i}.webp), as
 * [x, y, w, h] fractions of the render. Laid over the picture when the gift opens.
 */
export const PLATES = {
  hoch: [[0.0, 0.42867, 0.284, 0.194], [0.636, 0.40133, 0.302, 0.21933], [0.0, 0.518, 0.408, 0.19733], [0.241, 0.522, 0.387, 0.198], [0.494, 0.49133, 0.415, 0.212], [0.087, 0.596, 0.402, 0.19533], [0.304, 0.54667, 0.552, 0.26667], [0.0, 0.62667, 0.301, 0.24733], [0.235, 0.60133, 0.406, 0.288], [0.498, 0.63933, 0.502, 0.24467]],
  breit: [[0.21, 0.504, 0.17875, 0.231], [0.57312, 0.468, 0.1475, 0.268], [0.05125, 0.558, 0.2325, 0.21], [0.68312, 0.539, 0.16437, 0.22], [0.28813, 0.55, 0.18625, 0.271], [0.47125, 0.588, 0.17688, 0.225], [0.12312, 0.553, 0.24125, 0.315], [0.5925, 0.579, 0.18688, 0.278], [0.0, 0.529, 0.15875, 0.338], [0.74687, 0.603, 0.235, 0.25]],
};

/**
 * Where gift n stands in the tree scene, in Three.js world units.
 * @param {number} n gift design index (0..9)
 * @param {'breit'|'hoch'} layout
 * @returns {{x:number, z:number, yaw:number, scale:number[]}}
 */
export function placement(n, layout) {
  const [bx, by] = FLOOR[layout][n];
  const s = GIFTS[n].scale;
  return { x: bx, z: -by, yaw: YAW[n], scale: s.map((v) => v * BASE_SCALE) };
}
