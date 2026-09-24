import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

const PEOPLE = [
  { id: "repo-owner", name: "陈启明", role: "总经理", parent: null },
  { id: "issue-researcher", name: "林雅雯", role: "研究主管", parent: "repo-owner" },
  { id: "release-engineer", name: "周衡", role: "发布主管", parent: "repo-owner" },
  { id: "community-operator", name: "马莉", role: "社区主管", parent: "repo-owner" },
  { id: "triage", name: "苏晓", role: "分流专员", parent: "issue-researcher" },
  { id: "repro", name: "何峻", role: "复现工程师", parent: "issue-researcher" },
  { id: "brief", name: "艾莎", role: "调研摘要", parent: "issue-researcher" },
  { id: "scout", name: "罗宾", role: "情报专员", parent: "issue-researcher" },
  { id: "changelog", name: "韩雪", role: "发布说明", parent: "release-engineer" },
  { id: "versioner", name: "奥马尔", role: "版本管家", parent: "release-engineer" },
  { id: "checklist", name: "高圆", role: "发布检查", parent: "release-engineer" },
  { id: "qa-buddy", name: "艾玛", role: "质量搭档", parent: "release-engineer" },
  { id: "moderator", name: "戴维", role: "社群管家", parent: "community-operator" },
  { id: "events", name: "陈可", role: "活动策划", parent: "community-operator" },
  { id: "advocate", name: "拉吉", role: "对外布道", parent: "community-operator" },
  { id: "docs-ops", name: "米娜", role: "文档运营", parent: "community-operator" },
];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const BG = 0x0d2130;

function hashHue(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function hash01(id) {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) % 997;
  return h / 997;
}

function powerOf(person) {
  if (!person.parent) return 3;
  const parent = PEOPLE.find((p) => p.id === person.parent);
  return parent?.parent ? 1 : 2;
}

