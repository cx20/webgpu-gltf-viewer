/**
 * @fileoverview glTFモデル全体を管理するクラス
 */

const { mat4 } = glMatrix;

import { GLTFLoader } from '../loaders/GLTFLoader.js';
import { NodeHierarchy } from './Node.js';
import { MeshFactory, PrimitiveInstanceFactory } from './Mesh.js';
import { Animation, AnimationSystem } from '../animation/Animation.js';
import { Skin, SkinManager } from '../animation/Skin.js';

/**
 * glTFモデルを表すクラス
 */
export class Model {
    /**
     * @param {string} name - モデル名
     */
    constructor(name = 'Model') {
        this.name = name;
        this.nodeHierarchy = null;
        this.meshes = [];
        this.skinManager = new SkinManager();
        this.animationSystem = new AnimationSystem();
        this.baseTransform = mat4.create();
        this.config = null;
    }

    /**
     * モデル設定を適用
     * @param {Object} config
     */
    applyConfig(config) {
        this.config = config;
        this.name = config.name || this.name;
        
        mat4.identity(this.baseTransform);
        
        if (config.position) {
            mat4.translate(this.baseTransform, this.baseTransform, config.position);
        }
        
        if (config.rotation) {
            mat4.rotateY(this.baseTransform, this.baseTransform, config.rotation[1]);
            mat4.rotateX(this.baseTransform, this.baseTransform, config.rotation[0]);
            mat4.rotateZ(this.baseTransform, this.baseTransform, config.rotation[2]);
        }
        
        if (config.scale !== undefined) {
            const s = config.scale;
            mat4.scale(this.baseTransform, this.baseTransform, [s, s, s]);
        }
    }

    /**
     * アニメーションを更新
     * @param {number} time - 時刻（秒）
     */
    updateAnimation(time) {
        this.animationSystem.update(this.nodeHierarchy.nodes, time);
    }

    /**
     * ワールド行列を更新
     */
    updateWorldMatrices() {
        this.nodeHierarchy.updateWorldMatrices(this.baseTransform, true);
    }

    /**
     * スキン行列を更新
     */
    updateSkinMatrices() {
        this.skinManager.updateAll(this.nodeHierarchy.nodes);
    }

    /**
     * 全更新（アニメーション→階層→スキン）
     * @param {number} time
     */
    update(time) {
        this.updateAnimation(time);
        this.updateWorldMatrices();
        this.updateSkinMatrices();
    }

    /**
     * ノード配列を取得
     * @returns {Node[]}
     */
    get nodes() {
        return this.nodeHierarchy.nodes;
    }
}

/**
 * モデルを読み込むファクトリークラス
 */
export class ModelLoader {
    /**
     * @param {WebGPUContext} gpuContext
     * @param {TextureLoader} textureLoader
     * @param {GPURenderPipeline} pipeline
     * @param {GPUSampler} sampler
     * @param {GPUTexture} defaultTexture
     */
    constructor(gpuContext, textureLoader, pipeline, sampler, defaultTexture) {
        this.gpu = gpuContext;
        this.textureLoader = textureLoader;
        this.meshFactory = new MeshFactory(gpuContext, textureLoader);
        this.instanceFactory = new PrimitiveInstanceFactory(gpuContext, pipeline, sampler);
        this.defaultTexture = defaultTexture;
        this.gltfLoader = new GLTFLoader();
    }

    /**
     * モデルを読み込む
     * @param {Object} config - モデル設定
     * @returns {Promise<Model>}
     */
    async load(config) {
        console.log(`Loading ${config.name}...`);
        
        const { gltf, buffers, baseUrl } = await this.gltfLoader.load(config.url);
        
        const model = new Model(config.name);
        model.applyConfig(config);
        
        // ノード階層を構築
        model.nodeHierarchy = NodeHierarchy.fromGLTF(gltf);
        
        // メッシュを読み込み
        if (gltf.meshes) {
            for (let i = 0; i < gltf.meshes.length; i++) {
                const mesh = await this.meshFactory.createFromGLTF(
                    gltf, buffers, baseUrl, i, this.defaultTexture
                );
                model.meshes.push(mesh);
            }
        }
        
        // ノードごとのGPUリソースを作成
        this._createNodeResources(model);
        
        // スキンを読み込み
        this._loadSkins(model, gltf, buffers);
        
        // アニメーションを読み込み
        this._loadAnimations(model, gltf, buffers, config);
        
        console.log(`Loaded ${config.name}`);
        return model;
    }

    /**
     * ノードごとのGPUリソースを作成
     * @private
     */
    _createNodeResources(model) {
        for (const node of model.nodes) {
            if (node.meshIndex !== undefined) {
                const mesh = model.meshes[node.meshIndex];
                node.primitiveInstances = mesh.primitives.map(prim => 
                    this.instanceFactory.create(prim)
                );
            }
        }
    }

    /**
     * スキンを読み込み
     * @private
     */
    _loadSkins(model, gltf, buffers) {
        if (!gltf.skins) return;
        
        const getAccessorData = (index) => 
            GLTFLoader.getAccessorData(gltf, buffers, index);
        
        for (const skinData of gltf.skins) {
            const skin = Skin.fromGLTF(skinData, getAccessorData);
            model.skinManager.add(skin);
        }
    }

    /**
     * アニメーションを読み込み
     * @private
     */
    _loadAnimations(model, gltf, buffers, config) {
        if (!gltf.animations) return;
        
        const getAccessorData = (index) => 
            GLTFLoader.getAccessorData(gltf, buffers, index);
        
        for (const animData of gltf.animations) {
            const animation = Animation.fromGLTF(animData, getAccessorData);
            model.animationSystem.add(animation);
        }
        
        // デフォルトアニメーションを設定
        model.animationSystem.setDefaultAnimation(config.preferredAnimation);
    }
}
