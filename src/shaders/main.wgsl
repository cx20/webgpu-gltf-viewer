/**
 * メインレンダリング用シェーダー
 * スキニングアニメーション対応 + PBR マテリアル
 */

// ==================== Uniforms ====================

struct Uniforms {
    modelMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    lightDir: vec4<f32>,
    baseColor: vec4<f32>,
    flags: vec4<u32>,  // x: hasSkinning, y: hasTexture, z: hasNormals, w: hasMetallicRoughnessTexture
    metallicFactor: f32,
    roughnessFactor: f32,
    normalScale: f32,
    hasNormalTexture: u32,
    emissiveFactor: vec4<f32>,
    hasEmissiveTexture: u32,
    padding2: vec3<u32>
};

struct JointMatrices {
    matrices: array<mat4x4<f32>, 180>
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@binding(1) @group(0) var<storage, read> jointMatrices: JointMatrices;
@binding(2) @group(0) var texSampler: sampler;
@binding(3) @group(0) var texTexture: texture_2d<f32>;
@binding(4) @group(0) var metallicRoughnessTexture: texture_2d<f32>;
@binding(5) @group(0) var normalTexture: texture_2d<f32>;
@binding(6) @group(0) var envTexture: texture_2d<f32>;
@binding(7) @group(0) var emissiveTexture: texture_2d<f32>;

// ==================== Vertex Shader ====================

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) texCoord: vec2<f32>,
    @location(3) joints: vec4<u32>,
    @location(4) weights: vec4<f32>
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vNormal: vec3<f32>,
    @location(1) vTexCoord: vec2<f32>,
    @location(2) vPosition: vec3<f32>,
    @location(3) vWorldPosition: vec3<f32>,
    @location(4) vViewDir: vec3<f32>,
    @location(5) vTangent: vec3<f32>,
    @location(6) vBitangent: vec3<f32>
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    var position = vec4<f32>(input.position, 1.0);
    var normal = input.normal;
    
    // スキニング適用
    if (uniforms.flags.x == 1u) {
        let skinMatrix = 
            input.weights.x * jointMatrices.matrices[input.joints.x] +
            input.weights.y * jointMatrices.matrices[input.joints.y] +
            input.weights.z * jointMatrices.matrices[input.joints.z] +
            input.weights.w * jointMatrices.matrices[input.joints.w];
        
        position = skinMatrix * position;
        normal = (skinMatrix * vec4<f32>(normal, 0.0)).xyz;
    }
    
    // ワールド座標変換
    let worldPosition = uniforms.modelMatrix * position;
    output.vPosition = worldPosition.xyz;
    output.vWorldPosition = worldPosition.xyz;
    output.vNormal = (uniforms.normalMatrix * vec4<f32>(normal, 0.0)).xyz;
    output.vTexCoord = input.texCoord;
    
    // カメラ方向を計算（ビュー行列の逆変換でカメラ位置を取得）
    let invView = mat4x4<f32>(
        vec4<f32>(uniforms.viewMatrix[0][0], uniforms.viewMatrix[1][0], uniforms.viewMatrix[2][0], 0.0),
        vec4<f32>(uniforms.viewMatrix[0][1], uniforms.viewMatrix[1][1], uniforms.viewMatrix[2][1], 0.0),
        vec4<f32>(uniforms.viewMatrix[0][2], uniforms.viewMatrix[1][2], uniforms.viewMatrix[2][2], 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
    let cameraPos = -(invView * vec4<f32>(uniforms.viewMatrix[3][0], uniforms.viewMatrix[3][1], uniforms.viewMatrix[3][2], 0.0)).xyz;
    output.vViewDir = normalize(cameraPos - worldPosition.xyz);
    
    // タンジェント空間の計算（法線マップ用）
    let edge1 = vec3<f32>(1.0, 0.0, 0.0);
    let edge2 = vec3<f32>(0.0, 1.0, 0.0);
    let deltaUV1 = vec2<f32>(1.0, 0.0);
    let deltaUV2 = vec2<f32>(0.0, 1.0);
    
    let f = 1.0 / (deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y);
    var tangent = vec3<f32>(
        f * (deltaUV2.y * edge1.x - deltaUV1.y * edge2.x),
        f * (deltaUV2.y * edge1.y - deltaUV1.y * edge2.y),
        f * (deltaUV2.y * edge1.z - deltaUV1.y * edge2.z)
    );
    tangent = normalize((uniforms.normalMatrix * vec4<f32>(tangent, 0.0)).xyz);
    
    let bitangent = normalize(cross(output.vNormal, tangent));
    output.vTangent = tangent;
    output.vBitangent = bitangent;
    
    // MVP変換
    output.position = uniforms.projectionMatrix * uniforms.viewMatrix * worldPosition;
    
    return output;
}

// ==================== Fragment Shader ====================

const PI: f32 = 3.14159265359;

// フレネル項（Schlick近似）
fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (vec3<f32>(1.0) - F0) * pow(1.0 - cosTheta, 5.0);
}

// 法線分布関数 (GGX/Trowbridge-Reitz)
fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH = max(dot(N, H), 0.0);
    let NdotH2 = NdotH * NdotH;
    
    let denom = (NdotH2 * (a2 - 1.0) + 1.0);
    return a2 / (PI * denom * denom);
}

// 幾何学減衰関数 (Smith's Schlick-GGX)
fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    let ggx1 = geometrySchlickGGX(NdotV, roughness);
    let ggx2 = geometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

// latlong テクスチャをサンプリング
fn sampleEnvironment(direction: vec3<f32>) -> vec3<f32> {
    let phi = atan2(direction.z, direction.x);
    let theta = acos(clamp(direction.y, -1.0, 1.0));
    
    let u = (phi + PI) / (2.0 * PI);
    let v = theta / PI;
    
    let color = textureSample(envTexture, texSampler, vec2<f32>(u, v));
    return color.rgb;
}

