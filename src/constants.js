/**
 * @fileoverview アプリケーション全体で使用する定数定義
 */

/** スキニングでサポートする最大ジョイント数 */
export const MAX_JOINTS = 180;

/** Uniformバッファのサイズ（バイト） */
export const UNIFORM_BUFFER_SIZE = 304;

/** ジョイントマトリックスバッファのサイズ（バイト） */
export const JOINT_MATRICES_BUFFER_SIZE = MAX_JOINTS * 64;

/** glTFコンポーネントタイプ */
export const COMPONENT_TYPES = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126
};

/** glTFコンポーネントタイプからTypedArrayへのマッピング */
export const COMPONENT_TYPE_ARRAYS = {
    [COMPONENT_TYPES.BYTE]: Int8Array,
    [COMPONENT_TYPES.UNSIGNED_BYTE]: Uint8Array,
    [COMPONENT_TYPES.SHORT]: Int16Array,
    [COMPONENT_TYPES.UNSIGNED_SHORT]: Uint16Array,
    [COMPONENT_TYPES.UNSIGNED_INT]: Uint32Array,
    [COMPONENT_TYPES.FLOAT]: Float32Array
};

/** glTFアクセサタイプからコンポーネント数へのマッピング */
export const TYPE_COMPONENTS = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16
};

/** デフォルトのライト方向 */
export const DEFAULT_LIGHT_DIR = [1, 1, 1, 0];

/** デフォルトのベースカラー */
export const DEFAULT_BASE_COLOR = [1, 1, 1, 1];

/** スカイボックスのテクスチャURL */
export const SKYBOX_BASE_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/3c13d929f8d9a02c89f010a487e73ff0e57437c4/examples/textures/cube/skyboxsun25deg/';
export const SKYBOX_FACES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];

/** デフォルトのモデル設定 */
export const DEFAULT_MODEL_CONFIGS = [
    {
        name: "CesiumMilkTruck",
        scale: 0.4,
        rotation: [0, Math.PI / 2, 0],
        position: [0, 0, -2],
        url: "https://cx20.github.io/gltf-test/sampleModels/CesiumMilkTruck/glTF/CesiumMilkTruck.gltf"
    },
    {
        name: "Fox",
        scale: 0.05,
        rotation: [0, Math.PI / 2, 0],
        position: [0, 0, 0],
        url: "https://cx20.github.io/gltf-test/sampleModels/Fox/glTF/Fox.gltf",
        preferredAnimation: "Run"
    },
    {
        name: "Rex",
        scale: 1.0,
        rotation: [0, Math.PI / 2, 0],
        position: [0, 0, 3],
        url: "https://raw.githubusercontent.com/BabylonJS/Exporters/d66db9a7042fef66acb62e1b8770739463b0b567/Maya/Samples/glTF%202.0/T-Rex/trex.gltf"
    }
];

/** グラウンドトラックの設定 */
export const GROUND_TRACK_CONFIGS = [
    { width: 100, height: 0.1, color: [1, 1, 1, 1], position: [-49.5, 0, -1.6] },
    { width: 100, height: 0.1, color: [1, 1, 1, 1], position: [-49.5, 0, -2.35] }
];
