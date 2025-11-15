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
    if (alpha < 0.2) {
        discard;
    }
    vec3 baseColor = texture2D(map, vUv).rgb;
    vec3 tint = mix(colorBottom, colorTop, vHeightMix);
    vec3 finalColor = baseColor * tint * vLighting;
    gl_FragColor = vec4(finalColor, alpha);
}
