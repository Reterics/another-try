precision highp float;

attribute vec3 position;
attribute vec2 uv;
attribute vec2 seed;
attribute float terrainHeight;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

uniform vec2 patchOrigin;
uniform float patchSize;
uniform float time;
uniform vec2 bladeHeightRange;
uniform float windIntensity;
uniform vec2 windDirection;
uniform float gustFrequency;
uniform float gustIntensity;
uniform float tipBendStrength;

varying vec2 vUv;
varying float vLighting;
varying float vHeightMix;

vec2 random2(vec2 co) {
    float x = fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453123);
    float y = fract(sin(dot(co, vec2(269.5, 183.3))) * 24634.6342361);
    return vec2(x, y);
}

void main() {
    vUv = uv;
    vec2 randomPair = random2(seed);
    vec2 localXZ = (seed - 0.5) * patchSize;
    float terrainY = terrainHeight;

    float heightFactor = mix(bladeHeightRange.x, bladeHeightRange.y, randomPair.x);
    vec3 blade = position;
    blade.y *= heightFactor;

    float heightT = clamp(blade.y / bladeHeightRange.y, 0.0, 1.0);
    vec2 windDir = normalize(vec2(windDirection.x, windDirection.y));
    float baseSway = sin(time * 0.9 + randomPair.y * 6.2831853 + blade.y * 1.5) * 0.6
        + sin(time * 1.8 + randomPair.x * 12.73 + blade.y * 2.0) * 0.35;
    float gustMask = sin(time * gustFrequency + (patchOrigin.x + localXZ.x) * 0.015 + (patchOrigin.y + localXZ.y) * 0.02);
    gustMask = clamp(gustMask, 0.0, 1.0);
    gustMask *= gustMask;
    float bendAmount = (baseSway * windIntensity + gustMask * gustIntensity) * pow(heightT, tipBendStrength);
    vec2 bendOffset = windDir * bendAmount;

    float torsion = bendAmount * 0.4;
    float facing = randomPair.x * 6.2831853;
    mat2 rotation = mat2(cos(facing), -sin(facing), sin(facing), cos(facing));
    mat2 torsionMat = mat2(cos(torsion), -sin(torsion), sin(torsion), cos(torsion));
    vec2 rotated = rotation * (torsionMat * vec2(blade.x, 0.0));

    vec3 world = vec3(
        patchOrigin.x + localXZ.x + rotated.x + bendOffset.x,
        terrainY + blade.y,
        patchOrigin.y + localXZ.y + rotated.y + bendOffset.y
    );
    vec4 worldPosition = vec4(world, 1.0);
    vec4 mvPosition = modelViewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;

    vec3 lightDir = normalize(vec3(0.35, 1.0, 0.25));
    vLighting = clamp(dot(lightDir, vec3(0.0, 1.0, 0.0)) * 0.6 + 0.4, 0.2, 1.0);
    vHeightMix = clamp(blade.y / bladeHeightRange.y, 0.0, 1.0);
}
