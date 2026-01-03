/**
 * @fileoverview glTF/GLBファイルの読み込みとパース
 */

import { COMPONENT_TYPE_ARRAYS, TYPE_COMPONENTS } from '../constants.js';

/** GLBマジックナンバー */
const GLB_MAGIC = 0x46546C67;

/**
 * glTF/GLBファイルを読み込むクラス
 */
export class GLTFLoader {
    /**
     * glTF/GLBファイルを読み込む
     * @param {string} url - ファイルURL
     * @returns {Promise<GLTFData>}
     */
    async load(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${url}`);
        }
        
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const isGLB = url.endsWith('.glb');
        
        if (isGLB) {
            const buffer = await response.arrayBuffer();
            return this._parseGLB(buffer, baseUrl);
        } else {
            const gltf = await response.json();
            return this._parseGLTF(gltf, baseUrl);
        }
    }

    /**
     * glTFをパース
     * @param {Object} gltf - glTF JSON
     * @param {string} baseUrl - ベースURL
     * @returns {Promise<GLTFData>}
     * @private
     */
    async _parseGLTF(gltf, baseUrl) {
        const buffers = [];
        
        if (gltf.buffers) {
            for (const buffer of gltf.buffers) {
                if (buffer.uri) {
                    const bufferUrl = new URL(buffer.uri, baseUrl).href;
                    const response = await fetch(bufferUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    buffers.push(new Uint8Array(arrayBuffer));
                }
            }
        }
        
        return { gltf, buffers, baseUrl };
    }

    /**
     * GLBをパース
     * @param {ArrayBuffer} buffer - GLBバイナリ
     * @param {string} baseUrl - ベースURL
     * @returns {GLTFData}
     * @private
     */
    _parseGLB(buffer, baseUrl) {
        const dataView = new DataView(buffer);
        const magic = dataView.getUint32(0, true);
        
        if (magic !== GLB_MAGIC) {
            throw new Error('Invalid GLB file');
        }
        
        const length = dataView.getUint32(8, true);
        let offset = 12;
        
        // JSONチャンク
        const jsonChunkLength = dataView.getUint32(offset, true);
        offset += 8;
        const jsonData = new Uint8Array(buffer, offset, jsonChunkLength);
        const gltf = JSON.parse(new TextDecoder().decode(jsonData));
        offset += jsonChunkLength;
        
        // バイナリチャンク
        const buffers = [];
        if (offset < length) {
            const binChunkLength = dataView.getUint32(offset, true);
            offset += 8;
            buffers.push(new Uint8Array(buffer, offset, binChunkLength));
        }
        
        return { gltf, buffers, baseUrl };
    }

    /**
     * アクセサからデータを取得
     * @param {Object} gltf - glTFデータ
     * @param {Uint8Array[]} buffers - バイナリバッファ
     * @param {number} accessorIndex - アクセサインデックス
     * @returns {TypedArray}
     */
    static getAccessorData(gltf, buffers, accessorIndex) {
        const accessor = gltf.accessors[accessorIndex];
        const bufferView = gltf.bufferViews[accessor.bufferView];
        const bufferIndex = bufferView.buffer || 0;
        const binData = buffers[bufferIndex];
        const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
        const count = accessor.count;
        
        const TypedArray = COMPONENT_TYPE_ARRAYS[accessor.componentType];
        const components = TYPE_COMPONENTS[accessor.type];
        const byteStride = bufferView.byteStride || 0;
        
        // インターリーブデータの処理
        if (byteStride && byteStride !== components * TypedArray.BYTES_PER_ELEMENT) {
            return this._extractInterleavedData(
                binData, byteOffset, count, components, byteStride, TypedArray
            );
        }
        
        return new TypedArray(
            binData.buffer, 
            binData.byteOffset + byteOffset, 
            count * components
        );
    }

    /**
     * インターリーブデータを抽出
     * @private
     */
    static _extractInterleavedData(binData, byteOffset, count, components, byteStride, TypedArray) {
        const result = new TypedArray(count * components);
        const elementSize = TypedArray.BYTES_PER_ELEMENT;
        
        for (let i = 0; i < count; i++) {
            const srcOffset = byteOffset + i * byteStride;
            
            for (let j = 0; j < components; j++) {
                const view = new DataView(
                    binData.buffer, 
                    binData.byteOffset + srcOffset + j * elementSize, 
                    elementSize
                );
                
                if (TypedArray === Float32Array) {
                    result[i * components + j] = view.getFloat32(0, true);
                } else if (TypedArray === Uint16Array) {
                    result[i * components + j] = view.getUint16(0, true);
                } else if (TypedArray === Uint32Array) {
                    result[i * components + j] = view.getUint32(0, true);
                } else if (TypedArray === Uint8Array) {
                    result[i * components + j] = view.getUint8(0);
                }
            }
        }
        
        return result;
    }
}

/**
 * @typedef {Object} GLTFData
 * @property {Object} gltf - glTF JSON
 * @property {Uint8Array[]} buffers - バイナリバッファ
 * @property {string} baseUrl - ベースURL
 */
