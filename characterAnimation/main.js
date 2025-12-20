// main.js (v12)
// Change: corner 종료 시 (isLeft==True 기준) 캐릭터 발(sole)이 "빨간 점" 위치(큐브 옆면 중앙)에 오도록 위치 보정
//
// 구현 방식:
// - corner 시작 시 startSoleW, targetSoleW를 기록
//   * targetSoleW: 큐브 옆면 중심
//       - isLeft == true  -> +X face center  ( +1, +1, 0 )
//       - isLeft == false -> -X face center  ( -1, +1, 0 )
// - corner 진행 중 매 프레임:
//   1) start pose로 리셋 후 회전(pitch/yaw) 적용
//   2) 현재 soleWorld를 측정
//   3) 원하는 soleWorld = lerp(startSoleW, targetSoleW, alpha)
//   4) actorGroup.position에 delta를 더해서 sole가 원하는 위치로 오게 함
//
// 이렇게 하면 corner 끝에서 sole이 정확히 목표 점에 위치한다.

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const ASSET_PATH = './assets/models/';
const FILE_MODEL = 'astronaut.fbx';
const FILE_IDLE  = 'Standing W_Briefcase Idle.fbx';
const FILE_WALK  = 'Walking.fbx';
const FILE_TURN  = 'Turn180.fbx';

const BASE_WALK_SPEED = 60;
const FADE = 0.18;

const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_UP      = new THREE.Vector3(0, 1, 0);
const LOCAL_RIGHT   = new THREE.Vector3(1, 0, 0);

const CUBE_SIZE = 2;
const CUBE_HALF = CUBE_SIZE / 2;          // 1
const CUBE_CENTER_Y = CUBE_HALF;          // 1
const CUBE_TOP_Y = CUBE_CENTER_Y + CUBE_HALF; // 2
const TARGET_CORNER_RAD = Math.PI / 2;    // 90deg

// -----------------------------
// Scene
// -----------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 100000);
camera.position.set(-2.0, 1.5, 6.0);
scene.add(camera);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, CUBE_TOP_Y, 0);
orbitControls.enableKeys = false;
orbitControls.enableDamping = true;
orbitControls.update();

const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(-10, 20, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

scene.add(new THREE.AmbientLight(0x444444, 1.0));
const dirLight2 = new THREE.DirectionalLight(0xffffff, 1);
dirLight2.position.set(0, -10, -10);
scene.add(dirLight2);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(400, 40, 0x000000, 0x000000);
gridHelper.material.opacity = 0.2;
gridHelper.material.transparent = true;
scene.add(gridHelper);

// Cube
const refCube = new THREE.Mesh(
  new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
  new THREE.MeshNormalMaterial()
);
refCube.position.set(0, CUBE_CENTER_Y, 0);
scene.add(refCube);

// -----------------------------
// Loader
// -----------------------------
const loader = new FBXLoader();
loader.setPath(ASSET_PATH);
function loadFBX(filename) {
  return new Promise((resolve, reject) => loader.load(filename, resolve, undefined, reject));
}

// -----------------------------
// GUI / Params
// -----------------------------
const params = {
  corner: false,
  turnSpeedDeg: 60,
  distance: 1,
  characterScale: 0.01,
};

const actorGroup = new THREE.Group();
scene.add(actorGroup);
actorGroup.scale.setScalar(params.characterScale);

const gui = new GUI();
const cornerCtrl = gui.add(params, 'corner').name('corner');
gui.add(params, 'turnSpeedDeg', 0, 90, 1).name('gravity turn speed');
gui.add(params, 'distance', 0, 4, 0.01).name('distance');
gui.add(params, 'characterScale', 0.001, 0.05, 0.001).name('character scale').onChange(v => {
  actorGroup.scale.setScalar(v);
});

// -----------------------------
// Animation State
// -----------------------------
let characterRoot = null;
let mixer = null;

const actions = { idle: null, walk: null, turn: null };
let currentAction = null;

let wDown = false;
let isTurning = false;

let isLeft = true; // initial True

// corner state
let cornerActive = false;
let cornerAngle = 0;
const cornerStartPos = new THREE.Vector3();
const cornerStartQuat = new THREE.Quaternion();
const cornerEndQuat = new THREE.Quaternion();
const F0 = new THREE.Vector3();
const U0 = new THREE.Vector3();
const R0 = new THREE.Vector3();
const pivotW0 = new THREE.Vector3();

const cornerStartSoleW = new THREE.Vector3();
const cornerTargetSoleW = new THREE.Vector3();

let turnDuration = 0;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const q180 = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI);
const turnStartQuat = new THREE.Quaternion();
const turnEndQuat = new THREE.Quaternion();

