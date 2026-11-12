export const particleVertexShader = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aSize;
  attribute float aPhase;
  attribute float aInfluence;
  varying float vInfluence;
  varying float vPhase;
  varying float vStretch;
  void main() {
    vec3 p = position;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vInfluence = aInfluence;
    vPhase = aPhase;
    vStretch = 1.0 + uMotion * aInfluence * 0.2;
    gl_Position = projectionMatrix * mv;
    float attenuation = 10.0 / max(1.0, -mv.z);
    gl_PointSize = clamp((2.6 + aInfluence * 0.9) * aSize * attenuation * uPixelRatio * sqrt(vStretch), 1.0, 14.0);
  }
`;

export const particleFragmentShader = /* glsl */ `
  uniform vec2 uDirection;
  varying float vInfluence;
  varying float vPhase;
  varying float vStretch;
  void main() {
    vec2 uv = (gl_PointCoord - 0.5) * 2.0;
    // Normalized once per frame on the CPU, not once per fragment.
    vec2 axis = uDirection;
    vec2 perpendicular = vec2(-axis.y, axis.x);
    float along = dot(uv, axis);
    float across = dot(uv, perpendicular);
    float radius = length(vec2(along, across * vStretch));
    if (radius > 1.0) discard;
    float core = exp(-radius * radius * 17.0);
    float halo = exp(-radius * radius * 3.5) * (1.0 - smoothstep(0.65, 1.0, radius));
    float alpha = (core * 0.6 + halo * 0.4) * (0.34 + vInfluence * 0.12);
    vec3 blue = mix(vec3(0.08, 0.26, 0.95), vec3(0.12, 0.65, 1.0), 0.3 + sin(vPhase) * 0.15 + vInfluence * 0.3);
    gl_FragColor = vec4(blue, alpha);
  }
`;

// A small analytic light pattern, not a ray-traced caustics pass.
export const causticVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const causticFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uLight;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv - 0.5 - uLight * vec2(0.045, 0.025);
    float shape = exp(-dot(uv * vec2(3.2, 4.0), uv * vec2(3.2, 4.0)));
    float a = sin(uv.x * 37.0 + uv.y * 12.0 + uTime * 0.65);
    float b = cos(uv.y * 29.0 - uv.x * 15.0 - uTime * 0.45);
    float ribbons = pow(max(0.0, a * b), 4.0);
    gl_FragColor = vec4(0.18, 0.48, 1.0, shape * (0.04 + ribbons * 0.22));
  }
`;
