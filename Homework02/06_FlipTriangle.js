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
let colorTag = "red"; // triangle 초기 color는 red
let verticalFlip = 1.0; // 1.0 for normal, -1.0 for vertical flip
let textOverlay3; // for text output third line (see util.js)

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
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    
    return true;
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    shader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

function setupKeyboardEvents() {
    window.addEventListener('keydown', (event) => {
        if (event.key == 'ArrowUp') {
            //console.log("ArrowUp key pressed");
            if (vertices[10] < 1.0) {
               vertices[1] = vertices[1]+0.01
               vertices[4] = vertices[4]+0.01
               vertices[7] = vertices[7]+0.01
               vertices[10] = vertices[10]+0.01
            }
        }
        else if (event.key == 'ArrowDown') {
            //console.log("ArrowDown key pressed");
            if (vertices[1] > -1.0) {
               vertices[1] = vertices[1]-0.01
               vertices[4] = vertices[4]-0.01
               vertices[7] = vertices[7]-0.01
               vertices[10] = vertices[10]-0.01
            }
        }
        else if (event.key == 'ArrowLeft') {
            //console.log("ArrowLeft key pressed");
            if (vertices[0] > -1.0) {
               vertices[0] = vertices[0]-0.01
               vertices[3] = vertices[3]-0.01
               vertices[6] = vertices[6]-0.01
               vertices[9] = vertices[9]-0.01
            }
        }
        else if (event.key == 'ArrowRight') {
            //console.log("ArrowRight key pressed");
            if (vertices[3] < 1.0) {
               vertices[0] = vertices[0]+0.01
               vertices[3] = vertices[3]+0.01
               vertices[6] = vertices[6]+0.01
               vertices[9] = vertices[9]+0.01
            }
        }
    });
}

uniform vertices = new Float32Array([
        -0.1, -0.1, 0.0,  
         0.1, -0.1, 0.0,  
         0.1,  0.1, 0.0,
        -0.1,  0.1, 0.0
    ]);

function setupBuffers() {
    
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    shader.setAttribPointer('aPos', 3, gl.FLOAT, false, 0, 0);
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    let color;
    if (colorTag == "red") {
        color = [1.0, 0.0, 0.0, 1.0];
    }
    else if (colorTag == "green") {
        color = [0.0, 1.0, 0.0, 1.0];
    }
    else if (colorTag == "blue") {
        color = [0.0, 0.0, 1.0, 1.0];
    }

    shader.setVec4("uColor", color);
    shader.setFloat("verticalFlip", verticalFlip);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

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
        setupText(canvas, "r, g, b: change color", 1);
        setupText(canvas, "f: flip vertically", 2);
        textOverlay3 = setupText(canvas, "no key pressed", 3);

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