const clock = new THREE.Clock();
let soleLocalY = 0;

window.addEventListener('blur', () => { wDown = false; });

// -----------------------------
// Helpers
// -----------------------------
function switchAction(next, fade = FADE) {
  if (!next || next === currentAction) return;

  next.enabled = true;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.play();

  if (currentAction) currentAction.crossFadeTo(next, fade, false);
  else next.fadeIn(fade);

  currentAction = next;
}

function desiredLocomotionAction() {
  if (isTurning) return null;
  return wDown ? actions.walk : actions.idle;
}

function enforceStateEachFrame() {
  const desired = desiredLocomotionAction();
  if (desired && desired !== currentAction) switchAction(desired);
}

function rotateGroupAroundWorldPoint(group, axisWorld, angleRad, pivotWorld) {
  const q = new THREE.Quaternion().setFromAxisAngle(axisWorld, angleRad);

  group.position.sub(pivotWorld);
  group.position.applyQuaternion(q);
  group.position.add(pivotWorld);

  group.quaternion.premultiply(q);
  group.updateMatrixWorld(true);
}

function getSoleWorld() {
  const soleLocal = new THREE.Vector3(0, soleLocalY * params.characterScale, 0);
  return actorGroup.localToWorld(soleLocal);
}

function beginCornerIfNeeded() {
  if (cornerActive) return;
  if (!params.corner) return;
  if (!wDown) return;
  if (isTurning) return;
  if (currentAction !== actions.walk) return;

  cornerActive = true;
  cornerAngle = 0;

  cornerStartPos.copy(actorGroup.position);
  cornerStartQuat.copy(actorGroup.quaternion);

  F0.copy(LOCAL_FORWARD).applyQuaternion(cornerStartQuat).normalize();
  U0.copy(LOCAL_UP).applyQuaternion(cornerStartQuat).normalize();
  R0.copy(LOCAL_RIGHT).applyQuaternion(cornerStartQuat).normalize();

  // pivot: top center에서 F0 방향으로 half만큼 이동한 top-front edge center
  const topCenterW = new THREE.Vector3(actorGroup.position.x, CUBE_TOP_Y, actorGroup.position.z);
  pivotW0.copy(topCenterW).addScaledVector(F0, CUBE_HALF);

  // build end orientation (absolute) so that the final basis matches the requested mapping
  // isLeft==true  : keep previous behavior end = pitch(+90 around R0) then yaw(+90 around F0)
  // isLeft==false : want final up = R0 and final forward = -U0 (=> right = -F0)
  if (isLeft) {
    const qPitch = new THREE.Quaternion().setFromAxisAngle(R0, TARGET_CORNER_RAD);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(F0, TARGET_CORNER_RAD);
    cornerEndQuat.copy(cornerStartQuat).premultiply(qPitch).premultiply(qYaw);
  } else {
    // Fix: up이 반대로 나오는 케이스 대응
    // Desired (visual) for isLeft==false:
    //   final up    = -R0
    //   final fwd   = -U0
    //   => final right = up x fwd = (-R0) x (-U0) = +F0
    const rightEnd = new THREE.Vector3().copy(F0);
    const upEnd = new THREE.Vector3().copy(R0).multiplyScalar(-1);
    const forwardEnd = new THREE.Vector3().copy(U0).multiplyScalar(-1);
    const m = new THREE.Matrix4().makeBasis(rightEnd, upEnd, forwardEnd);
    cornerEndQuat.setFromRotationMatrix(m);
  }


  // start/target sole positions
  cornerStartSoleW.copy(getSoleWorld());

  // target: corner 시작 지점(sole) 기준 "상대 오프셋"으로 설정
  // 오프셋 규칙(초기 basis 기준):
  //   isLeft==True  -> (+d, -d, +d)  = +Right, -Up, +Forward
  //   isLeft==False -> (-d, -d, +d)  = -Right, -Up, +Forward
  // 여기서 Right/Up/Forward는 corner 시작 순간의 월드 기준축(R0/U0/F0)으로 계산함.
  const d = params.distance;
  const s = isLeft ? +1 : -1;

  cornerTargetSoleW
    .copy(cornerStartSoleW)
    .addScaledVector(R0, s * d)
    .addScaledVector(U0, -d)
    .addScaledVector(F0, +d);
}

