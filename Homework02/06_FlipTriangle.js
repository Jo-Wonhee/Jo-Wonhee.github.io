/*-------------------------------------------------------------------------
06_FlipTriangle.js

1) Change the color of the triangle by keyboard input
   : 'r' for red, 'g' for green, 'b' for blue
2) Flip the triangle vertically by keyboard input 'f' 
---------------------------------------------------------------------------*/
import { resizeAspectRatio, setupText, updateText } from '../util/util.js';
import { Shader, readShaderFile } from '../util/shader.js';

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
let shader;   // shader program
let vao;      // vertex array object
let vbo;

let offsetX = 0.0;
let offsetY = 0.0;
const step = 0.01; // 이동 간격

function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }

    canvas.width = 600;
    canvas.height = 600;

    resizeAspectRatio(gl, canvas);

    // Initialize WebGL settings
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    
    return true;
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    shader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

function setupKeyboardEvents() {
    document.addEventListener('keydown', (event) => {
        if (event.key === "ArrowUp") {
            offsetY += step;
            updateText(textOverlay3, "ArrowUp pressed");
        }
        else if (event.key === "ArrowDown") {
            offsetY -= step;
            updateText(textOverlay3, "ArrowDown pressed");
        }
        else if (event.key === "ArrowLeft") {
            offsetX -= step;
            updateText(textOverlay3, "ArrowLeft pressed");
        }
        else if (event.key === "ArrowRight") {
            offsetX += step;
            updateText(textOverlay3, "ArrowRight pressed");
        }
    });
}

function setupBuffers() {

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    shader.setAttribPointer('aPos', 3, gl.FLOAT, false, 0, 0);
}

function updateVertices() {
    const vertices = new Float32Array([
        -0.1 + offsetX, -0.1 + offsetY, 0.0,  // bottom left
         0.1 + offsetX, -0.1 + offsetY, 0.0,  // bottom right
        -0.1 + offsetX,  0.1 + offsetY, 0.0,  // top left
         0.1 + offsetX,  0.1 + offsetY, 0.0   // top right
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    updateVertices();

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(() => render());
}

async function main() {
    try {

        // WebGL 초기화
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
        }

        // 셰이더 초기화
        await initShader();

        // setup text overlay (see util.js)
        setupText(canvas, "Use arrow keys to move the rectangle", 1);

        // 키보드 이벤트 설정
        setupKeyboardEvents();
        
        // 나머지 초기화
        setupBuffers(shader);
        shader.use();
        
        // 렌더링 시작
        render();

        return true;

    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}

// call main function
main().then(success => {
    if (!success) {
        console.log('프로그램을 종료합니다.');
        return;
    }
}).catch(error => {
    console.error('프로그램 실행 중 오류 발생:', error);
});
