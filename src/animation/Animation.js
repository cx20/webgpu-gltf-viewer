/**
 * @fileoverview アニメーションデータの管理と更新
 */

const { vec3, quat } = glMatrix;

/**
 * 単一のアニメーションを表すクラス
 */
export class Animation {
    /**
     * @param {string} name - アニメーション名
     * @param {AnimationChannel[]} channels - アニメーションチャンネル
     * @param {number} duration - アニメーションの長さ（秒）
     */
    constructor(name, channels, duration) {
        this.name = name;
        this.channels = channels;
        this.duration = duration;
    }

    /**
     * glTFからアニメーションを読み込む
     * @param {Object} animData - glTFアニメーションデータ
     * @param {Function} getAccessorData - アクセサデータ取得関数
     * @returns {Animation}
     */
    static fromGLTF(animData, getAccessorData) {
        const channels = animData.channels.map(channel => {
            const sampler = animData.samplers[channel.sampler];
            return new AnimationChannel(
                channel.target.node,
                channel.target.path,
                getAccessorData(sampler.input),
                getAccessorData(sampler.output),
                sampler.interpolation || 'LINEAR'
            );
        });
        
        // 最大時間を計算
        let maxTime = 0;
        channels.forEach(ch => {
            if (ch.times.length > 0) {
                maxTime = Math.max(maxTime, ch.times[ch.times.length - 1]);
            }
        });
        
        return new Animation(animData.name || 'Unnamed', channels, maxTime);
    }

    /**
     * アニメーションを更新
     * @param {Object[]} nodes - ノード配列
     * @param {number} time - 現在時刻（秒）
     */
    update(nodes, time) {
        const t = time % this.duration;
        
        for (const channel of this.channels) {
            const node = nodes[channel.targetNode];
            if (!node) continue;
            
            channel.apply(node, t);
        }
    }
}

/**
 * アニメーションチャンネル（単一のプロパティアニメーション）
 */
export class AnimationChannel {
    /**
     * @param {number} targetNode - ターゲットノードインデックス
     * @param {string} targetPath - ターゲットプロパティ（translation/rotation/scale）
     * @param {Float32Array} times - キーフレーム時刻
     * @param {Float32Array} values - キーフレーム値
     * @param {string} interpolation - 補間方法
     */
    constructor(targetNode, targetPath, times, values, interpolation) {
        this.targetNode = targetNode;
        this.targetPath = targetPath;
        this.times = times;
        this.values = values;
        this.interpolation = interpolation;
    }

    /**
     * 指定時刻の値をノードに適用
     * @param {Object} node - ターゲットノード
     * @param {number} t - 時刻
     */
    apply(node, t) {
        const { prevIndex, nextIndex, factor } = this._findKeyframes(t);
        
        switch (this.targetPath) {
            case 'rotation':
                this._applyRotation(node, prevIndex, nextIndex, factor);
                break;
            case 'translation':
                this._applyTranslation(node, prevIndex, nextIndex, factor);
                break;
            case 'scale':
                this._applyScale(node, prevIndex, nextIndex, factor);
                break;
        }
    }

    /**
     * 補間用のキーフレームを検索
     * @param {number} t - 時刻
     * @returns {Object} prevIndex, nextIndex, factor
     * @private
     */
    _findKeyframes(t) {
        const times = this.times;
        
        if (times.length === 0) {
            return { prevIndex: 0, nextIndex: 0, factor: 0 };
        }
        
        // エッジケース処理
        if (t <= times[0]) {
            return { prevIndex: 0, nextIndex: 0, factor: 0 };
        }
        if (t >= times[times.length - 1]) {
            const last = times.length - 1;
            return { prevIndex: last, nextIndex: last, factor: 0 };
        }
        
        // 二分探索的にキーフレームを検索
        for (let i = 0; i < times.length - 1; i++) {
            if (t >= times[i] && t < times[i + 1]) {
                const startTime = times[i];
                const endTime = times[i + 1];
                const factor = (t - startTime) / (endTime - startTime);
                return { prevIndex: i, nextIndex: i + 1, factor };
            }
        }
        
        return { prevIndex: 0, nextIndex: 0, factor: 0 };
    }

    /**
     * 回転を適用（球面線形補間）
     * @private
     */
    _applyRotation(node, prevIndex, nextIndex, factor) {
        const prev = this.values.subarray(prevIndex * 4, prevIndex * 4 + 4);
        const next = this.values.subarray(nextIndex * 4, nextIndex * 4 + 4);
        quat.slerp(node.rotation, prev, next, factor);
    }

    /**
     * 移動を適用（線形補間）
     * @private
     */
    _applyTranslation(node, prevIndex, nextIndex, factor) {
        const prev = this.values.subarray(prevIndex * 3, prevIndex * 3 + 3);
        const next = this.values.subarray(nextIndex * 3, nextIndex * 3 + 3);
        vec3.lerp(node.translation, prev, next, factor);
    }

    /**
     * スケールを適用（線形補間）
     * @private
     */
    _applyScale(node, prevIndex, nextIndex, factor) {
        const prev = this.values.subarray(prevIndex * 3, prevIndex * 3 + 3);
        const next = this.values.subarray(nextIndex * 3, nextIndex * 3 + 3);
        vec3.lerp(node.scale, prev, next, factor);
    }
}

/**
 * アニメーションシステム
 * 複数のアニメーションを管理
 */
export class AnimationSystem {
    constructor() {
        this.animations = [];
        this.currentAnimation = null;
    }

    /**
     * アニメーションを追加
     * @param {Animation} animation
     */
    add(animation) {
        this.animations.push(animation);
    }

    /**
     * 名前でアニメーションを検索
     * @param {string} name
     * @returns {Animation|null}
     */
    findByName(name) {
        return this.animations.find(a => a.name === name) || null;
    }

    /**
     * 現在のアニメーションを設定
     * @param {Animation|string} animation - アニメーションまたは名前
     */
    setCurrent(animation) {
        if (typeof animation === 'string') {
            this.currentAnimation = this.findByName(animation);
        } else {
            this.currentAnimation = animation;
        }
    }

    /**
     * 優先アニメーションまたは最初のアニメーションを設定
     * @param {string} [preferredName] - 優先するアニメーション名
     */
    setDefaultAnimation(preferredName) {
        if (preferredName) {
            const preferred = this.findByName(preferredName);
            if (preferred) {
                this.currentAnimation = preferred;
                return;
            }
        }
        
        if (this.animations.length > 0) {
            this.currentAnimation = this.animations[0];
        }
    }

    /**
     * 現在のアニメーションを更新
     * @param {Object[]} nodes - ノード配列
     * @param {number} time - 時刻
     */
    update(nodes, time) {
        if (this.currentAnimation) {
            this.currentAnimation.update(nodes, time);
        }
    }
}
