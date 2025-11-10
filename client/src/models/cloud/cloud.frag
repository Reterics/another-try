precision highp float;

varying vec3 vWorldPosition;

uniform vec3 uSunDirection;
uniform vec3 uSkyBottomColor;
uniform vec3 uSkyTopColor;
uniform vec3 uCloudBaseColor;
uniform vec3 uCloudHighlightColor;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform vec3 uWindDirection;
uniform float uWindSpeed;
uniform float uTime;
uniform float uCoverage;
uniform float uDensity;
uniform float uNoiseScale;
uniform float uDetailScale;
uniform float uDetailStrength;
uniform float uPrimarySteps;
uniform float uShadowSteps;
uniform float uLightAbsorption;
uniform float uAnvilBias;
uniform mat4 uInverseModelMatrix;
uniform float uEdgeFade;

const int MAX_PRIMARY_STEPS = 96;
const int MAX_SHADOW_STEPS = 24;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

vec3 saturate(vec3 value) {
    return clamp(value, vec3(0.0), vec3(1.0));
}

vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute( permute( permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1),
                            dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3) ) );
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * snoise(p);
        p = p * 2.04 + 17.5;
        amplitude *= 0.5;
    }
    return value;
}

float horizonFade(vec3 p) {
    vec3 size = uBoundsMax - uBoundsMin;
    vec3 local01 = saturate((p - uBoundsMin) / size);
    float longest = max(size.x, size.z);
    float pad = clamp(uEdgeFade / longest, 0.001, 0.25);
    float fadeX = smoothstep(0.0, pad, local01.x) * (1.0 - smoothstep(1.0 - pad, 1.0, local01.x));
    float fadeZ = smoothstep(0.0, pad, local01.z) * (1.0 - smoothstep(1.0 - pad, 1.0, local01.z));
    return fadeX * fadeZ;
}

vec2 intersectBox(vec3 bMin, vec3 bMax, vec3 origin, vec3 dir) {
    vec3 invDir = sign(dir) / (abs(dir) + 0.0005);
    vec3 t0s = (bMin - origin) * invDir;
    vec3 t1s = (bMax - origin) * invDir;
    vec3 tsmaller = min(t0s, t1s);
    vec3 tbigger = max(t0s, t1s);

    float tNear = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
    float tFar = min(min(tbigger.x, tbigger.y), tbigger.z);

    return vec2(tNear, tFar);
}

bool insideBounds(vec3 p) {
    return all(greaterThanEqual(p, uBoundsMin)) && all(lessThanEqual(p, uBoundsMax));
}

float densitySample(vec3 p) {
    vec3 wind = normalize(uWindDirection);
    vec3 flowOffset = wind * (uTime * uWindSpeed);
    vec3 noiseSample = (p + flowOffset) * uNoiseScale;

    float baseShape = fbm(noiseSample);
    float detailShape = fbm(noiseSample * uDetailScale + vec3(0.0, uTime * 0.03, 0.0));
    float coverage = baseShape + detailShape * 0.35 - (1.0 - uCoverage);
    coverage = saturate(coverage);

    float height01 = saturate((p.y - uBoundsMin.y) / (uBoundsMax.y - uBoundsMin.y));
    float baseMask = smoothstep(0.02, 0.25, height01) * (1.0 - smoothstep(0.7, 1.0, height01));
    float anvil = pow(saturate((height01 - 0.65) * 2.4), 1.6) * uAnvilBias;
    float shapeMask = saturate(baseMask + anvil);

    float detailMix = mix(coverage, coverage * detailShape, uDetailStrength);
    float density = saturate(detailMix) * shapeMask * horizonFade(p);
    return density;
}

float shadowMarch(vec3 origin, vec3 lightDir) {
    float steps = max(uShadowSteps, 1.0);
    float stepLength = (uBoundsMax.y - uBoundsMin.y) / steps;
    float accumulated = 0.0;
    vec3 position = origin;

    for (int i = 0; i < MAX_SHADOW_STEPS; i++) {
        if (float(i) >= uShadowSteps) {
            break;
        }
        position += lightDir * stepLength;
        if (!insideBounds(position)) {
            break;
        }
        accumulated += densitySample(position) * uLightAbsorption;
        if (accumulated > 1.5) {
            break;
        }
    }

    return exp(-accumulated);
}

vec3 getSkyColor(vec3 dir) {
    float factor = saturate(dir.y * 0.5 + 0.5);
    return mix(uSkyBottomColor, uSkyTopColor, factor);
}

void main() {
    vec3 rayDirWorld = normalize(vWorldPosition - cameraPosition);

    vec4 localOrigin4 = uInverseModelMatrix * vec4(cameraPosition, 1.0);
    vec4 localDir4 = uInverseModelMatrix * vec4(rayDirWorld, 0.0);
    vec3 rayOrigin = localOrigin4.xyz;
    vec3 rayDir = normalize(localDir4.xyz);

    vec2 hit = intersectBox(uBoundsMin, uBoundsMax, rayOrigin, rayDir);
    float nearT = hit.x;
    float farT = hit.y;
    if (farT <= max(nearT, 0.0)) {
        discard;
    }

    float start = max(nearT, 0.0);
    float totalDistance = farT - start;
    float steps = max(uPrimarySteps, 1.0);
    float stepSize = totalDistance / steps;
    if (stepSize <= 0.0) {
        discard;
    }

    vec3 lightDirWorld = normalize(uSunDirection);
    vec3 lightDirLocal = normalize((uInverseModelMatrix * vec4(lightDirWorld, 0.0)).xyz);

    vec3 accumulatedColor = vec3(0.0);
    float transmittance = 1.0;
    vec3 samplePosition = rayOrigin + rayDir * (start + stepSize * 0.5);

    for (int i = 0; i < MAX_PRIMARY_STEPS; i++) {
        if (float(i) >= uPrimarySteps) {
            break;
        }
        if (transmittance <= 0.01) {
            break;
        }

        float density = densitySample(samplePosition);
        if (density > 0.001) {
            float height01 = saturate((samplePosition.y - uBoundsMin.y) / (uBoundsMax.y - uBoundsMin.y));
            vec3 cloudColor = mix(uCloudBaseColor, uCloudHighlightColor, pow(height01, 0.65));
            float shadow = shadowMarch(samplePosition, lightDirLocal);
            float phase = 0.45 + 0.55 * pow(max(dot(rayDirWorld, lightDirWorld), 0.0), 3.0);
            float lighting = mix(0.35, 1.0, shadow) * phase;

            float alpha = 1.0 - exp(-density * uDensity * stepSize * 0.45);
            alpha = saturate(alpha);
            vec3 contribution = cloudColor * lighting * alpha;
            accumulatedColor += transmittance * contribution;
            transmittance *= (1.0 - alpha);
        }

        samplePosition += rayDir * stepSize;
    }

    vec3 sky = getSkyColor(rayDirWorld);
    vec3 color = accumulatedColor + sky * transmittance;
    float alpha = 1.0 - transmittance;

    if (alpha <= 0.005) {
        discard;
    }

    gl_FragColor = vec4(color, alpha);
}
