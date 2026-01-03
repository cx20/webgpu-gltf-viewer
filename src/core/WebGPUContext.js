/**
 * @fileoverview WebGPUの初期化とコンテキスト管理
 */

/**
 * WebGPUコンテキストを管理するクラス
 */
export class WebGPUContext {
    /**
     * @param {HTMLCanvasElement} canvas - 描画先のCanvas要素
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.device = null;
        this.context = null;
        this.format = null;
        this.depthTexture = null;
    }

    /**
     * WebGPUを初期化
     * @returns {Promise<void>}
     * @throws {Error} WebGPU非対応の場合
     */
    async initialize() {
        const gpu = navigator.gpu;
        if (!gpu) {
            throw new Error('WebGPU is not supported in this browser');
        }

        const adapter = await gpu.requestAdapter();
        if (!adapter) {
            throw new Error('Failed to get GPU adapter');
        }

        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');
        this.format = gpu.getPreferredCanvasFormat();

        this._configureContext();
        this._createDepthTexture();
        this._setupResizeHandler();
    }

    /**
     * コンテキストを設定
     * @private
     */
    _configureContext() {
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque'
        });
    }

    /**
     * 深度テクスチャを作成
     * @private
     */
    _createDepthTexture() {
        if (this.depthTexture) {
            this.depthTexture.destroy();
        }

        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
    }

    /**
     * リサイズハンドラを設定
     * @private
     */
    _setupResizeHandler() {
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * キャンバスをリサイズ
     */
    resize() {
        this.canvas.width = window.innerWidth * devicePixelRatio;
        this.canvas.height = window.innerHeight * devicePixelRatio;
        this._createDepthTexture();
    }

    /**
     * 現在のテクスチャビューを取得
     * @returns {GPUTextureView}
     */
    getCurrentTextureView() {
        return this.context.getCurrentTexture().createView();
    }

    /**
     * 深度テクスチャビューを取得
     * @returns {GPUTextureView}
     */
    getDepthTextureView() {
        return this.depthTexture.createView();
    }

    /**
     * アスペクト比を取得
     * @returns {number}
     */
    getAspectRatio() {
        return this.canvas.width / this.canvas.height;
    }

    /**
     * バッファを作成
     * @param {Object} descriptor - バッファ記述子
     * @returns {GPUBuffer}
     */
    createBuffer(descriptor) {
        return this.device.createBuffer(descriptor);
    }

    /**
     * シェーダーモジュールを作成
     * @param {string} code - WGSLシェーダーコード
     * @returns {GPUShaderModule}
     */
    createShaderModule(code) {
        return this.device.createShaderModule({ code });
    }

    /**
     * レンダーパイプラインを作成
     * @param {Object} descriptor - パイプライン記述子
     * @returns {GPURenderPipeline}
     */
    createRenderPipeline(descriptor) {
        return this.device.createRenderPipeline(descriptor);
    }

    /**
     * バインドグループを作成
     * @param {Object} descriptor - バインドグループ記述子
     * @returns {GPUBindGroup}
     */
    createBindGroup(descriptor) {
        return this.device.createBindGroup(descriptor);
    }

    /**
     * テクスチャを作成
     * @param {Object} descriptor - テクスチャ記述子
     * @returns {GPUTexture}
     */
    createTexture(descriptor) {
        return this.device.createTexture(descriptor);
    }

    /**
     * サンプラーを作成
     * @param {Object} descriptor - サンプラー記述子
     * @returns {GPUSampler}
     */
    createSampler(descriptor = {}) {
        return this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
            ...descriptor
        });
    }

    /**
     * コマンドエンコーダを作成
     * @returns {GPUCommandEncoder}
     */
    createCommandEncoder() {
        return this.device.createCommandEncoder();
    }

    /**
     * コマンドバッファをサブミット
     * @param {GPUCommandBuffer[]} commandBuffers
     */
    submit(commandBuffers) {
        this.device.queue.submit(commandBuffers);
    }

    /**
     * バッファにデータを書き込む
     * @param {GPUBuffer} buffer
     * @param {number} offset
     * @param {ArrayBuffer|ArrayBufferView} data
     */
    writeBuffer(buffer, offset, data) {
        this.device.queue.writeBuffer(buffer, offset, data);
    }

    /**
     * テクスチャにデータを書き込む
     * @param {Object} destination
     * @param {ArrayBuffer|ArrayBufferView} data
     * @param {Object} dataLayout
     * @param {number[]} size
     */
    writeTexture(destination, data, dataLayout, size) {
        this.device.queue.writeTexture(destination, data, dataLayout, size);
    }

    /**
     * 外部画像をテクスチャにコピー
     * @param {Object} source
     * @param {Object} destination
     * @param {number[]} size
     */
    copyExternalImageToTexture(source, destination, size) {
        this.device.queue.copyExternalImageToTexture(source, destination, size);
    }
}
