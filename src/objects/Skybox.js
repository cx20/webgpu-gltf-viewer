/**
 * @fileoverview スカイボックスの管理と描画
 */

const { mat4 } = glMatrix;

/**
 * スカイボックスを管理するクラス
 */
export class Skybox {
    /**
     * @param {WebGPUContext} gpuContext
     */
    constructor(gpuContext) {
        this.gpu = gpuContext;
        this.vertexBuffer = null;
        this.uniformBuffer = null;
        this.pipeline = null;
        this.bindGroup = null;
        this.texture = null;
    }

    /**
     * スカイボックスを初期化
     * @param {string} shaderCode - WGSLシェーダーコード
     * @param {string} format - キャンバスフォーマット
     */
    initPipeline(shaderCode, format) {
        // 立方体の頂点データ
        const vertices = new Float32Array([
            -1,  1, -1, -1, -1, -1,  1, -1, -1,  1, -1, -1,  1,  1, -1, -1,  1, -1, // -Z
            -1, -1,  1, -1, -1, -1, -1,  1, -1, -1,  1, -1, -1,  1,  1, -1, -1,  1, // -X
             1, -1, -1,  1, -1,  1,  1,  1,  1,  1,  1,  1,  1,  1, -1,  1, -1, -1, // +X
            -1, -1,  1, -1,  1,  1,  1,  1,  1,  1,  1,  1,  1, -1,  1, -1, -1,  1, // +Z
            -1,  1, -1,  1,  1, -1,  1,  1,  1,  1,  1,  1, -1,  1,  1, -1,  1, -1, // +Y
            -1, -1, -1, -1, -1,  1,  1, -1, -1,  1, -1, -1, -1, -1,  1,  1, -1,  1  // -Y
        ]);
        
        this.vertexBuffer = this.gpu.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
        this.vertexBuffer.unmap();
        
        // Uniformバッファ
        this.uniformBuffer = this.gpu.createBuffer({
            size: 128, // 2 * mat4
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // バインドグループレイアウト
        const bindGroupLayout = this.gpu.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: 'cube' } }
            ]
        });
        
        const pipelineLayout = this.gpu.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });
        
        // シェーダーモジュール
        const shaderModule = this.gpu.createShaderModule(shaderCode);
        
        // パイプライン
        this.pipeline = this.gpu.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 12,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format }]
            },
            primitive: { topology: 'triangle-list' },
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
                format: 'depth24plus'
            }
        });
        
        this.bindGroupLayout = bindGroupLayout;
    }

    /**
     * キューブマップテクスチャを設定
     * @param {GPUTexture} texture
     * @param {GPUSampler} sampler
     */
    setTexture(texture, sampler) {
        this.texture = texture;
        
        this.bindGroup = this.gpu.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: texture.createView({ dimension: 'cube' }) }
            ]
        });
    }

    /**
     * 描画
     * @param {GPURenderPassEncoder} renderPass
     * @param {mat4} projectionMatrix
     * @param {mat4} viewMatrix
     */
    draw(renderPass, projectionMatrix, viewMatrix) {
        if (!this.bindGroup) return;
        
        // ビュー行列から平行移動を除去
        const skyboxView = mat4.clone(viewMatrix);
        skyboxView[12] = 0;
        skyboxView[13] = 0;
        skyboxView[14] = 0;
        
        // Uniform更新
        const uniforms = new Float32Array(32);
        uniforms.set(projectionMatrix, 0);
        uniforms.set(skyboxView, 16);
        this.gpu.writeBuffer(this.uniformBuffer, 0, uniforms);
        
        // 描画
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.draw(36);
    }
}
