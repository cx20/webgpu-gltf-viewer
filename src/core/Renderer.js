/**
 * @fileoverview シーン全体のレンダリング管理
 */

const { mat4 } = glMatrix;

import { MAX_JOINTS, DEFAULT_LIGHT_DIR } from '../constants.js';

/**
 * シーンをレンダリングするクラス
 */
export class Renderer {
    /**
     * @param {WebGPUContext} gpuContext
     */
    constructor(gpuContext) {
        this.gpu = gpuContext;
        this.mainPipeline = null;
        this.sampler = null;
        this.projectionMatrix = mat4.create();
        this.viewMatrix = mat4.create();
        this.normalMatrix = mat4.create();
    }

    /**
     * メインパイプラインを初期化
     * @param {string} shaderCode - WGSLシェーダーコード
     * @param {string} format - キャンバスフォーマット
     * @param {GPUTexture} envTexture - 環境テクスチャ
     */
    initMainPipeline(shaderCode, format, envTexture) {
        this.envTexture = envTexture;
        // バインドグループレイアウト
        const bindGroupLayout = this.gpu.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: {} }
            ]
        });
        
        const pipelineLayout = this.gpu.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });
        
        // シェーダーモジュール
        const shaderModule = this.gpu.createShaderModule(shaderCode);
        
        // パイプライン
        this.mainPipeline = this.gpu.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [
                    { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
                    { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
                    { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] },
                    { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: 'uint32x4' }] },
                    { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }] }
                ]
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format }]
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus'
            }
        });
        
        // サンプラー
        this.sampler = this.gpu.createSampler();
    }

    /**
     * カメラを更新
     * @param {Object} camera
     * @param {number[]} camera.position - カメラ位置
     * @param {number[]} camera.target - 注視点
     * @param {number} camera.fov - 視野角（ラジアン）
     * @param {number} camera.near - ニアクリップ
     * @param {number} camera.far - ファークリップ
     */
    updateCamera(camera) {
        const aspect = this.gpu.getAspectRatio();
        mat4.perspective(this.projectionMatrix, camera.fov, aspect, camera.near, camera.far);
        mat4.lookAt(this.viewMatrix, camera.position, camera.target, [0, 1, 0]);
    }

    /**
     * フレームを描画
     * @param {Object} scene - 描画するシーン
     * @param {Skybox} scene.skybox
     * @param {GroundTrackManager} scene.groundTracks
     * @param {Model[]} scene.models
     */
    render(scene) {
        const commandEncoder = this.gpu.createCommandEncoder();
        
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.gpu.getCurrentTextureView(),
                loadOp: 'clear',
                clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
                storeOp: 'store'
            }],
            depthStencilAttachment: {
                view: this.gpu.getDepthTextureView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store'
            }
        });
        
        // スカイボックス描画
        if (scene.skybox) {
            scene.skybox.draw(renderPass, this.projectionMatrix, this.viewMatrix);
        }
        
        // メインパイプラインに切り替え
        renderPass.setPipeline(this.mainPipeline);
        
        // グラウンドトラック描画
        if (scene.groundTracks) {
            scene.groundTracks.drawAll(renderPass, this.viewMatrix, this.projectionMatrix);
        }
        
        // モデル描画
        if (scene.models) {
            for (const model of scene.models) {
                this._drawModel(renderPass, model);
            }
        }
        
        renderPass.end();
        this.gpu.submit([commandEncoder.finish()]);
    }

    /**
     * モデルを描画
     * @param {GPURenderPassEncoder} renderPass
     * @param {Model} model
     * @private
     */
    _drawModel(renderPass, model) {
        const drawNode = (node) => {
            if (node.meshIndex !== undefined && node.primitiveInstances) {
                const skin = node.skinIndex !== null 
                    ? model.skinManager.get(node.skinIndex) 
                    : null;
                const mesh = model.meshes[node.meshIndex];
                const hasSkinning = mesh.primitives.some(p => p.hasSkinning);
                
                // スキニングを掠粗然と計算して正しい法線配列を推計
                let modelMatrix = node.worldMatrix;
                if (hasSkinning) {
                    // スキニングありの場合、スキニングを適用した後の法線を推計
                    // スキニングは长方形を正しく保持しない失われた位置で突然に変換をしなかった場合があるので、その場合も最後の結果を推計するため流の法線構成を求める
                    modelMatrix = mat4.create();
                }
                
                mat4.invert(this.normalMatrix, modelMatrix);
                mat4.transpose(this.normalMatrix, this.normalMatrix);
                
                for (const instance of node.primitiveInstances) {
                    this._drawPrimitive(renderPass, instance, modelMatrix, skin);
                }
            }
            
            for (const childIndex of node.children) {
                drawNode(model.nodes[childIndex]);
            }
        };
        
        for (const rootIndex of model.nodeHierarchy.rootNodes) {
            drawNode(model.nodes[rootIndex]);
        }
    }

    /**
     * プリミティブを描画
     * @private
     */
    _drawPrimitive(renderPass, instance, modelMatrix, skin) {
        const { primitive, uniformBuffer, jointMatricesBuffer, bindGroup } = instance;
        
        // Uniformデータ作成（WGSL構造体サイズ 368 バイト）
        const uniforms = new ArrayBuffer(368);
        const floatView = new Float32Array(uniforms);
        const uintView = new Uint32Array(uniforms);
        
        floatView.set(modelMatrix, 0);
        floatView.set(this.viewMatrix, 16);
        floatView.set(this.projectionMatrix, 32);
        floatView.set(this.normalMatrix, 48);
        floatView.set(DEFAULT_LIGHT_DIR, 64);
        floatView.set(primitive.baseColor, 68);
        uintView[72] = (primitive.hasSkinning && skin) ? 1 : 0;
        uintView[73] = primitive.hasTexture ? 1 : 0;
        uintView[74] = primitive.hasNormals ? 1 : 0;
        uintView[75] = primitive.hasMetallicRoughnessTexture ? 1 : 0;
        floatView[76] = primitive.metallicFactor;
        floatView[77] = primitive.roughnessFactor;
        floatView[78] = primitive.normalScale;
        uintView[79] = primitive.hasNormalTexture ? 1 : 0;
        floatView[80] = primitive.emissiveFactor[0];
        floatView[81] = primitive.emissiveFactor[1];
        floatView[82] = primitive.emissiveFactor[2];
        floatView[83] = primitive.emissiveFactor[3] ?? 1;
        uintView[84] = primitive.hasEmissiveTexture ? 1 : 0;
        
        this.gpu.writeBuffer(uniformBuffer, 0, uniforms);
        
        // ジョイント行列更新
        if (primitive.hasSkinning && skin) {
            const jointData = skin.getMatricesArray(MAX_JOINTS);
            this.gpu.writeBuffer(jointMatricesBuffer, 0, jointData);
        }
        
        // 描画
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setVertexBuffer(0, primitive.positionBuffer);
        renderPass.setVertexBuffer(1, primitive.normalBuffer);
        renderPass.setVertexBuffer(2, primitive.texCoordBuffer);
        renderPass.setVertexBuffer(3, primitive.jointsBuffer);
        renderPass.setVertexBuffer(4, primitive.weightsBuffer);
        
        if (primitive.hasIndices) {
            renderPass.setIndexBuffer(primitive.indexBuffer, primitive.indexFormat);
            renderPass.drawIndexed(primitive.indexCount);
        } else {
            renderPass.draw(primitive.indexCount);
        }
    }
}
