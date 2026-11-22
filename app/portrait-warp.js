const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  uv = vec2(0.5 + position.x * 0.5, 0.5 - position.y * 0.5);
}`;

const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D portrait;
uniform sampler2D features;
uniform vec4 movement;
void main() {
  vec2 pivot = vec2(0.715, 0.43);
  vec2 head = (uv - vec2(0.71, 0.325)) / vec2(0.385, 0.50);
  float weight = 1.0 - smoothstep(0.49, 1.0, length(head));
  vec2 relative = uv - pivot;
  float roll = -movement.z * weight;
  float sine = sin(roll);
  float cosine = cos(roll);
  vec2 rotated = vec2(cosine * relative.x - sine * relative.y,
                      sine * relative.x + cosine * relative.y);
  vec2 turn = vec2(movement.w * (0.023 + relative.x * 0.13),
                   movement.w * relative.x * 0.045);
  vec2 source = clamp(pivot + rotated - (movement.xy + turn) * weight, 0.0, 1.0);
  vec4 base = texture2D(portrait, source);
  vec4 overlay = texture2D(features, source);
  gl_FragColor = vec4(mix(base.rgb, overlay.rgb, overlay.a), 1.0);
}`;

function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function texture(gl, unit) {
  const result = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, result);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return result;
}

export function createPortraitWarp(canvas) {
  const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  gl.useProgram(program);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const points = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, points);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const portrait = texture(gl, 0);
  const features = texture(gl, 1);
  gl.uniform1i(gl.getUniformLocation(program, 'portrait'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'features'), 1);
  const movement = gl.getUniformLocation(program, 'movement');
  let imageReady = false;
  let featuresReady = false;

  return {
    draw(image, overlay, changed, x, y, roll, yaw) {
      if (gl.isContextLost()) return false;
      if (!imageReady) {
        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        imageReady = true;
      }
      if (changed || !featuresReady) {
        gl.activeTexture(gl.TEXTURE1);
        if (featuresReady) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, overlay);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlay);
        featuresReady = true;
      }
      gl.uniform4f(movement, x, y, roll, yaw);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },
    dispose() {
      gl.deleteTexture(portrait);
      gl.deleteTexture(features);
      gl.deleteBuffer(points);
      gl.deleteProgram(program);
    }
  };
}
