// Global constants
const canvas = document.getElementById('glCanvas'); // Get the canvas element 
const gl = canvas.getContext('webgl2'); // Get the WebGL2 context

if (!gl) {
    console.error('WebGL 2 is not supported by your browser.');
}

// Set canvas size: 현재 window 전체를 canvas로 사용
canvas.width = 500;
canvas.height = 500;

// Initialize WebGL settings: viewport and clear color
gl.viewport(0, 0, canvas.width, canvas.height);
gl.enable(gl.SCISSOR_TEST);

// Start rendering
render();

// Render loop
function render() {
    // 현재 캔버스 크기
    const w = canvas.width;
    const h = canvas.height;
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);

    // gl.viewport(...) 로 viewport를 지정하고 나서 gl.scissor(...) 를 call
    gl.viewport(0, 0, w, h);
    
    // 좌하단
    gl.scissor(0, 0, halfW, halfH);
    gl.clearColor(0.0, 0.0, 1.0, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 우하단
    gl.scissor(halfW, 0, halfW, halfH);
    gl.clearColor(1.0, 1.0, 0.0, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 좌상단
    gl.scissor(0, halfH, halfW, halfH);
    gl.clearColor(0.0, 1.0, 0.0, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 우상단
    gl.scissor(halfW, halfH, halfW, halfH);
    gl.clearColor(1.0, 0.0, 0.0, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT);
}

// Resize viewport when window size changes
window.addEventListener('resize', () => {
    // 창 크기 중 작은 면을 기준으로 정사각형 유지
    const size = Math.min(window.innerWidth, window.innerHeight);
    canvas.width = size;
    canvas.height = size;

    gl.viewport(0, 0, canvas.width, canvas.height);
    render();
});