function endCorner() {
  cornerActive = false;
  params.corner = false;
  cornerCtrl.updateDisplay();
}

// -----------------------------
// Turn180
// -----------------------------
function startTurn() {
  if (!actions.turn || isTurning) return;
  isLeft = !isLeft;

  isTurning = true;

  turnStartQuat.copy(actorGroup.quaternion);
  turnEndQuat.copy(turnStartQuat).multiply(q180);

  actions.turn.enabled = true;
  actions.turn.reset();
  actions.turn.setLoop(THREE.LoopOnce, 1);
  actions.turn.clampWhenFinished = true;
  actions.turn.setEffectiveTimeScale(1);
  actions.turn.setEffectiveWeight(1);

  switchAction(actions.turn);
}

function onMixerFinished(e) {
  if (!isTurning) return;
  if (e?.action !== actions.turn) return;

  actorGroup.quaternion.copy(turnEndQuat);
  isTurning = false;

  enforceStateEachFrame();
}

function inferYawBoneName(clip, modelRoot) {
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.quaternion')) continue;
    const nodeName = tr.name.split('.')[0];
    const obj = modelRoot.getObjectByName(nodeName);
    if (obj && obj.isBone) return nodeName;
  }
  for (const tr of clip.tracks) {
    if (tr.name.endsWith('.quaternion')) return tr.name.split('.')[0];
  }
  return null;
}

function stripQuaternionTracksForNode(clip, nodeName) {
  if (!nodeName) return clip;
  const kept = [];
  for (const tr of clip.tracks) {
    if (tr.name === `${nodeName}.quaternion`) continue;
    kept.push(tr);
  }
  const stripped = new THREE.AnimationClip(clip.name, clip.duration, kept);
  stripped.resetDuration();
  return stripped;
}

// -----------------------------
// Init
// -----------------------------
async function init() {
  characterRoot = await loadFBX(FILE_MODEL);

  characterRoot.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });

  actorGroup.add(characterRoot);

  const box = new THREE.Box3().setFromObject(characterRoot);
  soleLocalY = box.min.y;

  // Place on cube top center: sole touches y=2
  actorGroup.position.set(0, 0, 0);
  actorGroup.quaternion.identity();
  actorGroup.updateMatrixWorld(true);

  const soleW = getSoleWorld();
  actorGroup.position.y += (CUBE_TOP_Y - soleW.y);
  actorGroup.position.x = 0;
  actorGroup.position.z = 0;

  orbitControls.target.set(0, CUBE_TOP_Y, 0);
  orbitControls.update();

  mixer = new THREE.AnimationMixer(characterRoot);
  mixer.addEventListener('finished', onMixerFinished);

  const idleObj = await loadFBX(FILE_IDLE);
  const walkObj = await loadFBX(FILE_WALK);
  const turnObj = await loadFBX(FILE_TURN);

  actions.idle = mixer.clipAction(idleObj.animations[0]);
  actions.walk = mixer.clipAction(walkObj.animations[0]);

  const rawTurnClip = turnObj.animations[0];
  const yawBoneName = inferYawBoneName(rawTurnClip, characterRoot);
  const strippedTurnClip = stripQuaternionTracksForNode(rawTurnClip, yawBoneName);

  actions.turn = mixer.clipAction(strippedTurnClip);
  turnDuration = strippedTurnClip.duration;

  actions.idle.setLoop(THREE.LoopRepeat);
  actions.walk.setLoop(THREE.LoopRepeat);

  wDown = false;
  isTurning = false;
  switchAction(actions.idle, 0);

  animate();
}