function paintPortrait(hue) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 256, 236, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = `hsl(${(hue + 18) % 360}, 18%, 62%)`;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = `hsl(${hue}, 22%, 28%)`;
  ctx.beginPath();
  ctx.ellipse(256, 560, 210, 180, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e4c7b0";
  ctx.beginPath();
  ctx.arc(256, 236, 108, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsl(${(hue + 40) % 360}, 28%, 18%)`;
  ctx.beginPath();
  ctx.ellipse(256, 176, 118, 70, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  strokeRing(ctx, 256, 256, 236);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function strokeRing(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(210, 224, 236, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function circleSticker(img) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 256, 248, 0, Math.PI * 2);
  ctx.clip();
  const side = Math.min(img.width, img.height);
  const srcY = img.height > img.width ? (img.height - side) * 0.08 : (img.height - side) / 2;
  ctx.filter = "brightness(1.06) contrast(1.04) saturate(1.02)";
  ctx.drawImage(img, (img.width - side) / 2, srcY, side, side, 0, 0, 512, 512);
  ctx.filter = "none";
  ctx.restore();
  strokeRing(ctx, 256, 256, 248);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function loadPortrait(id, hue) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    let settled = false;
    const finish = (tex) => {
      if (settled) return;
      settled = true;
      resolve(tex);
    };
    img.onload = () => finish(circleSticker(img));
    img.onerror = () => finish(paintPortrait(hue));
    img.src = `./avatars/${encodeURIComponent(id)}.jpg`;
    window.setTimeout(() => {
      if (!settled) finish(paintPortrait(hue));
    }, 4000);
  });
}

const ballVert = `
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vObjPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  vObjPos = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ballFrag = `
uniform vec3 ballColor;
uniform sampler2D portrait;
uniform float selected;
uniform float spin;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vObjPos;
void main() {
  vec3 n = normalize(vWorldN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float facing = max(dot(n, V), 0.0);
  float fresnel = pow(1.0 - facing, 2.6);

  float cs = cos(spin);
  float sn = sin(spin);
  vec3 keyL = normalize(vec3(0.4, 0.85, 0.45));
  vec3 fillL = normalize(vec3(-0.55, 0.35, -0.2));
  vec3 spinL = normalize(vec3(cs * 0.8, 0.45, sn * 0.8));
  float ndKey = max(dot(n, keyL), 0.0);
  float ndFill = max(dot(n, fillL), 0.0);
  float ndSpin = max(dot(n, spinL), 0.0);
  float hemi = n.y * 0.5 + 0.5;
  vec3 pearl = ballColor * (0.55 + 0.35 * hemi + 0.45 * ndKey + 0.25 * ndFill);
  vec3 h = normalize(V + keyL);
  float spec = pow(max(dot(n, h), 0.0), 36.0);
  float spec2 = pow(max(dot(n, normalize(V + spinL)), 0.0), 70.0);
  pearl += vec3(0.92, 0.96, 1.0) * (spec * 0.22 + spec2 * 0.26 + ndSpin * 0.06);
  pearl += vec3(0.78, 0.86, 0.94) * fresnel * 0.28;

  vec3 up = abs(V.y) < 0.96 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, V));
  vec3 B = cross(V, T);
  vec2 uv = vec2(dot(n, T), dot(n, B)) / (0.96 + 0.06 * facing);
  float r = length(uv);
  vec2 texUV = clamp(uv * 0.5 + 0.5, 0.0, 1.0);
  float mask = smoothstep(1.18, 0.94, r) * smoothstep(0.0, 0.1, facing);
  vec4 port = texture2D(portrait, texUV);
  float wrapShade = mix(0.86, 1.06, facing);
  vec3 face = port.rgb * wrapShade * (0.92 + 0.1 * ndKey);
  vec3 col = mix(pearl, face, mask * port.a);
  col += vec3(0.7, 0.82, 0.95) * selected * 0.1;
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeBallMaterial(color, portrait) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ballColor: { value: color },
      portrait: { value: portrait },
      selected: { value: 0 },
      spin: { value: 0 },
    },
    vertexShader: ballVert,
    fragmentShader: ballFrag,
  });
}

function paintLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 320, 64);
  ctx.font = "600 26px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(6, 16, 24, 0.88)";
  ctx.strokeText(text, 160, 34);
  ctx.fillStyle = "#d7e6f2";
  ctx.fillText(text, 160, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function layout(people) {
  const byId = new Map(people.map((p) => [p.id, { ...p, children: [] }]));
  for (const p of byId.values()) {
    if (p.parent && byId.has(p.parent)) byId.get(p.parent).children.push(p);
  }
  const root = [...byId.values()].find((p) => !p.parent);
  const pos = new Map();
  pos.set(root.id, new THREE.Vector3(-1.1, 0.85, 0.15));

  const vpAim = {
    "issue-researcher": new THREE.Vector3(-1.0, 0.42, 0.18),
    "release-engineer": new THREE.Vector3(-0.22, -1.0, -0.28),
    "community-operator": new THREE.Vector3(1.0, 0.18, 0.12),
  };
  const leafSpread = {
    "issue-researcher": { yaw: -2.55, pitch: 0.18, fan: 1.55 },
    "release-engineer": { yaw: -1.15, pitch: -0.62, fan: 1.35 },
    "community-operator": { yaw: 0.22, pitch: 0.06, fan: 1.05 },
  };

  root.children.forEach((vp) => {
    const origin = pos.get(root.id);
    const aim = vpAim[vp.id] || new THREE.Vector3(1, 0, 0);
    const dir = aim.clone().normalize();
    const dist = 3.35 + hash01(vp.id) * 0.45;
    const here = origin.clone().add(dir.multiplyScalar(dist));
    here.y += (hash01(vp.id + "y") - 0.5) * 0.28;
    pos.set(vp.id, here);

    const n = vp.children.length;
    const spread = leafSpread[vp.id] || { yaw: 0, pitch: 0, fan: 1.2 };
    const leafNudge = {
      triage: [-1.6, 1.8, 0.2],
      repro: [-2.8, 0.15, 0.35],
      brief: [-0.2, 1.35, -0.2],
      scout: [0.9, 3.2, 0.4],
      changelog: [-2.2, -0.15, 0.25],
      versioner: [0.35, -1.85, 0.1],
      checklist: [1.85, -0.55, -0.15],
      "qa-buddy": [3.1, -2.05, 0.2],
      moderator: [-1.15, 2.15, 0.25],
      events: [-1.85, -1.55, 0.15],
      advocate: [2.55, -1.85, 0.35],
      "docs-ops": [2.05, 1.85, 0.15],
    };
    vp.children.forEach((leaf, j) => {
      const parentPos = pos.get(vp.id);
      const slot = (j - (n - 1) / 2) / Math.max(n - 1, 1);
      const yaw = spread.yaw + slot * spread.fan + (hash01(leaf.id) - 0.5) * 0.22;
      const pitch = spread.pitch * 0.35;
      let dist2 = 5.4 + hash01(leaf.id + "d") * 1.2 + Math.abs(slot) * 1.15;
      if (leaf.id === "scout" || leaf.id === "advocate" || leaf.id === "docs-ops") dist2 += 2.1;
      if (leaf.id === "events") dist2 += 1.0;
      const here2 = new THREE.Vector3(
        parentPos.x + Math.cos(yaw) * dist2,
        parentPos.y + Math.sin(pitch) * dist2 * 0.22,
        parentPos.z + Math.sin(yaw) * dist2 * 0.28,
      );
      const nudge = leafNudge[leaf.id];
      if (nudge) here2.add(new THREE.Vector3(...nudge));
      pos.set(leaf.id, here2);
    });
  });

  const ids = [...pos.keys()];
  for (let iter = 0; iter < 60; iter++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pa = people.find((p) => p.id === ids[i]);
        const pb = people.find((p) => p.id === ids[j]);
        const a = pos.get(ids[i]);
        const b = pos.get(ids[j]);
        const min = radiusOf(pa) + radiusOf(pb) + 1.35;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dxy = Math.hypot(dx, dy);
        if (dxy >= min || dxy < 1e-4) continue;
        const nx = (dx / dxy) * (min - dxy) * 0.5;
        const ny = (dy / dxy) * (min - dxy) * 0.5;
        const wa = pa.parent ? 0.62 : 0.08;
        const wb = pb.parent ? 0.62 : 0.08;
        a.x -= nx * wa;
        a.y -= ny * wa;
        b.x += nx * wb;
        b.y += ny * wb;
      }
    }
  }
  return pos;
}

function radiusOf(person) {
  const p = powerOf(person);
  if (p === 3) return 1.42;
  if (p === 2) return 0.98;
  return 0.58 + hash01(person.id) * 0.16;
}

function linkRadius(person) {
  const p = powerOf(person);
  if (p === 2) return 0.018;
  return 0.011;
}

const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.setClearColor(BG, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(BG, 0.012);
const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / Math.max(stage.clientHeight, 1), 0.1, 200);
camera.position.set(4.5, 6.2, 22);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 10;
controls.maxDistance = 48;
controls.maxPolarAngle = Math.PI / 2.08;
controls.target.set(1.2, 0.2, 0);
let spinning = !reducedMotion;
controls.autoRotate = spinning;
controls.autoRotateSpeed = 0.48;

scene.add(new THREE.HemisphereLight(0xd7e4f2, 0x1a2c3c, 0.95));
const key = new THREE.DirectionalLight(0xfff6ea, 1.45);
key.position.set(10, 16, 12);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const fill = new THREE.DirectionalLight(0xb7d0ea, 0.55);
fill.position.set(-12, 4, -8);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffe7b0, 0.35);
rim.position.set(0, 8, -14);
scene.add(rim);

const world = new THREE.Group();
scene.add(world);
const positions = layout(PEOPLE);
const nodes = [];
const balls = new Map();
const portraits = new Map();
const Y_UP = new THREE.Vector3(0, 1, 0);
let links = [];

function writeLinks() {
  for (const link of links) {
    const parent = balls.get(link.person.parent);
    const child = balls.get(link.person.id);
    const a = parent.position;
    const b = child.position;
    const dir = b.clone().sub(a);
    const full = Math.max(dir.length(), 0.001);
    const ra = parent.userData.radius * 0.97;
    const rb = child.userData.radius * 0.97;
    const len = Math.max(full - ra - rb, 0.04);
    const start = a.clone().add(dir.clone().multiplyScalar(ra / full));
    link.mesh.position.copy(start).add(dir.clone().setLength(len * 0.5));
    link.mesh.quaternion.setFromUnitVectors(Y_UP, dir.multiplyScalar(1 / full));
    link.mesh.scale.set(1, len, 1);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selected = null;
let fly = null;

function setSpinning(on) {
  spinning = on && !reducedMotion;
  controls.autoRotate = spinning;
  const btn = document.getElementById("spin-btn");
  const hud = document.getElementById("spin-state");
  if (btn) btn.textContent = spinning ? "停止转动" : "继续转动";
  if (hud) hud.textContent = spinning ? "球体自转 · 头像始终朝向你 · 点空白处可停" : "已停止自转 · 点空白处或按钮可再开";
}

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(nodes, false)[0];
  return hit?.object ?? null;
}

function showCard(person) {
  selected = person;
  const card = document.getElementById("card");
  card.hidden = false;
  document.getElementById("card-name").textContent = person.name;
  document.getElementById("card-role").textContent = person.role;
  const boss = person.parent ? PEOPLE.find((p) => p.id === person.parent) : null;
  document.getElementById("card-parent").textContent = boss
    ? `汇报给 ${boss.role}（${boss.name}）`
    : "企业根";
  const kids = PEOPLE.filter((p) => p.parent === person.id);
  document.getElementById("card-kids").textContent = `${kids.length} 个直属`;
  document.getElementById("card-avatar").src = portraits.get(person.id).image.toDataURL();
  for (const mesh of nodes) {
    const on = mesh.userData.person.id === person.id;
    mesh.material.uniforms.selected.value = on ? 1 : 0;
  }
}

function clearCard() {
  selected = null;
  document.getElementById("card").hidden = true;
  for (const mesh of nodes) mesh.material.uniforms.selected.value = 0;
}

function flyTo(id) {
  const mesh = balls.get(id);
  if (!mesh) return;
  const toTarget = mesh.position.clone();
  const fromTarget = controls.target.clone();
  const fromCam = camera.position.clone();
  const offset = fromCam.clone().sub(fromTarget);
  if (offset.lengthSq() < 0.0001) offset.set(10, 5, 12);
  const dist = Math.max(5.2, mesh.userData.radius * 6.4);
  const toCam = toTarget.clone().add(offset.setLength(dist));
  fly = {
    fromCam,
    toCam,
    fromTarget,
    toTarget,
    start: performance.now(),
    dur: reducedMotion ? 1 : 900,
  };
  controls.enabled = false;
  setSpinning(false);
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  renderer.domElement.dataset.px = String(event.clientX);
  renderer.domElement.dataset.py = String(event.clientY);
});
renderer.domElement.addEventListener("pointerup", (event) => {
  const x = Number(renderer.domElement.dataset.px || 0);
  const y = Number(renderer.domElement.dataset.py || 0);
  if (Math.hypot(event.clientX - x, event.clientY - y) > 6) return;
  const obj = pick(event);
  if (obj) showCard(obj.userData.person);
  else {
    clearCard();
    setSpinning(!spinning);
  }
});

document.getElementById("card-close").onclick = (event) => {
  event.stopPropagation();
  clearCard();
};
document.getElementById("card-focus").onclick = () => selected && flyTo(selected.id);
document.getElementById("spin-btn").onclick = () => setSpinning(!spinning);

const input = document.getElementById("q");
const hits = document.getElementById("hits");
input.addEventListener("input", () => {
  const q = input.value.trim().toLowerCase();
  if (!q) {
    hits.hidden = true;
    hits.innerHTML = "";
    return;
  }
  const found = PEOPLE.filter((p) => p.name.includes(q) || p.id.includes(q) || p.role.includes(q)).slice(0, 8);
  hits.hidden = found.length === 0;
  hits.innerHTML = found
    .map((p) => `<li><button type="button" data-id="${p.id}">${p.role}<br><small>${p.name}</small></button></li>`)
    .join("");
});
hits.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  const person = PEOPLE.find((p) => p.id === btn.dataset.id);
  showCard(person);
  flyTo(person.id);
  hits.hidden = true;
});

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  if (fly) {
    const u = Math.min(1, (performance.now() - fly.start) / fly.dur);
    const e = u * u * (3 - 2 * u);
    camera.position.lerpVectors(fly.fromCam, fly.toCam, e);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);
    if (u >= 1) {
      fly = null;
      controls.enabled = true;
    }
  }
  for (const mesh of nodes) {
    const { base, phase, radius, nameSprite } = mesh.userData;
    mesh.position.copy(base);
    if (!reducedMotion) {
      mesh.position.y = base.y + Math.sin(t * 0.72 + phase) * 0.08;
      mesh.material.uniforms.spin.value = t * 0.55 + phase;
    }
    nameSprite.position.copy(mesh.position);
    nameSprite.position.y -= radius + 0.58;
  }
  writeLinks();
  controls.update();
  renderer.render(scene, camera);
}

async function buildPeople() {
  const textures = await Promise.all(PEOPLE.map((p) => loadPortrait(p.id, hashHue(p.id))));
  PEOPLE.forEach((person, i) => {
    const radius = radiusOf(person);
    const hue = hashHue(person.id);
    const color = new THREE.Color(0xb8c8d6);
    const portrait = textures[i];
    portraits.set(person.id, portrait);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 64),
      makeBallMaterial(color, portrait),
    );
    const p = positions.get(person.id);
    mesh.position.copy(p);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { person, base: p.clone(), phase: hue / 57, radius };
    world.add(mesh);
    nodes.push(mesh);
    balls.set(person.id, mesh);

    const nameTex = paintLabel(person.role);
    const nameSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: nameTex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      }),
    );
    const nameW = Math.max(1.7, person.role.length * 0.36);
    nameSprite.scale.set(nameW, nameW * 0.22, 1);
    nameSprite.renderOrder = 1;
    world.add(nameSprite);
    mesh.userData.nameSprite = nameSprite;
  });
  links = PEOPLE.filter((p) => p.parent).map((person) => {
    const r = linkRadius(person);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.85, 1, 8),
      new THREE.MeshStandardMaterial({
        color: 0xd5e4f0,
        emissive: 0x7ea3bc,
        emissiveIntensity: 0.22,
        roughness: 0.42,
        metalness: 0.06,
        transparent: true,
        opacity: 0.85,
        depthTest: true,
        depthWrite: false,
      }),
    );
    world.add(mesh);
    return { person, mesh };
  });
  writeLinks();
  tick();
}
buildPeople();

window.addEventListener("resize", () => {
  const w = stage.clientWidth;
  const h = Math.max(stage.clientHeight, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
