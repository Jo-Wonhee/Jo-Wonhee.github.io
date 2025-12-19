// main.js (v7)
// Fixes:
// - characterScale 초기값 = 0.01 유지
// - isLeft(초기 true) 도입 + "turn 한 번이 작동될 때마다" 토글: startTurn()에서 토글
// - 중력 회전 corner 모드에서 yaw 방향이 isLeft에 따라 좌/우로 바뀌도록 적용
//   (pitch 적용 후 up 축을 다시 계산해서 yaw에 사용)

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// -----------------------------
// Config
// -----------------------------
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
// scale 0.01 기준 카메라
camera.position.set(-2.0, 1.5, 6.0);
scene.add(camera);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 0.7, 0);
orbitControls.enableKeys = false;
orbitControls.enableDamping = true;
orbitControls.update();

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

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

// Blender default cube size: 2x2x2
const refCube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshNormalMaterial()
);
refCube.position.set(2.5, 1, 0);
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
  turnSpeedDeg: 60,     // max 90
  distance: 0,          // 0=sole, +이면 sole 아래, max 4
  characterScale: 0.01, // 유지
};

const gui = new GUI();
gui.add(params, 'corner').name('corner');
gui.add(params, 'turnSpeedDeg', 0, 90, 1).name('gravity turn speed');
gui.add(params, 'distance', 0, 4, 0.01).name('distance');
gui.add(params, 'characterScale', 0.001, 0.05, 0.001).name('character scale').onChange(v => {
  actorGroup.scale.setScalar(v);
});

// -----------------------------
// Animation State
// -----------------------------
const actorGroup = new THREE.Group();
scene.add(actorGroup);
actorGroup.scale.setScalar(params.characterScale);

let characterRoot = null;
let mixer = null;

const actions = { idle: null, walk: null, turn: null };
let currentAction = null;

let wDown = false;
let isTurning = false;

// 중력 회전 좌/우 토글
let isLeft = true; // initial True

let turnDuration = 0;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const q180 = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI);
const turnStartQuat = new THREE.Quaternion();
const turnEndQuat = new THREE.Quaternion();

const clock = new THREE.Clock();
let soleLocalY = 0;

// 포커스 빠지면 stuck 방지
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

function getActorAxes() {
  const up = LOCAL_UP.clone().applyQuaternion(actorGroup.quaternion).normalize();
  const forward = LOCAL_FORWARD.clone().applyQuaternion(actorGroup.quaternion).normalize();
  const right = LOCAL_RIGHT.clone().applyQuaternion(actorGroup.quaternion).normalize();
  return { up, forward, right };
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

// -----------------------------
// Turn180
// -----------------------------
function startTurn() {
  if (!actions.turn || isTurning) return;

  // turn 한 번이 작동될 때마다 토글 (요구사항)
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

  // bbox로 sole 추정
  const box = new THREE.Box3().setFromObject(characterRoot);
  soleLocalY = box.min.y;

  // orbit target 재조정
  const size = box.getSize(new THREE.Vector3());
  orbitControls.target.set(0, (size.y * params.characterScale) * 0.45, 0);
  orbitControls.update();

  mixer = new THREE.AnimationMixer(characterRoot);
  mixer.addEventListener('finished', onMixerFinished);

  const idleObj = await loadFBX(FILE_IDLE);
  const walkObj = await loadFBX(FILE_WALK);
  const turnObj = await loadFBX(FILE_TURN);

  actions.idle = mixer.clipAction(idleObj.animations[0]);
  actions.walk = mixer.clipAction(walkObj.animations[0]);

  // Turn clip: yaw 본 quaternion 트랙 제거
  const rawTurnClip = turnObj.animations[0];
  const yawBoneName = inferYawBoneName(rawTurnClip, characterRoot);
  const strippedTurnClip = stripQuaternionTracksForNode(rawTurnClip, yawBoneName);

  actions.turn = mixer.clipAction(strippedTurnClip);
  turnDuration = strippedTurnClip.duration;

  actions.idle.setLoop(THREE.LoopRepeat);
  actions.walk.setLoop(THREE.LoopRepeat);

  // 초기 상태
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

  if (actions.idle && actions.walk && actions.turn) {
    enforceStateEachFrame();
  }

  // Turn 진행률에 맞춰 actorGroup 회전
  if (isTurning && actions.turn && turnDuration > 0) {
    const t = actions.turn.time;
    const a = Math.min(Math.max(t / turnDuration, 0), 1);
    actorGroup.quaternion.copy(turnStartQuat).slerp(turnEndQuat, a);
  }

  const speed = BASE_WALK_SPEED * params.characterScale;

  // 이동/중력 회전: 걷기 중일 때만
  if (characterRoot && !isTurning && wDown && currentAction === actions.walk) {
    if (!params.corner) {
      const { forward } = getActorAxes();
      actorGroup.position.addScaledVector(forward, speed * dt);
    } else {
      // pivot: sole - up * distance  (distance>0 => below sole)
      const { up, right } = getActorAxes();
      const soleW = getSoleWorld();
      const pivotW = soleW.clone().addScaledVector(up, -params.distance);

      const ang = THREE.MathUtils.degToRad(params.turnSpeedDeg) * dt;

      // pitch down 먼저
      rotateGroupAroundWorldPoint(actorGroup, right, +ang, pivotW);

      // pitch 후 up 축 재계산해서 yaw 적용 (좌/우 토글)
      const up2 = LOCAL_UP.clone().applyQuaternion(actorGroup.quaternion).normalize();
      const yaw = isLeft ? +ang : -ang;
      rotateGroupAroundWorldPoint(actorGroup, up2, yaw, pivotW);

      const f2 = LOCAL_FORWARD.clone().applyQuaternion(actorGroup.quaternion).normalize();
      actorGroup.position.addScaledVector(f2, speed * dt);
    }
  }

  orbitControls.update();
  stats.update();
  renderer.render(scene, camera);
}
