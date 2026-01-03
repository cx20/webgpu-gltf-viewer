/**
 * スカイボックス用シェーダー
 * キューブマップテクスチャを描画
 */

// ==================== Uniforms ====================

struct SkyboxUniforms {
    projectionMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>
};

@binding(0) @group(0) var<uniform> uniforms: SkyboxUniforms;
@binding(1) @group(0) var skyboxSampler: sampler;
@binding(2) @group(0) var skyboxTexture: texture_cube<f32>;

// ==================== Vertex Shader ====================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vTexCoord: vec3<f32>
};

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
    var output: VertexOutput;
    output.vTexCoord = position;
    
    // 深度を最大値に設定（z = w）
    let pos = uniforms.projectionMatrix * uniforms.viewMatrix * vec4<f32>(position, 1.0);
    output.position = vec4<f32>(pos.xy, pos.w, pos.w);
    
    return output;
}

// ==================== Fragment Shader ====================

@fragment
fn fs_main(@location(0) vTexCoord: vec3<f32>) -> @location(0) vec4<f32> {
    return textureSample(skyboxTexture, skyboxSampler, vTexCoord);
}
