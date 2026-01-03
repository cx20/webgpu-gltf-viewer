/**
 * @fileoverview シーングラフのノード管理
 */

const { mat4, vec3, quat } = glMatrix;

/**
 * シーングラフのノードを表すクラス
 */
export class Node {
    /**
     * @param {Object} options
     * @param {string} [options.name] - ノード名
     * @param {vec3} [options.translation] - 位置
     * @param {quat} [options.rotation] - 回転（クォータニオン）
     * @param {vec3} [options.scale] - スケール
     * @param {number} [options.meshIndex] - メッシュインデックス
     * @param {number} [options.skinIndex] - スキンインデックス
     * @param {number[]} [options.children] - 子ノードインデックス
     */
    constructor(options = {}) {
        this.name = options.name || 'Node';
        this.translation = options.translation || vec3.fromValues(0, 0, 0);
        this.rotation = options.rotation || quat.fromValues(0, 0, 0, 1);
        this.scale = options.scale || vec3.fromValues(1, 1, 1);
        this.meshIndex = options.meshIndex;
        this.skinIndex = options.skinIndex ?? null;
        this.children = options.children || [];
        
        this.matrix = mat4.create();
        this.worldMatrix = mat4.create();
        this.hasOriginalMatrix = options.hasOriginalMatrix || false;
        
        // メッシュインスタンスのGPUリソース（後で設定）
        this.primitiveInstances = null;
    }

    /**
     * glTFノードデータから作成
     * @param {Object} nodeData - glTFノードデータ
     * @param {number} index - ノードインデックス
     * @returns {Node}
     */
    static fromGLTF(nodeData, index) {
        const node = new Node({
            name: nodeData.name || `Node_${index}`,
            translation: nodeData.translation 
                ? vec3.clone(nodeData.translation) 
                : vec3.fromValues(0, 0, 0),
            rotation: nodeData.rotation 
                ? quat.clone(nodeData.rotation) 
                : quat.fromValues(0, 0, 0, 1),
            scale: nodeData.scale 
                ? vec3.clone(nodeData.scale) 
                : vec3.fromValues(1, 1, 1),
            meshIndex: nodeData.mesh,
            skinIndex: nodeData.skin,
            children: nodeData.children ? [...nodeData.children] : [],
            hasOriginalMatrix: !!nodeData.matrix
        });
        
        // ノードに行列が直接指定されている場合、TRSに分解
        if (nodeData.matrix) {
            mat4.copy(node.matrix, nodeData.matrix);
            mat4.getTranslation(node.translation, node.matrix);
            mat4.getRotation(node.rotation, node.matrix);
            mat4.getScaling(node.scale, node.matrix);
        }
        
        return node;
    }

    /**
     * ローカル行列を更新
     */
    updateLocalMatrix() {
        mat4.fromRotationTranslationScale(
            this.matrix,
            this.rotation,
            this.translation,
            this.scale
        );
    }

    /**
     * ワールド行列を更新
     * @param {mat4} parentMatrix - 親のワールド行列
     */
    updateWorldMatrix(parentMatrix) {
        this.updateLocalMatrix();
        mat4.multiply(this.worldMatrix, parentMatrix, this.matrix);
    }

    /**
     * メッシュを持っているか
     * @returns {boolean}
     */
    hasMesh() {
        return this.meshIndex !== undefined;
    }

    /**
     * スキンを持っているか
     * @returns {boolean}
     */
    hasSkin() {
        return this.skinIndex !== null;
    }
}

/**
 * ノード階層を管理するクラス
 */
export class NodeHierarchy {
    /**
     * @param {Node[]} nodes - ノード配列
     * @param {number[]} rootNodes - ルートノードインデックス
     */
    constructor(nodes, rootNodes) {
        this.nodes = nodes;
        this.rootNodes = rootNodes;
    }

    /**
     * glTFから階層を構築
     * @param {Object} gltf - glTFデータ
     * @returns {NodeHierarchy}
     */
    static fromGLTF(gltf) {
        const nodes = gltf.nodes.map((nodeData, index) => 
            Node.fromGLTF(nodeData, index)
        );
        
        const scene = gltf.scenes[gltf.scene || 0];
        const rootNodes = scene.nodes || [];
        
        return new NodeHierarchy(nodes, rootNodes);
    }

    /**
     * 階層全体のワールド行列を更新
     * @param {mat4} baseTransform - ベース変換行列
     * @param {boolean} [forceUpdate=false] - 強制更新フラグ
     */
    updateWorldMatrices(baseTransform, forceUpdate = false) {
        const updateRecursive = (nodeIndex, parentMatrix) => {
            const node = this.nodes[nodeIndex];
            
            if (forceUpdate || !node.hasOriginalMatrix) {
                node.updateWorldMatrix(parentMatrix);
            } else {
                mat4.multiply(node.worldMatrix, parentMatrix, node.matrix);
            }
            
            for (const childIndex of node.children) {
                updateRecursive(childIndex, node.worldMatrix);
            }
        };
        
        for (const rootIndex of this.rootNodes) {
            updateRecursive(rootIndex, baseTransform);
        }
    }

    /**
     * メッシュを持つノードを走査
     * @param {Function} callback - コールバック(node, nodeIndex)
     */
    traverseMeshNodes(callback) {
        const traverse = (nodeIndex) => {
            const node = this.nodes[nodeIndex];
            
            if (node.hasMesh()) {
                callback(node, nodeIndex);
            }
            
            for (const childIndex of node.children) {
                traverse(childIndex);
            }
        };
        
        for (const rootIndex of this.rootNodes) {
            traverse(rootIndex);
        }
    }

    /**
     * 全ノードを走査
     * @param {Function} callback - コールバック(node, nodeIndex)
     */
    traverse(callback) {
        const traverseRecursive = (nodeIndex) => {
            const node = this.nodes[nodeIndex];
            callback(node, nodeIndex);
            
            for (const childIndex of node.children) {
                traverseRecursive(childIndex);
            }
        };
        
        for (const rootIndex of this.rootNodes) {
            traverseRecursive(rootIndex);
        }
    }

    /**
     * ノード数を取得
     * @returns {number}
     */
    get nodeCount() {
        return this.nodes.length;
    }
}
