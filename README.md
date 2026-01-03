# WebGPU glTF Viewer

WebGPUを使用したglTF/GLBモデルビューワー。スキニングアニメーション対応。

## 機能

- glTF/GLB形式のモデル読み込み
- スキニングアニメーション
- PBRマテリアル（ベースカラーテクスチャ）
- スカイボックス
- 複数モデルの同時表示

## プロジェクト構造

```
webgpu-gltf-viewer/
├── index.html                 # エントリーHTML
└── src/
    ├── main.js               # エントリーポイント
    ├── Application.js        # アプリケーション統合クラス
    ├── constants.js          # 定数定義
    │
    ├── core/                 # コア機能
    │   ├── WebGPUContext.js  # WebGPU初期化・管理
    │   └── Renderer.js       # レンダリング管理
    │
    ├── loaders/              # ローダー
    │   ├── GLTFLoader.js     # glTF/GLBパーサー
    │   └── TextureLoader.js  # テクスチャ読み込み
    │
    ├── scene/                # シーン要素
    │   ├── Node.js           # ノード・階層管理
    │   ├── Mesh.js           # メッシュ・プリミティブ
    │   └── Model.js          # モデル統合クラス
    │
    ├── animation/            # アニメーション
    │   ├── Animation.js      # アニメーションシステム
    │   └── Skin.js           # スキニング処理
    │
    ├── objects/              # シーンオブジェクト
    │   ├── Skybox.js         # スカイボックス
    │   └── GroundTrack.js    # 地面トラック
    │
    └── shaders/              # シェーダー
        ├── main.wgsl         # メインシェーダー
        └── skybox.wgsl       # スカイボックスシェーダー
```

## アーキテクチャ

### モジュール責務

| モジュール | 責務 |
|-----------|------|
| `WebGPUContext` | WebGPUデバイス・コンテキスト管理 |
| `Renderer` | パイプライン管理、描画実行 |
| `GLTFLoader` | glTF/GLBファイルパース |
| `TextureLoader` | テクスチャ読み込み・キャッシュ |
| `Node` | シーングラフノード、階層管理 |
| `Mesh` | メッシュ・プリミティブ、GPUバッファ |
| `Model` | モデル全体の統合管理 |
| `Animation` | キーフレームアニメーション |
| `Skin` | スキニング（骨格変形） |
| `Skybox` | 背景キューブマップ |
| `GroundTrack` | 地面のトラック描画 |
| `Application` | アプリケーション全体の統合 |

### データフロー

```
1. 初期化
   Application.initialize()
   └─> WebGPUContext.initialize()
   └─> Renderer.initMainPipeline()
   └─> ModelLoader.load() for each model
       └─> GLTFLoader.load()
       └─> MeshFactory.createFromGLTF()
       └─> Animation/Skin fromGLTF()

2. レンダリングループ
   Application._renderLoop()
   └─> Model.update(time)
       └─> AnimationSystem.update()    # TRS更新
       └─> NodeHierarchy.updateWorldMatrices()  # 階層計算
       └─> SkinManager.updateAll()     # ジョイント行列
   └─> Renderer.render(scene)
       └─> Skybox.draw()
       └─> GroundTrack.draw()
       └─> Model描画（各プリミティブ）
```

## 使い方

### 基本的な使い方

```javascript
import { Application } from './src/Application.js';

const canvas = document.getElementById('canvas');
const app = new Application(canvas);

await app.initialize();
app.start();
```

### モデルの追加

`src/constants.js`の`DEFAULT_MODEL_CONFIGS`に設定を追加：

```javascript
{
    name: "MyModel",
    scale: 1.0,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
    url: "path/to/model.gltf",
    preferredAnimation: "Walk"  // オプション
}
```

## 依存関係

- [gl-matrix](https://github.com/toji/gl-matrix) - 行列・ベクトル演算

## 動作要件

- WebGPU対応ブラウザ
  - Chrome 113+
  - Edge 113+
  - Firefox（フラグ有効化で対応）

## ライセンス

MIT
