import { resizeAspectRatio, setupText, updateText, Axes } from '../util/util.js';
import { Shader, readShaderFile } from '../util/shader.js';

let isInitialized = false;
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
let shader;
let vaoBlade;
let vaoPillar;
let M, M1, M2; // 큰 날개, 작은 날개1,2
let startTime = 0;
let elapsedTime;

document.addEventListener('DOMContentLoaded', () => {
    if (isInitialized) {
        console.log("Already initialized");
        return;
    }

    main().then(success => {
        if (!success) {
            console.log('프로그램을 종료합니다.');
            return;
        }
        isInitialized = true;
        requestAnimationFrame(animate);
    }).catch(error => {
        console.error('프로그램 실행 중 오류 발생:', error);
    });
});

function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }

    canvas.width = 700;
    canvas.height = 700;
    resizeAspectRatio(gl, canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.2, 0.3, 0.4, 1.0);
    
    return true;
}

function setupBuffers() {
    // 기둥 버퍼
    const pillarVertices = new Float32Array([
        -0.05,  -0.5,   // 기둥 꼭짓점
         0.05,  -0.5,   
         0.05,  0.5,   
        -0.05,  0.5    
    ]);

    const indices = new Uint16Array([
        0, 1, 2,    // 첫 번째 삼각형
        0, 2, 3     // 두 번째 삼각형
    ]);

    const pillarColors = new Float32Array([
        0.6, 0.3, 0.0, 1.0, // 갈색
        0.6, 0.3, 0.0, 1.0,
        0.6, 0.3, 0.0, 1.0,
        0.6, 0.3, 0.0, 1.0
    ]);

    vaoPillar = gl.createVertexArray();
    gl.bindVertexArray(vaoPillar);

    // VBO for position
    let positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pillarVertices, gl.STATIC_DRAW);
    shader.setAttribPointer("a_position", 2, gl.FLOAT, false, 0, 0);

    // VBO for color
    let colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pillarColors, gl.STATIC_DRAW);
    shader.setAttribPointer("a_color", 4, gl.FLOAT, false, 0, 0);

    // EBO
    let indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // 날개 버퍼
    const bladeVertices = new Float32Array([
        -0.3, -0.05,   // 날개 꼭짓점
        0.3, -0.05,   
        0.3, 0.05,   
        -0.3, 0.05
    ]);

    const bladeColors = new Float32Array([
        1,1,1,1,  // 흰색
        1,1,1,1,  
        1,1,1,1,  
        1,1,1,1
    ]);

    vaoBlade = gl.createVertexArray();
    gl.bindVertexArray(vaoBlade);

    // VBO for position
    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, bladeVertices, gl.STATIC_DRAW);
    shader.setAttribPointer("a_position", 2, gl.FLOAT, false, 0, 0);

    // EBO
    indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
}

function getTransformMatrices(elapsedTime) {
    const R1 = mat4.create();
    const R2 = mat4.create();
    const S = mat4.create();
    const T = mat4.create();
    const T1 = mat4.create();
    const T2 = mat4.create();

    // 큰 날개 회전
    mat4.rotate(R1, mat4.create(), Math.sin(elapsedTime) * Math.PI * 2.0, [0, 0, 1]);

    // 작은 날개 회전
    mat4.rotate(R2, mat4.create(), Math.sin(elapsedTime) * Math.PI * -10.0, [0, 0, 1]);

    // 작은 날개 스케일
    mat4.scale(S, S, [0.25, 0.25, 1]);

    // 기둥 꼭대기로 이동
    mat4.translate(T, T, [0, 0.5, 0]);

    // 작은 날개 왼쪽 이동
    mat4.translate(T1, T1, [-0.3, 0, 0]);

    // 작은 날개 오른쪽 이동
    mat4.translate(T2, T2, [0.3, 0, 0]);

    return { R1, R2, S, T, T1, T2 };
}

function applyTransform(type,currentTime) {
    const elapsedTime = (currentTime - startTime) / 1000;
    const { R1, R2, S, T, T1, T2 } = getTransformMatrices(elapsedTime);

    // 큰 날개
    if (type === 'big') {
        mat4.identity(M);
        [R1, T].forEach(matrix => {
            mat4.multiply(M, matrix, M);
        });
    }

    // 작은 날개 1
    else if (type === 'small1') {
        mat4.identity(M1);
        [S, R2, T1, R1, T].forEach(matrix => {
            mat4.multiply(M1, matrix, M1);
        });
    }

    // 작은 날개 2
    else if (type === 'small2') {
        mat4.identity(M2);
        [S, R2, T2, R1, T].forEach(matrix => {
            mat4.multiply(M2, matrix, M2);
        });
    }
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    shader.use();
    // 기둥 그리기
    gl.bindVertexArray(vaoPillar);
    shader.setMat4("u_transform", mat4.create());
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    // 날개 그리기
    gl.bindVertexArray(vaoBlade);
    // 큰 날개
    setColor([1.0, 1.0, 1.0, 1.0]);
    shader.setMat4("u_transform", M);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    // 작은 날개
    setColor([0.6, 0.6, 0.6, 1.0]);
    shader.setMat4("u_transform", M1);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    shader.setMat4("u_transform", M2);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

function setColor(color) {
    const colors = new Float32Array([
        ...color, ...color, ...color, ...color
    ]);
    const cbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    shader.setAttribPointer("a_color", 4, gl.FLOAT, false, 0, 0);
}

function animate(currentTime) {
    elapsedTime = (currentTime - startTime) / 1000;
    applyTransform('pillar');
    applyTransform('big',currentTime);
    applyTransform('small1',currentTime);
    applyTransform('small2',currentTime);
    render();
    requestAnimationFrame(animate);
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    shader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

async function main() {
    try {
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
        }

        M = mat4.create();
        M1 = mat4.create();
        M2 = mat4.create();
        
        await initShader();

        setupBuffers();

        return true;
    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}
