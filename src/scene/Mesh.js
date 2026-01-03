/**
 * @fileoverview メッシュとプリミティブの管理
 */

import { GLTFLoader } from '../loaders/GLTFLoader.js';
import { COMPONENT_TYPES, MAX_JOINTS, UNIFORM_BUFFER_SIZE, JOINT_MATRICES_BUFFER_SIZE } from '../constants.js';

/**
 * メッシュのプリミティブ（サブメッシュ）を表すクラス
 */
export class Primitive {
    constructor() {
        // GPUバッファ
        this.positionBuffer = null;
        this.normalBuffer = null;
        this.texCoordBuffer = null;
        this.jointsBuffer = null;
        this.weightsBuffer = null;
        this.indexBuffer = null;
        
        // 描画情報
        this.indexCount = 0;
        this.indexFormat = 'uint16';
        this.hasIndices = false;
        
        // マテリアル情報
        this.texture = null;
        this.baseColor = [1, 1, 1, 1];
        this.hasTexture = false;
        
        // PBR マテリアル
        this.metallicRoughnessTexture = null;
        this.metallicFactor = 1.0;
        this.roughnessFactor = 1.0;
        this.hasMetallicRoughnessTexture = false;
        this.normalTexture = null;
        this.normalScale = 1.0;
        this.hasNormalTexture = false;
        this.emissiveTexture = null;
        this.emissiveFactor = [0, 0, 0, 1];
        this.hasEmissiveTexture = false;
        
        // 機能フラグ
        this.hasSkinning = false;
        this.hasNormals = false;
        
        // バウンディングボックス
        this.bbox = null;
    }
}

/**
 * メッシュを表すクラス
 */
export class Mesh {
    /**
     * @param {string} name - メッシュ名
     */
    constructor(name = 'Mesh') {
        this.name = name;
        this.primitives = [];
        this.bbox = null;
    }

    /**
     * バウンディングボックスを計算
     * @param {Float32Array} positions - 位置配列
     * @returns {Object} { min, max }
     */
    static calculateBoundingBox(positions) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        
        for (let i = 0; i < positions.length; i += 3) {
            min[0] = Math.min(min[0], positions[i]);
            min[1] = Math.min(min[1], positions[i + 1]);
            min[2] = Math.min(min[2], positions[i + 2]);
            max[0] = Math.max(max[0], positions[i]);
            max[1] = Math.max(max[1], positions[i + 1]);
            max[2] = Math.max(max[2], positions[i + 2]);
        }
        
        return { min, max };
    }

    /**
     * バウンディングボックスをマージ
     * @param {Object} a
     * @param {Object} b
     * @returns {Object}
     */
    static mergeBoundingBoxes(a, b) {
        return {
            min: [
                Math.min(a.min[0], b.min[0]),
                Math.min(a.min[1], b.min[1]),
                Math.min(a.min[2], b.min[2])
            ],
            max: [
                Math.max(a.max[0], b.max[0]),
                Math.max(a.max[1], b.max[1]),
                Math.max(a.max[2], b.max[2])
            ]
        };
    }
}

/**
 * メッシュを処理・作成するファクトリークラス
 */
export class MeshFactory {
    /**
     * @param {WebGPUContext} gpuContext
     * @param {TextureLoader} textureLoader
     */
    constructor(gpuContext, textureLoader) {
        this.gpu = gpuContext;
        this.textureLoader = textureLoader;
    }

    /**
     * GPUバッファを作成
     * @param {TypedArray} data
     * @param {number} usage
     * @returns {GPUBuffer}
     * @private
     */
    _createBuffer(data, usage) {
        const buffer = this.gpu.createBuffer({
            size: data.byteLength,
            usage,
            mappedAtCreation: true
        });
        
        new data.constructor(buffer.getMappedRange()).set(data);
        buffer.unmap();
        
        return buffer;
    }

    /**
     * glTFからメッシュを作成
     * @param {Object} gltf
     * @param {Uint8Array[]} buffers
     * @param {string} baseUrl
     * @param {number} meshIndex
     * @param {GPUTexture} defaultTexture
     * @returns {Promise<Mesh>}
     */
    async createFromGLTF(gltf, buffers, baseUrl, meshIndex, defaultTexture) {
        const meshData = gltf.meshes[meshIndex];
        const mesh = new Mesh(meshData.name || `Mesh_${meshIndex}`);
        
        for (const primData of meshData.primitives) {
            const primitive = await this._processPrimitive(
                gltf, buffers, baseUrl, primData, defaultTexture
            );
            mesh.primitives.push(primitive);
        }
        
        // 全体のバウンディングボックスを計算
        if (mesh.primitives.length > 0) {
            mesh.bbox = mesh.primitives[0].bbox;
            for (let i = 1; i < mesh.primitives.length; i++) {
                mesh.bbox = Mesh.mergeBoundingBoxes(mesh.bbox, mesh.primitives[i].bbox);
            }
        }
        
        return mesh;
    }

