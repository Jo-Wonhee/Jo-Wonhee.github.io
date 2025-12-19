// main.js
// 추가 기능:
// 1) '중력 회전(Gravity Turn)': corner 체크 시 W를 누르면
//    - (A) 고개 숙이는 방향(pitch down)으로 회전 + (B) 좌회전(yaw left)을 동시에 수행하면서 전진
//    - 두 회전은 함께 시작/끝 (W hold 동안 계속)
//    - "피치 회전축"의 높이(발바닥 기준 오프셋)와 회전 속도를 GUI로 조절
// 2) 캐릭터 옆에 블렌더 기본 큐브(2x2x2) 생성
// 3) 캐릭터 크기(스케일)를 GUI로 조절

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

const BASE_WALK_SPEED = 60;  // 스케일 1 기준

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

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100000);
camera.position.set(-1, 50, 250);
scene.add(camera);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(1, 70, 0);
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
refCube.position.set(40, 1, 0);
scene.add(refCube);

// -----------------------------
// Loader
// -----------------------------
const loader = new FBXLoader();
loader.setPath(ASSET_PATH);

function loadFBX(filename) {
  return new Promise((resolve, reject) => {
    loader.load(filename, resolve, undefined, reject);
  });
}

// -----------------------------
// GUI
// -----------------------------
const params = {
  corner: false,          // 중력 회전 모드
  turnSpeedDeg: 90,       // deg/sec (yaw & pitch 같이 적용)
  pivotOffset: 0,         // 발바닥(sole) 기준 +up 방향 거리 (scene unit)
  characterScale: 1.0,    // actorGroup uniform scale
};

const gui = new GUI();
gui.add(params, 'corner').name('corner');
gui.add(params, 'turnSpeedDeg', 0, 360, 1).name('gravity turn speed');
gui.add(params, 'pivotOffset', -50, 200, 0.1).name('pivot offset from sole');
gui.add(params, 'characterScale', 0.1, 5.0, 0.01).name('character scale').onChange(v => {
  actorGroup.scale.setScalar(v);
});

// -----------------------------
// Animation State
// -----------------------------
const actorGroup = new THREE.Group();
scene.add(actorGroup);

let characterRoot = null;
let mixer = null;

const actions = { idle: null, walk: null, turn: null };
let currentAction = null;

let wDown = false;
let isTurning = false;

let turnDuration = 0;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const q180 = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI);
const turnStartQuat = new THREE.Quaternion();
const turnEndQuat = new THREE.Quaternion();

const clock = new THREE.Clock();

// 캐릭터 발바닥 높이(캐릭터 로컬 bbox 기준). 로드 후 계산.
let soleLocalY = 0;

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

function startIdle() { switchAction(actions.idle); }
function startWalk() { switchAction(actions.walk); }

function getActorAxes() {
  const up = LOCAL_UP.clone().applyQuaternion(actorGroup.quaternion).normalize();
  const forward = LOCAL_FORWARD.clone().applyQuaternion(actorGroup.quaternion).normalize();
  const right = LOCAL_RIGHT.clone().applyQuaternion(actorGroup.quaternion).normalize();
  return { up, forward, right };
}

// 그룹을 "월드 좌표계의 pivot 점"을 기준으로 회전
function rotateGroupAroundWorldPoint(group, axisWorld, angleRad, pivotWorld) {
  const q = new THREE.Quaternion().setFromAxisAngle(axisWorld, angleRad);

  // position 회전
  group.position.sub(pivotWorld);
  group.position.applyQuaternion(q);
  group.position.add(pivotWorld);

  // orientation 회전 (월드 축 기준이므로 premultiply)
  group.quaternion.premultiply(q);
  group.updateMatrixWorld(true);
}

// 그룹의 발바닥(sole) 월드 위치 추정: actorGroup 기준 (0, soleLocalY, 0)을 월드로 변환
function getSoleWorld() {
  // soleLocalY는 characterRoot 로컬 bbox 기준.
  // characterRoot가 actorGroup의 자식이므로, actorGroup 로컬에서 sole도 동일 y를 쓰는 근사로 충분.
  // (characterRoot에 추가 오프셋이 있으면 정확하지 않을 수 있음. 필요하면 여기서 조정)
  const soleLocal = new THREE.Vector3(0, soleLocalY * params.characterScale, 0);
  return actorGroup.localToWorld(soleLocal);
}

// -----------------------------
// Turn180: (이전 버전 유지) - clip에서 yaw 트랙 제거 + group이 진행률로 회전
// -----------------------------
function startTurn() {
  if (!actions.turn || isTurning) return;

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
  if (wDown) startWalk();
  else startIdle();
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
  actorGroup.scale.setScalar(params.characterScale);

  // 캐릭터 bbox로 발바닥 y 추정
  const box = new THREE.Box3().setFromObject(characterRoot);
  soleLocalY = box.min.y;

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

  startIdle();
  animate();
}

init().catch(err => console.error(err));

// -----------------------------
// Input
// -----------------------------
window.addEventListener('resize', onWindowResize, false);
document.addEventListener('keydown', onKeyDown, false);
document.addEventListener('keyup', onKeyUp, false);

function onKeyDown(e) {
  const key = e.key.toLowerCase();

  if (key === 'w') {
    wDown = true;
    if (!isTurning) startWalk();
  }

  if (key === 't') {
    if (!isTurning) startTurn();
  }
}

function onKeyUp(e) {
  const key = e.key.toLowerCase();

  if (key === 'w') {
    wDown = false;
    if (!isTurning) startIdle();
  }
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

  // Turn 진행률에 맞춰 actorGroup 회전
  if (isTurning && actions.turn && turnDuration > 0) {
    const t = actions.turn.time;
    const a = Math.min(Math.max(t / turnDuration, 0), 1);
    actorGroup.quaternion.copy(turnStartQuat).slerp(turnEndQuat, a);
  }

  const speed = BASE_WALK_SPEED * params.characterScale;

  // W hold: 기본 walk or 중력 회전 walk
  if (characterRoot && !isTurning && wDown && currentAction === actions.walk) {
    if (!params.corner) {
      // 기존: forward로 translation
      const { forward } = getActorAxes();
      actorGroup.position.addScaledVector(forward, speed * dt);
    } else {
      // 중력 회전:
      // - pitch down: right 축 기준
      // - yaw left: up 축 기준
      // - pivot: soleWorld + up * pivotOffset
      const { up, forward, right } = getActorAxes();
      const soleW = getSoleWorld();
      const pivotW = soleW.clone().addScaledVector(up, params.pivotOffset);

      const ang = THREE.MathUtils.degToRad(params.turnSpeedDeg) * dt;

      // pitch down (고개 숙이기): right 축 기준 +ang
      rotateGroupAroundWorldPoint(actorGroup, right, +ang, pivotW);

      // yaw left (좌회전): up 축 기준 +ang
      rotateGroupAroundWorldPoint(actorGroup, up, +ang, pivotW);

      // 전진 이동은 "현재 forward" 기준
      // (회전 이후 forward가 갱신되므로 다시 계산)
      const f2 = LOCAL_FORWARD.clone().applyQuaternion(actorGroup.quaternion).normalize();
      actorGroup.position.addScaledVector(f2, speed * dt);
    }
  }

  orbitControls.update();
  stats.update();
  renderer.render(scene, camera);
}
