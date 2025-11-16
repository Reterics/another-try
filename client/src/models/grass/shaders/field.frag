precision highp float;

varying vec2 vUv;
varying float vLighting;
varying float vHeightMix;

uniform sampler2D map;
uniform sampler2D alphaMap;
uniform vec3 colorTop;
uniform vec3 colorBottom;

void main() {
    float alpha = texture2D(alphaMap, vUv).r;
    if (alpha < 0.5) {
        discard;
    }
    vec3 baseColor = texture2D(map, vUv).rgb;
    float h = clamp(vHeightMix, 0.0, 1.0);
    vec3 tint = mix(colorBottom, colorTop, h);
    float light = clamp(vLighting, 0.1, 2.0);
    vec3 finalColor = baseColor * tint * light;
    gl_FragColor = vec4(finalColor, 1.0);
}