    /**
     * プリミティブを処理
     * @private
     */
    async _processPrimitive(gltf, buffers, baseUrl, primData, defaultTexture) {
        const primitive = new Primitive();
        const attrs = primData.attributes;
        
        // 位置データ取得
        const positions = GLTFLoader.getAccessorData(gltf, buffers, attrs.POSITION);
        const vertexCount = positions.length / 3;
        
        // 各属性データを取得（またはデフォルト生成）
        const normals = attrs.NORMAL !== undefined 
            ? GLTFLoader.getAccessorData(gltf, buffers, attrs.NORMAL)
            : this._generateDefaultNormals(vertexCount);
            
        const texCoords = attrs.TEXCOORD_0 !== undefined
            ? GLTFLoader.getAccessorData(gltf, buffers, attrs.TEXCOORD_0)
            : new Float32Array(vertexCount * 2);
            
        const joints = attrs.JOINTS_0 !== undefined
            ? this._convertJointsToUint32(GLTFLoader.getAccessorData(gltf, buffers, attrs.JOINTS_0), vertexCount)
            : new Uint32Array(vertexCount * 4);
            
        const weights = attrs.WEIGHTS_0 !== undefined
            ? GLTFLoader.getAccessorData(gltf, buffers, attrs.WEIGHTS_0)
            : this._generateDefaultWeights(vertexCount);
        
        // GPUバッファ作成
        primitive.positionBuffer = this._createBuffer(positions, GPUBufferUsage.VERTEX);
        primitive.normalBuffer = this._createBuffer(normals, GPUBufferUsage.VERTEX);
        primitive.texCoordBuffer = this._createBuffer(texCoords, GPUBufferUsage.VERTEX);
        primitive.jointsBuffer = this._createBuffer(joints, GPUBufferUsage.VERTEX);
        primitive.weightsBuffer = this._createBuffer(weights, GPUBufferUsage.VERTEX);
        
        // インデックスバッファ
        if (primData.indices !== undefined) {
            this._processIndices(primitive, gltf, buffers, primData.indices);
        } else {
            primitive.indexCount = vertexCount;
        }
        
        // マテリアル処理
        await this._processMaterial(primitive, gltf, buffers, baseUrl, primData, defaultTexture);
        
        // 機能フラグ
        primitive.hasSkinning = attrs.JOINTS_0 !== undefined && attrs.WEIGHTS_0 !== undefined;
        primitive.hasNormals = attrs.NORMAL !== undefined;
        
        // バウンディングボックス
        primitive.bbox = Mesh.calculateBoundingBox(positions);
        
        return primitive;
    }