init().catch(err => console.error(err));

// -----------------------------
// Input
// -----------------------------
window.addEventListener('resize', onWindowResize, false);
window.addEventListener('keydown', onKeyDown, false);
window.addEventListener('keyup', onKeyUp, false);

function onKeyDown(e) {
  const key = e.key.toLowerCase();
  if (key === 'w') wDown = true;
  if (key === 't') startTurn();
}

function onKeyUp(e) {
  const key = e.key.toLowerCase();
  if (key === 'w') wDown = false;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// -----------------------------
// Render loop
// -----------------------------
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);

  if (actions.idle && actions.walk && actions.turn) enforceStateEachFrame();

  if (isTurning && actions.turn && turnDuration > 0) {
    const t = actions.turn.time;
    const a = Math.min(Math.max(t / turnDuration, 0), 1);
    actorGroup.quaternion.copy(turnStartQuat).slerp(turnEndQuat, a);
  }

  if (!isTurning) beginCornerIfNeeded();

  if (characterRoot && !isTurning && wDown && currentAction === actions.walk) {
    if (!cornerActive) {
      const forward = LOCAL_FORWARD.clone().applyQuaternion(actorGroup.quaternion).normalize();
      actorGroup.position.addScaledVector(forward, (BASE_WALK_SPEED * params.characterScale) * dt);
    } else {
      const angStep = THREE.MathUtils.degToRad(params.turnSpeedDeg) * dt;
      cornerAngle = Math.min(cornerAngle + angStep, TARGET_CORNER_RAD);
      const alpha = cornerAngle / TARGET_CORNER_RAD;

      // 1) 절대 포즈: start로 리셋 후, slerp 대신 "축 회전"으로 자세를 만든다
actorGroup.position.copy(cornerStartPos);
actorGroup.quaternion.copy(cornerStartQuat);

// orientation (no slerp)
if (isLeft) {
  // True: 이전 forward(F0) -> 이후 up 이 되도록 (pitch around R0, then yaw around F0)
  actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(R0, cornerAngle));
  actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(F0, +cornerAngle));
} else {
  // False: v16에서 맞았던 매핑 유지 (final up = -R0, final forward = -U0)
actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(F0, -cornerAngle));
actorGroup.quaternion.premultiply(
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().copy(R0).multiplyScalar(-1), +cornerAngle)
);
// Fix: 결과가 up/forward가 둘 다 반대로 나오는 경우(=F0축 180도 차이) 보정
actorGroup.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(F0, Math.PI * alpha));
}
actorGroup.updateMatrixWorld(true);

// 2) sole 목표: 직선 보간이 아니라, (sole - U0*d) 를 중심으로 사분원 경로를 따른다
const d = params.distance;
const pivot = new THREE.Vector3().copy(cornerStartSoleW).addScaledVector(U0, -d);

// pivot -> sole 벡터(반지름)
const v = new THREE.Vector3().copy(U0).multiplyScalar(d);

// up/forward 성분: R0 축으로 회전(사분원)
v.applyAxisAngle(R0, cornerAngle);

// 좌/우 성분: a만큼 회전했을 때, ±distance*sin(a) 만큼 R0 방향으로 이동
const yawSign = isLeft ? +1 : -1;
const lateral = new THREE.Vector3().copy(R0).multiplyScalar(yawSign * d * Math.sin(cornerAngle));

const desiredSole = pivot.add(v).add(lateral);
      const curSole = getSoleWorld();
      const delta = desiredSole.sub(curSole);
      actorGroup.position.add(delta);
      actorGroup.updateMatrixWorld(true);

      if (cornerAngle >= TARGET_CORNER_RAD - 1e-8) endCorner();
    }
  }

  orbitControls.update();
  renderer.render(scene, camera);
}
