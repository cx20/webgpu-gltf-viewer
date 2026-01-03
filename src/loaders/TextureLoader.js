/**
 * @fileoverview テクスチャの読み込みと管理
 */

/**
 * テクスチャを読み込むクラス
 */
export class TextureLoader {
    /**
     * @param {WebGPUContext} gpuContext - WebGPUコンテキスト
     */
    constructor(gpuContext) {
        this.gpu = gpuContext;
        this.cache = new Map();
    }

    /**
     * デフォルトの白テクスチャを作成
     * @returns {GPUTexture}
     */
    createDefaultTexture() {
        const texture = this.gpu.createTexture({
            size: [1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        
        this.gpu.writeTexture(
            { texture },
            new Uint8Array([255, 255, 255, 255]),
            { bytesPerRow: 4 },
            [1, 1]
        );
        
        return texture;
    }

    /**
     * URLから画像を読み込む
     * @param {string} url - 画像URL
     * @returns {Promise<ImageBitmap>}
     * @private
     */
    async _loadImage(url) {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
        
        return createImageBitmap(img);
    }

    /**
     * Blobから画像を読み込む
     * @param {Blob} blob - 画像Blob
     * @returns {Promise<ImageBitmap>}
     * @private
     */
    async _loadImageFromBlob(blob) {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        const url = URL.createObjectURL(blob);
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
        
        URL.revokeObjectURL(url);
        return createImageBitmap(img);
    }

    /**
     * ImageBitmapからテクスチャを作成
     * @param {ImageBitmap} imageBitmap
     * @returns {GPUTexture}
     * @private
     */
    _createTextureFromBitmap(imageBitmap) {
        const texture = this.gpu.createTexture({
            size: [imageBitmap.width, imageBitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.COPY_DST | 
                   GPUTextureUsage.RENDER_ATTACHMENT
        });
        
        this.gpu.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture },
            [imageBitmap.width, imageBitmap.height]
        );
        
        return texture;
    }

    /**
     * glTFからテクスチャを読み込む
     * @param {Object} gltf - glTFデータ
     * @param {Uint8Array[]} buffers - バイナリバッファ
     * @param {string} baseUrl - ベースURL
     * @param {number} textureIndex - テクスチャインデックス
     * @returns {Promise<GPUTexture>}
     */
    async loadFromGLTF(gltf, buffers, baseUrl, textureIndex) {
        const cacheKey = `${baseUrl}:${textureIndex}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const textureInfo = gltf.textures[textureIndex];
        const image = gltf.images[textureInfo.source];
        
        let imageBitmap;
        
        if (image.uri) {
            const imageUrl = new URL(image.uri, baseUrl).href;
            imageBitmap = await this._loadImage(imageUrl);
        } else if (image.bufferView !== undefined) {
            const bufferView = gltf.bufferViews[image.bufferView];
            const binData = buffers[bufferView.buffer || 0];
            const byteOffset = bufferView.byteOffset || 0;
            
            const blob = new Blob(
                [new Uint8Array(binData.buffer, binData.byteOffset + byteOffset, bufferView.byteLength)],
                { type: image.mimeType }
            );
            
            imageBitmap = await this._loadImageFromBlob(blob);
        } else {
            throw new Error('Invalid image source in glTF');
        }
        
        const texture = this._createTextureFromBitmap(imageBitmap);
        this.cache.set(cacheKey, texture);
        
        return texture;
    }

    /**
     * キューブマップテクスチャを読み込む
     * @param {string[]} urls - 6面のテクスチャURL配列 [+X, -X, +Y, -Y, +Z, -Z]
     * @returns {Promise<GPUTexture>}
     */
    async loadCubeMap(urls) {
        const cacheKey = urls.join('|');
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const images = await Promise.all(
            urls.map(url => this._loadImage(url))
        );
        
        const size = images[0].width;
        
        const texture = this.gpu.createTexture({
            size: [size, size, 6],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.COPY_DST | 
                   GPUTextureUsage.RENDER_ATTACHMENT,
            dimension: '2d'
        });
        
        for (let i = 0; i < 6; i++) {
            this.gpu.copyExternalImageToTexture(
                { source: images[i] },
                { texture, origin: [0, 0, i] },
                [size, size]
            );
        }
        
        this.cache.set(cacheKey, texture);
        return texture;
    }

    /**
     * HDRテクスチャを読み込む（latlong形式）
     * @param {string} url - HDR画像URL
     * @returns {Promise<GPUTexture>}
     */
    async loadHDR(url) {
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        const arrayBuffer = await fetch(url).then(r => r.arrayBuffer());
        const hdrData = this._parseHDR(arrayBuffer);
        
        const texture = this.gpu.createTexture({
            size: [hdrData.width, hdrData.height],
            format: 'rgba16float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        
        this.gpu.writeTexture(
            { texture },
            hdrData.data,
            { bytesPerRow: hdrData.width * 8 }, // 16-bit float per channel * 4 channels
            [hdrData.width, hdrData.height]
        );
        
        this.cache.set(url, texture);
        return texture;
    }

    /**
     * HDRファイルをパース（Radiance HDR形式）
     * @param {ArrayBuffer} arrayBuffer
     * @returns {{width: number, height: number, data: Float32Array}}
     * @private
     */
    _parseHDR(arrayBuffer) {
        const view = new Uint8Array(arrayBuffer);
        let offset = 0;

        // ヘッダー確認
        const header = new TextDecoder().decode(view.slice(0, 10));
        if (header !== '#?RADIANCE') {
            throw new Error('Invalid HDR file format');
        }
        offset = 10;

        // メタデータスキップ
        while (offset < view.length) {
            if (view[offset] === 10 && view[offset + 1] === 10) { // \n\n
                offset += 2;
                break;
            }
            offset++;
        }

        // 解像度行解析
        const resLine = new TextDecoder().decode(view.slice(offset, offset + 32));
        const resMatch = resLine.match(/-Y (\d+) \+X (\d+)/);
        if (!resMatch) {
            throw new Error('Invalid HDR resolution line');
        }

        const height = parseInt(resMatch[1]);
        const width = parseInt(resMatch[2]);

        offset += resLine.indexOf('\n') + 1;

        // RGBデータ読み込み（Run-Length Encoding）
        const data = new Float32Array(width * height * 4);
        let pixelIndex = 0;

        while (offset < view.length && pixelIndex < width * height) {
            const code = view[offset++];

            if (code === 1) {
                // 次の4バイトはRGBE
                const r = view[offset++];
                const g = view[offset++];
                const b = view[offset++];
                const e = view[offset++];
                const f = Math.pow(2.0, e - 128);
                
                data[pixelIndex * 4 + 0] = (r / 255.0) * f;
                data[pixelIndex * 4 + 1] = (g / 255.0) * f;
                data[pixelIndex * 4 + 2] = (b / 255.0) * f;
                data[pixelIndex * 4 + 3] = 1.0;
                pixelIndex++;
            } else if (code > 1 && code <= 128) {
                // RLE圧縮データ
                const r = view[offset++];
                const g = view[offset++];
                const b = view[offset++];
                const e = view[offset++];
                const f = Math.pow(2.0, e - 128);

                for (let i = 0; i < code; i++) {
                    data[pixelIndex * 4 + 0] = (r / 255.0) * f;
                    data[pixelIndex * 4 + 1] = (g / 255.0) * f;
                    data[pixelIndex * 4 + 2] = (b / 255.0) * f;
                    data[pixelIndex * 4 + 3] = 1.0;
                    pixelIndex++;
                }
            }
        }

        return { width, height, data };
    }

    /**
     * キャッシュをクリア
     */
    clearCache() {
        this.cache.clear();
    }
}