// IBL 拡散反射の推定
fn getIBLDiffuse(normal: vec3<f32>) -> vec3<f32> {
    var irradiance = vec3<f32>(0.0);
    let sampleCount: u32 = 16u;
    
    for (var i = 0u; i < 4u; i = i + 1u) {
        for (var j = 0u; j < 4u; j = j + 1u) {
            let phi = (f32(i) + 0.5) * (2.0 * PI / 4.0);
            let theta = (f32(j) + 0.5) * (PI / 4.0);
            
            let sampleDir = vec3<f32>(
                sin(theta) * cos(phi),
                cos(theta),
                sin(theta) * sin(phi)
            );
            
            let NdotL = max(dot(normal, sampleDir), 0.0);
            irradiance += sampleEnvironment(sampleDir) * NdotL;
        }
    }
    
    return irradiance / vec3<f32>(f32(sampleCount));
}

// IBL 鏡面反射の計算
fn getIBLSpecular(normal: vec3<f32>, viewDir: vec3<f32>, roughness: f32, metallic: f32, baseColor: vec3<f32>) -> vec3<f32> {
    let reflectDir = normalize(reflect(-viewDir, normal));
    
    let sampleCount: u32 = 8u;
    let step = roughness * 0.5;
    var specular = vec3<f32>(0.0);
    
    for (var i = 0u; i < sampleCount; i = i + 1u) {
        let angle = f32(i) * (PI / f32(sampleCount));
        let x = cos(angle) * step;
        let y = sin(angle) * step;
        
        let sampleDir = normalize(reflectDir + vec3<f32>(x, y, 0.0));
        specular += sampleEnvironment(sampleDir);
    }
    
    specular /= vec3<f32>(f32(sampleCount));
    
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, baseColor, metallic);
    let F = fresnelSchlick(max(dot(normal, viewDir), 0.0), F0);
    
    return specular * F;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var normal: vec3<f32>;
    
    // 法線の計算
    if (uniforms.flags.z == 1u) {
        normal = normalize(input.vNormal);
    } else {
        let ddx = dpdx(input.vWorldPosition);
        let ddy = dpdy(input.vWorldPosition);
        normal = normalize(cross(ddx, ddy));
    }
    
    // 法線マップ適用
    if (uniforms.hasNormalTexture == 1u) {
        let normalMap = textureSample(normalTexture, texSampler, input.vTexCoord).xyz;
        // [0, 1] -> [-1, 1]
        let tangentNormal = normalMap * 2.0 - 1.0;
        // スケール適用
        let scaledNormal = vec3<f32>(tangentNormal.xy * uniforms.normalScale, tangentNormal.z);
        // タンジェント空間からワールド空間へ変換
        let T = normalize(input.vTangent);
        let B = normalize(input.vBitangent);
        let N = normalize(normal);
        let TBN = mat3x3<f32>(T, B, N);
        normal = normalize(TBN * scaledNormal);
    }
    
    // ベースカラー取得
    var baseColor: vec4<f32>;
    if (uniforms.flags.y == 1u) {
        baseColor = textureSample(texTexture, texSampler, input.vTexCoord);
    } else {
        baseColor = uniforms.baseColor;
    }

    // Emissive
    var emissive = uniforms.emissiveFactor.rgb;
    if (uniforms.hasEmissiveTexture == 1u) {
        emissive *= textureSample(emissiveTexture, texSampler, input.vTexCoord).rgb;
    }
    
    // Metallic/Roughness取得
    var metallic: f32;
    var roughness: f32;
    
    if (uniforms.flags.w == 1u) {
        // glTF 2.0では、G=roughness, B=metallic
        let mr = textureSample(metallicRoughnessTexture, texSampler, input.vTexCoord);
        roughness = mr.g * uniforms.roughnessFactor;
        metallic = mr.b * uniforms.metallicFactor;
    } else {
        metallic = uniforms.metallicFactor;
        roughness = uniforms.roughnessFactor;
    }
    
    // PBR計算
    let V = normalize(input.vViewDir);
    let L = normalize(uniforms.lightDir.xyz);
    let H = normalize(V + L);
    let N = normal;
    
    // F0の計算（誘電体は0.04、金属はベースカラー）
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, baseColor.rgb, metallic);
    
    // Cook-Torrance BRDF
    let NDF = distributionGGX(N, H, roughness);
    let G = geometrySmith(N, V, L, roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);
    
    let NdotL = max(dot(N, L), 0.0);
    let NdotV = max(dot(N, V), 0.0);
    
    // スペキュラー項
    let numerator = NDF * G * F;
    let denominator = 4.0 * NdotV * NdotL + 0.0001;
    let specular = numerator / denominator;
    
    // 拡散反射項（kD）
    let kS = F;
    var kD = vec3<f32>(1.0) - kS;
    kD *= 1.0 - metallic; // 金属は拡散反射なし
    
    let diffuse = kD * baseColor.rgb / PI;
    
    // 環境光
    let ambient = vec3<f32>(0.15) * baseColor.rgb;
    
    // 最終的な放射輝度
    // 直接光のみで描画（IBL一時的に無効化）
    var Lo = (diffuse + specular) * NdotL * vec3<f32>(2.0); // 直接光
    Lo += ambient;
    Lo += emissive;
    
    // ガンマ補正とトーンマッピング
    var finalColor = Lo / (Lo + vec3<f32>(1.5)); // Reinhardトーンマッピング（早めに昇法）
    finalColor = pow(finalColor, vec3<f32>(1.0 / 2.2));
    
    return vec4<f32>(finalColor, baseColor.a);
}
