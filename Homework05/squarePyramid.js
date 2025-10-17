/*-----------------------------------------------------------------------------
SquarePyramid

2) 사각뿔 bottom face의 size는 dx = dz = 1 이며, bottom rectangle의 중심부터 꼭짓점까지의 높이도 1임
3) 사각뿔 bottom face는 xz plane위에 있으며 (y =0), 그 center는 (0,0) 임

attrib locations (셰이더와 일치):
  0: position(vec3), 1: normal(vec3), 2: color(vec4), 3: texCoord(vec2)
-----------------------------------------------------------------------------*/

export class SquarePyramid {
    constructor(gl, options = {}) {
      this.gl = gl;
  
      this.vao = gl.createVertexArray();
      this.vbo = gl.createBuffer();
      this.ebo = gl.createBuffer();
  
      // ----- 기하(좌표) 정의 -----
      const b0 = [ 0.5, 0.0,  0.5]; // front-right
      const b1 = [-0.5, 0.0,  0.5]; // front-left
      const b2 = [-0.5, 0.0, -0.5]; // back-left
      const b3 = [ 0.5, 0.0, -0.5]; // back-right
      const A  = [ 0.0, 1.0,  0.0]; // apex (height 1)
  
      // 삼각형 6개(사이드4 + 바닥2), flat shading을 위해 정점 중복
      const tri = [
        // sides (CCW: 외부에서 볼 때 반시계)
        ...b0, ...b1, ...A,      // front
        ...b3, ...b0, ...A,      // right
        ...b2, ...b3, ...A,      // back
        ...b1, ...b2, ...A,      // left
        // base (외부는 아래 방향: -Y) → (b0,b1,b2), (b0,b2,b3)
        ...b0, ...b1, ...b2,
        ...b0, ...b2, ...b3,
      ];
      this.vertices = new Float32Array(tri);
  
      // ----- 법선(삼각형별 평면 법선 계산) -----
      const normals = [];
      for (let i = 0; i < this.vertices.length; i += 9) {
        const p0 = this.vertices.slice(i, i + 3);
        const p1 = this.vertices.slice(i + 3, i + 6);
        const p2 = this.vertices.slice(i + 6, i + 9);
        const n = faceNormal(p0, p1, p2); // 단위벡터
        // flat → 같은 법선을 정점 3개에 복사
        normals.push(...n, ...n, ...n);
      }
      this.normals = new Float32Array(normals);
  
      // ----- 색상 -----
      // options.color 가 있으면 전체 동일 색, 없으면 면별로 구분
      if (options.color) {
        const c = [];
        for (let v = 0; v < 18; v++) c.push(options.color[0], options.color[1], options.color[2], options.color[3]);
        this.colors = new Float32Array(c);
      } else {
        // front red, right yellow, back magenta, left cyan, base blue(두 삼각형)
        const C = {
          red:     [1,0,0,1],
          yellow:  [1,1,0,1],
          magenta: [1,0,1,1],
          cyan:    [0,1,1,1],
          blue:    [0,0,1,1],
        };
        const faceColors = [
          C.red, C.yellow, C.magenta, C.cyan, C.blue, C.blue
        ];
        const arr = [];
        for (const col of faceColors) for (let k = 0; k < 3; k++) arr.push(...col);
        this.colors = new Float32Array(arr);
      }
  
      // ----- 텍스처 좌표(임의의 간단 매핑) -----
      // 사이드 삼각형은 (1,1),(0,1),(0.5,0), 바닥은 정사각형을 두 삼각형으로 분할
      const tcSide = [1,1, 0,1, 0.5,0];
      const tcBase1 = [1,1, 0,1, 0,0];
      const tcBase2 = [1,1, 0,0, 1,0];
      this.texCoords = new Float32Array([
        ...tcSide, ...tcSide, ...tcSide, ...tcSide,
        ...tcBase1, ...tcBase2
      ]);
  
      // ----- 인덱스 (0..17) -----
      this.indices = new Uint16Array([
        0,1,2,   3,4,5,   6,7,8,   9,10,11,   12,13,14,   15,16,17
      ]);
  
      this.initBuffers();
    }
  
    initBuffers() {
      const gl = this.gl;
  
      const vSize = this.vertices.byteLength;
      const nSize = this.normals.byteLength;
      const cSize = this.colors.byteLength;
      const tSize = this.texCoords.byteLength;
      const total = vSize + nSize + cSize + tSize;
  
      gl.bindVertexArray(this.vao);
  
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, total, gl.STATIC_DRAW);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices);
      gl.bufferSubData(gl.ARRAY_BUFFER, vSize, this.normals);
      gl.bufferSubData(gl.ARRAY_BUFFER, vSize + nSize, this.colors);
      gl.bufferSubData(gl.ARRAY_BUFFER, vSize + nSize + cSize, this.texCoords);
  
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);
  
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
  
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, vSize);
      gl.enableVertexAttribArray(1);
  
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, vSize + nSize);
      gl.enableVertexAttribArray(2);
  
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, vSize + nSize + cSize);
      gl.enableVertexAttribArray(3);
  
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
    }
  
    draw(shader) {
      const gl = this.gl;
      shader.use();
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, 18, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    }
  
    delete() {
      const gl = this.gl;
      gl.deleteBuffer(this.vbo);
      gl.deleteBuffer(this.ebo);
      gl.deleteVertexArray(this.vao);
    }
  }
  
  // ----- 유틸: 면 법선 계산 (단위벡터) -----
  function faceNormal(p0, p1, p2) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    // u × v
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1.0;
    return [nx / len, ny / len, nz / len];
  }
  
