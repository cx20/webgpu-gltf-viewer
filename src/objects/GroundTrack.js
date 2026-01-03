/**
 * @fileoverview 地面のトラック（線）オブジェクト
 */

const { mat4 } = glMatrix;

import { MAX_JOINTS, UNIFORM_BUFFER_SIZE, JOINT_MATRICES_BUFFER_SIZE, DEFAULT_LIGHT_DIR } from '../constants.js';

/**
 * 地面に描画するトラック（線）を表すクラス
 */
export class GroundTrack {
    /**
     * @param {WebGPUContext} gpuContext
     * @param {Object} config
     * @param {number} config.width - 幅
     * @param {number} config.height - 高さ（太さ）
     * @param {number[]} config.color - 色 [r, g, b, a]
     * @param {number[]} config.position - 位置 [x, y, z]
     */
    constructor(gpuContext, config) {
        this.gpu = gpuContext;
        this.config = config;
        this.position = config.position;
        this.color = config.color;
        
        this._createGeometry(config.width, config.height);
    }

    /**
     * ジオメトリを作成
     * @private
     */
    _createGeometry(width, height) {
        const hw = width / 2;
        
        // 位置
        const positions = new Float32Array([
            -hw, 0, 0,
             hw, 0, 0,
             hw, 0, height,
            -hw, 0, height
        ]);
        
        // 法線（上向き）
        const normals = new Float32Array([
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
            0, 1, 0
        ]);
        
        // UV
        const texCoords = new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ]);
        
        // インデックス
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        
        // ダミーのジョイント/ウェイト
        const joints = new Uint32Array(16);
        const weights = new Float32Array(16);
        
        // バッファ作成
        this.positionBuffer = this._createBuffer(positions, GPUBufferUsage.VERTEX);
        this.normalBuffer = this._createBuffer(normals, GPUBufferUsage.VERTEX);
        this.texCoordBuffer = this._createBuffer(texCoords, GPUBufferUsage.VERTEX);
        this.jointsBuffer = this._createBuffer(joints, GPUBufferUsage.VERTEX);
        this.weightsBuffer = this._createBuffer(weights, GPUBufferUsage.VERTEX);
        this.indexBuffer = this._createBuffer(indices, GPUBufferUsage.INDEX);
        
        this.indexCount = indices.length;
    }

    /**
     * バッファを作成
     * @private
     */
    _createBuffer(data, usage) {
        const buffer = this.gpu.createBuffer({
            size: Math.max(data.byteLength, 16), // 最小16バイト
            usage,
            mappedAtCreation: true
        });
        new data.constructor(buffer.getMappedRange()).set(data);
        buffer.unmap();
        return buffer;
    }

    /**
     * GPUリソースを初期化
     * @param {GPURenderPipeline} pipeline
     * @param {GPUSampler} sampler
     * @param {GPUTexture} defaultTexture
     */
    initResources(pipeline, sampler, defaultTexture) {
        this.uniformBuffer = this.gpu.createBuffer({
            size: UNIFORM_BUFFER_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.jointMatricesBuffer = this.gpu.createBuffer({
            size: JOINT_MATRICES_BUFFER_SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        this.bindGroup = this.gpu.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.jointMatricesBuffer } },
                { binding: 2, resource: sampler },
                { binding: 3, resource: defaultTexture.createView() },
                { binding: 4, resource: defaultTexture.createView() },
                { binding: 5, resource: defaultTexture.createView() },
                { binding: 6, resource: defaultTexture.createView() },
                { binding: 7, resource: defaultTexture.createView() }
            ]
        });
    }

    /**
     * 描画
     * @param {GPURenderPassEncoder} renderPass
     * @param {mat4} viewMatrix
     * @param {mat4} projectionMatrix
     */
    draw(renderPass, viewMatrix, projectionMatrix) {
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, this.position);
        
        const normalMatrix = mat4.create();
        mat4.invert(normalMatrix, modelMatrix);
        mat4.transpose(normalMatrix, normalMatrix);
        
        // Uniformデータ作成
        const uniforms = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
        const floatView = new Float32Array(uniforms);
        const uintView = new Uint32Array(uniforms);
        
        floatView.set(modelMatrix, 0);
        floatView.set(viewMatrix, 16);
        floatView.set(projectionMatrix, 32);
        floatView.set(normalMatrix, 48);
        floatView.set(DEFAULT_LIGHT_DIR, 64);
        floatView.set(this.color, 68);
        uintView[72] = 0; // hasSkinning
        uintView[73] = 0; // hasTexture
        uintView[74] = 1; // hasNormals
        
        this.gpu.writeBuffer(this.uniformBuffer, 0, uniforms);
        
        // 描画
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.positionBuffer);
        renderPass.setVertexBuffer(1, this.normalBuffer);
        renderPass.setVertexBuffer(2, this.texCoordBuffer);
        renderPass.setVertexBuffer(3, this.jointsBuffer);
        renderPass.setVertexBuffer(4, this.weightsBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint32');
        renderPass.drawIndexed(this.indexCount);
    }
}

/**
 * 複数のグラウンドトラックを管理するクラス
 */
export class GroundTrackManager {
    /**
     * @param {WebGPUContext} gpuContext
     */
    constructor(gpuContext) {
        this.gpu = gpuContext;
        this.tracks = [];
    }

    /**
     * 設定からトラックを作成
     * @param {Object[]} configs
     */
    createFromConfigs(configs) {
        for (const config of configs) {
            this.tracks.push(new GroundTrack(this.gpu, config));
        }
    }

    /**
     * 全トラックのリソースを初期化
     * @param {GPURenderPipeline} pipeline
     * @param {GPUSampler} sampler
     * @param {GPUTexture} defaultTexture
     */
    initResources(pipeline, sampler, defaultTexture) {
        for (const track of this.tracks) {
            track.initResources(pipeline, sampler, defaultTexture);
        }
    }

    /**
     * 全トラックを描画
     * @param {GPURenderPassEncoder} renderPass
     * @param {mat4} viewMatrix
     * @param {mat4} projectionMatrix
     */
    drawAll(renderPass, viewMatrix, projectionMatrix) {
        for (const track of this.tracks) {
            track.draw(renderPass, viewMatrix, projectionMatrix);
        }
    }
}
