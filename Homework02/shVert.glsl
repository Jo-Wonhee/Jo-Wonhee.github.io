#version 300 es

layout in vec3 aPos;

uniform vec2 uOffset;

void main() {
    gl_Position = vec4(clamp(aPos[0]+uOffset[0],-0.9,0.9), clamp(aPos[1]+uOffset[1],-0.9,0.9), aPos[2], 1.0);
} 
