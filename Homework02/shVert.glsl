#version 300 es

layout (location = 0) in vec3 aPos;

uniform vec2 uOffset;

void main() {
    gl_Position = vec4(aPos[0]+uOffset[0], aPos[1]+uOffset[1], aPos[2], 1.0);
} 
