/**
 * @fileoverview アプリケーション全体の統合管理
 */

const { vec3 } = glMatrix;

import { WebGPUContext } from './core/WebGPUContext.js';
import { Renderer } from './core/Renderer.js';
import { TextureLoader } from './loaders/TextureLoader.js';
import { ModelLoader } from './scene/Model.js';
import { Skybox } from './objects/Skybox.js';
import { GroundTrackManager } from './objects/GroundTrack.js';
import { 
    DEFAULT_MODEL_CONFIGS, 
    GROUND_TRACK_CONFIGS,
    SKYBOX_BASE_URL,
    SKYBOX_FACES,
    IBL_BASE_URL
} from './constants.js';

/**
 * アプリケーションのメインクラス
 */
export class Application {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.gpu = null;
        this.renderer = null;
        this.textureLoader = null;
        
        this.scene = {
            skybox: null,
            groundTracks: null,
            models: []
        };
        
        this.camera = {
            position: [0, 5, 10],
            target: [0, 0, 0],
            fov: Math.PI / 4,
            near: 0.1,
            far: 1000
        };
        
        this.startTime = 0;
        this.isRunning = false;
    }

    /**
     * アプリケーションを初期化
     */
    async initialize() {
        // WebGPU初期化
        this.gpu = new WebGPUContext(this.canvas);
        await this.gpu.initialize();
        
        // テクスチャローダー初期化
        this.textureLoader = new TextureLoader(this.gpu);
        
        // シェーダー読み込み
        const mainShader = await this._loadShader('src/shaders/main.wgsl');
        const skyboxShader = await this._loadShader('src/shaders/skybox.wgsl');
        
        // HDRテクスチャ読み込み
        const envTexture = await this.textureLoader.loadHDR(IBL_BASE_URL);
        
        // レンダラー初期化
        this.renderer = new Renderer(this.gpu);
        this.renderer.initMainPipeline(mainShader, this.gpu.format, envTexture);
        
        // デフォルトテクスチャ
        const defaultTexture = this.textureLoader.createDefaultTexture();
        
        // スカイボックス初期化
        this.scene.skybox = new Skybox(this.gpu);
        this.scene.skybox.initPipeline(skyboxShader, this.gpu.format);
        
        const skyboxUrls = SKYBOX_FACES.map(f => SKYBOX_BASE_URL + f);
        const skyboxTexture = await this.textureLoader.loadCubeMap(skyboxUrls);
        this.scene.skybox.setTexture(skyboxTexture, this.renderer.sampler);
        
        // グラウンドトラック初期化
        this.scene.groundTracks = new GroundTrackManager(this.gpu);
        this.scene.groundTracks.createFromConfigs(GROUND_TRACK_CONFIGS);
        this.scene.groundTracks.initResources(
            this.renderer.mainPipeline, 
            this.renderer.sampler, 
            defaultTexture
        );
        
        // モデルローダー初期化
        const modelLoader = new ModelLoader(
            this.gpu,
            this.textureLoader,
            this.renderer.mainPipeline,
            this.renderer.sampler,
            defaultTexture,
            envTexture
        );
        
        // モデル読み込み
        for (const config of DEFAULT_MODEL_CONFIGS) {
            const model = await modelLoader.load(config);
            this.scene.models.push(model);
        }
        
        // カメラをシーンに合わせて調整
        this._setupCamera();
    }

    /**
     * シェーダーファイルを読み込む
     * @private
     */
    async _loadShader(url) {
        const response = await fetch(url);
        return response.text();
    }

    /**
     * カメラをセットアップ
     * @private
     */
    _setupCamera() {
        // シーンのバウンディングボックスを計算（簡略化）
        const center = [0, 1, 0];
        const distance = 15;
        
        this.camera.target = center;
        this.camera.near = distance * 0.01;
        this.camera.far = distance * 10;
        this.cameraDistance = distance;
    }

    /**
     * レンダリングループを開始
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.startTime = performance.now() / 1000;
        this._renderLoop();
    }

    /**
     * レンダリングループを停止
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * レンダリングループ
     * @private
     */
    _renderLoop() {
        if (!this.isRunning) return;
        
        const time = performance.now() / 1000 - this.startTime;
        
        // カメラを回転
        this._updateCamera(time);
        
        // モデル更新
        for (const model of this.scene.models) {
            model.update(time);
        }
        
        // レンダラーのカメラを更新
        this.renderer.updateCamera(this.camera);
        
        // 描画
        this.renderer.render(this.scene);
        
        requestAnimationFrame(() => this._renderLoop());
    }

    /**
     * カメラを更新
     * @private
     */
    _updateCamera(time) {
        const target = this.camera.target;
        const dist = this.cameraDistance;
        
        this.camera.position = [
            target[0] - Math.sin(time * 0.5) * dist,
            target[1] + dist * 0.3,
            target[2] + Math.cos(time * 0.5) * dist
        ];
    }
}