    /**
     * デフォルト法線を生成
     * @private
     */
    _generateDefaultNormals(vertexCount) {
        const normals = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
            normals[i * 3 + 1] = 1; // Y軸向き
        }
        return normals;
    }

    /**
     * デフォルトウェイトを生成
     * @private
     */
    _generateDefaultWeights(vertexCount) {
        const weights = new Float32Array(vertexCount * 4);
        for (let i = 0; i < vertexCount; i++) {
            weights[i * 4] = 1; // 最初のジョイントのみ
        }
        return weights;
    }

    /**
     * ジョイントインデックスをUint32に変換
     * @private
     */
    _convertJointsToUint32(joints, vertexCount) {
        const result = new Uint32Array(vertexCount * 4);
        for (let i = 0; i < joints.length; i++) {
            result[i] = joints[i];
        }
        return result;
    }

    /**
     * インデックスを処理
     * @private
     */
    _processIndices(primitive, gltf, buffers, indicesAccessor) {
        const indices = GLTFLoader.getAccessorData(gltf, buffers, indicesAccessor);
        const accessor = gltf.accessors[indicesAccessor];
        
        let indexData;
        let indexFormat;
        
        if (accessor.componentType === COMPONENT_TYPES.UNSIGNED_SHORT) {
            indexData = indices;
            indexFormat = 'uint16';
        } else if (accessor.componentType === COMPONENT_TYPES.UNSIGNED_INT) {
            indexData = indices;
            indexFormat = 'uint32';
        } else {
            // UNSIGNED_BYTE -> uint16に変換
            indexData = new Uint16Array(indices.length);
            for (let i = 0; i < indices.length; i++) {
                indexData[i] = indices[i];
            }
            indexFormat = 'uint16';
        }
        
        // 4バイトアライメント
        const bufferSize = Math.ceil(indexData.byteLength / 4) * 4;
        
        const indexBuffer = this.gpu.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true
        });
        
        if (indexFormat === 'uint32') {
            new Uint32Array(indexBuffer.getMappedRange()).set(indexData);
        } else {
            new Uint16Array(indexBuffer.getMappedRange()).set(indexData);
        }
        indexBuffer.unmap();
        
        primitive.indexBuffer = indexBuffer;
        primitive.indexCount = indices.length;
        primitive.indexFormat = indexFormat;
        primitive.hasIndices = true;
    }

    /**
     * マテリアルを処理
     * @private
     */
    async _processMaterial(primitive, gltf, buffers, baseUrl, primData, defaultTexture) {
        // デフォルト値を設定（必ず実行）
        primitive.texture = defaultTexture;
        primitive.baseColor = [1, 1, 1, 1];
        primitive.hasTexture = false;
        primitive.metallicRoughnessTexture = defaultTexture;
        primitive.metallicFactor = 1.0;
        primitive.roughnessFactor = 1.0;
        primitive.hasMetallicRoughnessTexture = false;
        primitive.normalTexture = defaultTexture;
        primitive.normalScale = 1.0;
        primitive.hasNormalTexture = false;
        primitive.emissiveTexture = defaultTexture;
        primitive.emissiveFactor = [0, 0, 0, 1];
        primitive.hasEmissiveTexture = false;
        
        if (primData.material === undefined) return;
        
        const material = gltf.materials[primData.material];
        
        const pbr = material.pbrMetallicRoughness;
        
        // ベースカラー
        if (pbr.baseColorTexture) {
            primitive.texture = await this.textureLoader.loadFromGLTF(
                gltf, buffers, baseUrl, pbr.baseColorTexture.index
            );
            primitive.hasTexture = true;
        }
        
        if (pbr.baseColorFactor) {
            primitive.baseColor = pbr.baseColorFactor;
        }
        
        // Metallic/Roughness
        if (pbr.metallicRoughnessTexture) {
            primitive.metallicRoughnessTexture = await this.textureLoader.loadFromGLTF(
                gltf, buffers, baseUrl, pbr.metallicRoughnessTexture.index
            );
            primitive.hasMetallicRoughnessTexture = true;
        }
        
        if (pbr.metallicFactor !== undefined) {
            primitive.metallicFactor = pbr.metallicFactor;
        }
        
        if (pbr.roughnessFactor !== undefined) {
            primitive.roughnessFactor = pbr.roughnessFactor;
        }

        // Emissive
        if (material.emissiveTexture) {
            primitive.emissiveTexture = await this.textureLoader.loadFromGLTF(
                gltf, buffers, baseUrl, material.emissiveTexture.index
            );
            primitive.hasEmissiveTexture = true;
        }

        if (material.emissiveFactor) {
            const f = material.emissiveFactor;
            primitive.emissiveFactor = [f[0] ?? 0, f[1] ?? 0, f[2] ?? 0, 1];
        }
        
        // Normal Map
        if (material.normalTexture) {
            primitive.normalTexture = await this.textureLoader.loadFromGLTF(
                gltf, buffers, baseUrl, material.normalTexture.index
            );
            primitive.hasNormalTexture = true;
            if (material.normalTexture.scale !== undefined) {
                primitive.normalScale = material.normalTexture.scale;
            }
        }
    }
}

/**
 * ノードごとのプリミティブインスタンスリソースを作成
 */
export class PrimitiveInstanceFactory {
    /**
     * @param {WebGPUContext} gpuContext
     * @param {GPURenderPipeline} pipeline
     * @param {GPUSampler} sampler
     * @param {GPUTexture} envTexture - 環境テクスチャ
     */
    constructor(gpuContext, pipeline, sampler, envTexture) {
        this.gpu = gpuContext;
        this.pipeline = pipeline;
        this.sampler = sampler;
        this.envTexture = envTexture;
    }

    /**
     * プリミティブインスタンスを作成
     * @param {Primitive} primitive
     * @returns {Object}
     */
    create(primitive) {
        const uniformBuffer = this.gpu.createBuffer({
            size: UNIFORM_BUFFER_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        const jointMatricesBuffer = this.gpu.createBuffer({
            size: JOINT_MATRICES_BUFFER_SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // テクスチャが存在することを確認
        if (!primitive.texture) {
            throw new Error('Primitive texture is not initialized');
        }
        if (!primitive.metallicRoughnessTexture) {
            throw new Error('Primitive metallicRoughnessTexture is not initialized');
        }
        if (!primitive.normalTexture) {
            throw new Error('Primitive normalTexture is not initialized');
        }
        if (!primitive.emissiveTexture) {
            throw new Error('Primitive emissiveTexture is not initialized');
        }
        
        const bindGroup = this.gpu.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: jointMatricesBuffer } },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: primitive.texture.createView() },
                { binding: 4, resource: primitive.metallicRoughnessTexture.createView() },
                { binding: 5, resource: primitive.normalTexture.createView() },
                { binding: 6, resource: this.envTexture.createView() },
                { binding: 7, resource: primitive.emissiveTexture.createView() }
            ]
        });
        
        return {
            primitive,
            uniformBuffer,
            jointMatricesBuffer,
            bindGroup
        };
    }
}
