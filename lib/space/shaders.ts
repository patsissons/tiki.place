/** GLSL for the space backdrop. Colours are raw sRGB in and out; nothing is colour-managed. */

export const STAR_VERTEX = /* glsl */ `
  attribute float aMag;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uIntensity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Flux relative to magnitude 0; sizes grow slowly, alpha carries most of the dynamic range.
    float f = pow(10.0, -0.4 * aMag);
    float px = clamp(3.0 + 3.2 * log2(1.0 + f * 10.0), 3.0, 18.0);
    gl_PointSize = px * uPixelRatio;
    vColor = aColor;
    vAlpha = clamp(0.3 + 0.7 * sqrt(min(f * 3.0, 1.0)), 0.0, 1.0) * uIntensity;
  }
`;

export const STAR_FRAGMENT = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = (smoothstep(1.0, 0.3, d) * 0.7 + smoothstep(0.45, 0.0, d) * 0.9) * vAlpha;
    a = min(a, 1.0);
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/** Full-screen triangle; the far-plane world position is affine in NDC, so interpolating it is exact. */
export const SKY_VERTEX = /* glsl */ `
  uniform mat4 uInvViewProj;
  varying vec3 vDir;
  void main() {
    vec4 world = uInvViewProj * vec4(position.xy, 1.0, 1.0);
    vDir = world.xyz / world.w;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

/**
 * Samples an equirectangular map in J2000 equatorial coordinates, centred on
 * RA 0h with RA increasing to the left (the view from inside the sphere).
 */
export const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uIntensity;
  uniform float uRaFlip;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 d = normalize(vDir);
    float ra = atan(d.y, d.x);
    float dec = asin(clamp(d.z, -1.0, 1.0));
    vec2 uv = vec2(fract(0.5 - uRaFlip * ra / (2.0 * PI)), 0.5 + dec / PI);
    vec3 c = texture2D(uMap, uv).rgb;
    // Ordered-ish dither breaks the banding that a magnified 8-bit sky would otherwise show.
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * (2.0 / 255.0);
    gl_FragColor = vec4(max(c, 0.0) * uIntensity, 1.0);
  }
`;

export const BODY_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Lambert disc lit from the body's own sun direction, with a soft terminator and faint ambient. */
export const BODY_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uToSun;
  uniform vec3 uColor;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uAmbient;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vNormal);
    float cosine = dot(n, uToSun);
    vec3 albedo = mix(uColor, texture2D(uMap, vUv).rgb, uHasMap);
    float lit = smoothstep(-0.03, 0.15, cosine) * (0.3 + 0.7 * max(cosine, 0.0));
    gl_FragColor = vec4(albedo * (uAmbient + (1.0 - uAmbient) * lit), 1.0);
  }
`;
