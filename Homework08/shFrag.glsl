#version 300 es

precision highp float;

out vec4 FragColor;
in vec3 fragPos;  
in vec3 normal;  
in vec2 texCoord;
uniform vec4 u_baseColor;
uniform int u_toonLevels;

struct Material {
    sampler2D diffuse; // diffuse map
    vec3 specular;     // 표면의 specular color
    float shininess;   // specular 반짝임 정도
};

struct Light {
    //vec3 position;
    vec3 direction;
    vec3 ambient; // ambient 적용 strength
    vec3 diffuse; // diffuse 적용 strength
    vec3 specular; // specular 적용 strength
};

uniform Material material;
uniform Light light;
uniform vec3 u_viewPos;

void main() {
    // ambient
    vec3 color = u_baseColor.rgb;
  	
    // diffuse 
    vec3 norm = normalize(normal);
    //vec3 lightDir = normalize(light.position - fragPos);
    vec3 lightDir = normalize(light.direction);
    float dotNormLight = dot(norm, lightDir);
    vec3 ambient = light.ambient * color;
    float diff = max(dot(norm, lightDir), 0.0);
    diff = (floor(diff * float(max(u_toonLevels,1))) + 0.5) / float(max(u_toonLevels,1));
    vec3 diffuse = light.diffuse * (diff * color);

    
    // specular
    vec3 viewDir = normalize(u_viewPos - fragPos);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec = 0.0;
    if (dotNormLight > 0.0) {
        spec = pow(max(dot(viewDir, reflectDir), 0.0), material.shininess);
    }
    spec = (floor(spec * float(max(u_toonLevels,1))) + 0.5) / float(max(u_toonLevels,1));
    vec3 specular = light.specular * spec * material.specular;  
        
    vec3 result = ambient + diffuse + specular;
    FragColor = vec4(result, 1.0);
} 