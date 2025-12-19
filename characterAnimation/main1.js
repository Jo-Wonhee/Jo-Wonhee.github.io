// main.js
// 목표: Turn180 애니메이션이 끝난 직후 "순간 역회전/1바퀴" 문제 제거.
// 접근: Turn180 클립에서 "루트(회전 담당) 본"의 quaternion 트랙을 런타임에서 제거하고,
//       대신 actorGroup(부모 오브젝트)을 Turn 진행률에 맞춰 0→180도로 직접 회전시킨다.
//       그러면 Idle/Walk로 블렌딩할 때 루트 본 회전이 180→0으로 돌아가며 생기는 역회전이 사라진다.

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';

// -----------------------------
// Config
// -----------------------------
const ASSET_PATH = './assets/models/';
const FILE_MODEL = 'astronaut.fbx';
const FILE_IDLE  = 'Standing W_Briefcase Idle.fbx';
const FILE_WALK  = 'Walking.fbx';
const FILE_TURN  = 'Turn180.fbx'; // 사용자가 말한 파일명

const WALK_SPEED = 60;
const FADE = 0.18;

// 이동용 local 축(필요 시 뒤집기)
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_UP      = new THREE.Vector3(0, 1, 0);

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
  return { up, forward };
}

// -----------------------------
// Turn: 핵심 로직
// -----------------------------
function startTurn() {
  if (!actions.turn || isTurning) return;

  isTurning = true;

  // turn 시작 당시 group 회전 저장
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

  // 턴 종료 시 정확히 180 스냅
  actorGroup.quaternion.copy(turnEndQuat);

  isTurning = false;
  if (wDown) startWalk();
  else startIdle();
}

// -----------------------------
// Track stripping (루트 본 회전 제거)
// -----------------------------
// turn 클립에서 "회전 담당" 본을 찾아 해당 본의 quaternion 트랙을 제거한다.
// - FBX마다 본 이름이 다르므로, clip.tracks에서 실제로 등장하는 이름을 기반으로 추론.
function inferYawBoneName(clip, modelRoot) {
  // quaternion 트랙들 중 modelRoot에 존재하는 오브젝트(본) 이름을 우선한다.
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.quaternion')) continue;
    const nodeName = tr.name.split('.')[0]; // e.g. "mixamorigHips"
    const obj = modelRoot.getObjectByName(nodeName);
    if (obj && obj.isBone) return nodeName;
  }
  // fallback: 그래도 못 찾으면 첫 quaternion 트랙의 노드명 사용
  for (const tr of clip.tracks) {
    if (tr.name.endsWith('.quaternion')) return tr.name.split('.')[0];
  }
  return null;
}

function stripQuaternionTracksForNode(clip, nodeName) {
  if (!nodeName) return clip;

  const kept = [];
  for (const tr of clip.tracks) {
    // nodeName으로 시작하는 quaternion 트랙 제거
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

  // scene에 바로 붙이지 말고 actorGroup 아래에 붙인다 (방향/이동은 group 기준)
  actorGroup.add(characterRoot);

  mixer = new THREE.AnimationMixer(characterRoot);
  mixer.addEventListener('finished', onMixerFinished);

  const idleObj = await loadFBX(FILE_IDLE);
  const walkObj = await loadFBX(FILE_WALK);
  const turnObj = await loadFBX(FILE_TURN);

  actions.idle = mixer.clipAction(idleObj.animations[0]);
  actions.walk = mixer.clipAction(walkObj.animations[0]);

  // Turn 클립에서 yaw 본 회전 제거 후 사용
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

  // Turn 중에는 actorGroup을 "진행률"로 직접 회전시킨다.
  // (클립의 yaw 본 회전 트랙은 제거했으므로, 여기서만 방향이 바뀜)
  if (isTurning && actions.turn && turnDuration > 0) {
    const t = actions.turn.time;
    const a = Math.min(Math.max(t / turnDuration, 0), 1);
    actorGroup.quaternion.copy(turnStartQuat).slerp(turnEndQuat, a);
  }

  // Walk translation (요구사항: 바라보는 방향 벡터로 이동)
  if (characterRoot && !isTurning && wDown && currentAction === actions.walk) {
    const { forward } = getActorAxes();
    actorGroup.position.addScaledVector(forward, WALK_SPEED * dt);
  }

  orbitControls.update();
  stats.update();
  renderer.render(scene, camera);
}
