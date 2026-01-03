/**
 * @fileoverview スキニング（骨格アニメーション）の処理
 */

const { mat4 } = glMatrix;

/**
 * スキンデータを表すクラス
 */
export class Skin {
    /**
     * @param {number[]} joints - ジョイントノードインデックス配列
     * @param {mat4[]} inverseBindMatrices - 逆バインド行列配列
     */
    constructor(joints, inverseBindMatrices) {
        this.joints = joints;
        this.inverseBindMatrices = inverseBindMatrices;
        this.jointMatrices = joints.map(() => mat4.create());
    }

    /**
     * glTFからスキンを読み込む
     * @param {Object} skinData - glTFスキンデータ
     * @param {Function} getAccessorData - アクセサデータ取得関数
     * @returns {Skin}
     */
    static fromGLTF(skinData, getAccessorData) {
        let inverseBindMatrices;
        
        if (skinData.inverseBindMatrices !== undefined) {
            const data = getAccessorData(skinData.inverseBindMatrices);
            inverseBindMatrices = [];
            
            for (let i = 0; i < skinData.joints.length; i++) {
                inverseBindMatrices.push(
                    mat4.clone(data.subarray(i * 16, i * 16 + 16))
                );
            }
        } else {
            // 逆バインド行列がない場合は単位行列を使用
            inverseBindMatrices = skinData.joints.map(() => mat4.create());
        }
        
        return new Skin(skinData.joints, inverseBindMatrices);
    }

    /**
     * ジョイント行列を更新
     * @param {Object[]} nodes - ノード配列（worldMatrixが更新済みであること）
     */
    updateMatrices(nodes) {
        for (let i = 0; i < this.joints.length; i++) {
            const jointNode = nodes[this.joints[i]];
            mat4.multiply(
                this.jointMatrices[i],
                jointNode.worldMatrix,
                this.inverseBindMatrices[i]
            );
        }
    }

    /**
     * ジョイント行列をFloat32Arrayに変換
     * @param {number} maxJoints - 最大ジョイント数
     * @returns {Float32Array}
     */
    getMatricesArray(maxJoints) {
        const data = new Float32Array(maxJoints * 16);
        const numJoints = Math.min(this.jointMatrices.length, maxJoints);
        
        for (let i = 0; i < numJoints; i++) {
            data.set(this.jointMatrices[i], i * 16);
        }
        
        return data;
    }

    /**
     * ジョイント数を取得
     * @returns {number}
     */
    get jointCount() {
        return this.joints.length;
    }
}

/**
 * 複数のスキンを管理するクラス
 */
export class SkinManager {
    constructor() {
        this.skins = [];
    }

    /**
     * スキンを追加
     * @param {Skin} skin
     * @returns {number} スキンのインデックス
     */
    add(skin) {
        this.skins.push(skin);
        return this.skins.length - 1;
    }

    /**
     * インデックスでスキンを取得
     * @param {number} index
     * @returns {Skin|null}
     */
    get(index) {
        return this.skins[index] || null;
    }

    /**
     * 全スキンのジョイント行列を更新
     * @param {Object[]} nodes - ノード配列
     */
    updateAll(nodes) {
        for (const skin of this.skins) {
            skin.updateMatrices(nodes);
        }
    }

    /**
     * スキン数を取得
     * @returns {number}
     */
    get count() {
        return this.skins.length;
    }
}
