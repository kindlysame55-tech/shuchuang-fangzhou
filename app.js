import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const compactLayout = window.matchMedia('(max-width: 1024px)');
const mobileViewport = window.matchMedia('(max-width: 768px)');

/* -------------------------------------------------------------------------- */
/* 1. WebGL Scene, Renderer, Lighting & Environment                           */
/* -------------------------------------------------------------------------- */
const stageEl = document.getElementById('webgl-stage');
const canvasEl = document.getElementById('ark-canvas');
const stagePosterEl = document.getElementById('stage-poster');
const loaderOverlay = document.getElementById('loader-overlay');
const loaderTitle = document.getElementById('loader-title');
const loaderBarFill = document.getElementById('loader-bar-fill');
const loaderPercent = document.getElementById('loader-percent');
const hudHintText = document.getElementById('hud-hint-text');

function showStaticPreview(message) {
  stagePosterEl.classList.remove('is-hidden');
  loaderOverlay.classList.remove('is-hidden');
  loaderTitle.textContent = message;
  loaderBarFill.style.width = '100%';
  loaderPercent.textContent = '静态预览';
}

function createRenderer() {
  try {
    const webgl = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    webgl.outputColorSpace = THREE.SRGBColorSpace;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.08;
    return webgl;
  } catch (error) {
    console.warn('WebGL unavailable:', error);
    showStaticPreview('当前浏览器无法启动 3D');
    return null;
  }
}

const renderer = createRenderer();
const scene = new THREE.Scene();
scene.environmentIntensity = 0.68;
let environmentTarget;

function prepareEnvironment() {
  environmentTarget?.dispose();
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  environmentTarget = generator.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  room.dispose();
  generator.dispose();
}

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.05, 40);
camera.position.set(0.0, 0.62, 2.15);

// Studio + Botanical Greenhouse 3-point lighting
const hemiLight = new THREE.HemisphereLight(0xf6fbf5, 0x1a422b, 0.85);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfffdf5, 2.05);
keyLight.position.set(-1.8, 2.6, 2.4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xcff7ea, 0.95);
fillLight.position.set(2.2, 1.4, 1.8);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x7ad832, 1.65);
rimLight.position.set(0.2, 2.0, -2.5);
scene.add(rimLight);

const accentPoint = new THREE.PointLight(0x22d3ee, 0.0, 4.5, 1.6);
accentPoint.position.set(0.0, 0.55, -0.9);
scene.add(accentPoint);

/* -------------------------------------------------------------------------- */
/* 2. World Stage Group, Orbital Botanical Elements & Contact Shadow          */
/* -------------------------------------------------------------------------- */
const worldStageGroup = new THREE.Group();
scene.add(worldStageGroup);

// Mascot pivot sits at (0, 0.54, 0) in worldStageGroup so spins are centered
const mascotAnchor = new THREE.Group();
worldStageGroup.add(mascotAnchor);

// Contact shadow plane (soft radial canvas texture)
function createRadialTexture(innerHex, midHex, outerAlpha = 0) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, innerHex);
  g.addColorStop(0.55, midHex);
  g.addColorStop(1, `rgba(0,0,0,${outerAlpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const shadowMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.92, 0.92),
  new THREE.MeshBasicMaterial({
    map: createRadialTexture('rgba(9, 40, 20, 0.34)', 'rgba(14, 94, 34, 0.12)', 0),
    transparent: true,
    depthWrite: false,
  })
);
shadowMesh.rotation.x = -Math.PI / 2;
shadowMesh.position.y = -0.02;
worldStageGroup.add(shadowMesh);

// Botanical Ark Orbital Ring + Interactive Pulse Ripple
const ringGroup = new THREE.Group();
ringGroup.position.y = 0.02;
worldStageGroup.add(ringGroup);

const mainRingMat = new THREE.MeshBasicMaterial({
  color: 0x48b422,
  transparent: true,
  opacity: 0.38,
  side: THREE.DoubleSide,
});
const mainRing = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.422, 96), mainRingMat);
mainRing.rotation.x = -Math.PI / 2;
ringGroup.add(mainRing);

const outerRingMat = new THREE.MeshBasicMaterial({
  color: 0x0891b2,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
});
const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.50, 0.506, 96), outerRingMat);
outerRing.rotation.x = -Math.PI / 2;
ringGroup.add(outerRing);

const rippleRingMat = new THREE.MeshBasicMaterial({
  color: 0x7ad832,
  transparent: true,
  opacity: 0.0,
  side: THREE.DoubleSide,
});
const rippleRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.36, 72), rippleRingMat);
rippleRing.rotation.x = -Math.PI / 2;
rippleRing.position.y = 0.01;
worldStageGroup.add(rippleRing);

// Floating 3D Materialized Bio-Prisms & Leaf Nodes around the Mascot
const satellitesGroup = new THREE.Group();
worldStageGroup.add(satellitesGroup);

const satelliteItems = [];
const satConfigs = [
  { geo: new THREE.OctahedronGeometry(0.026, 0), color: 0x7ad832, radius: 0.50, y: 0.78, speed: 0.45, phase: 0.2 },
  { geo: new THREE.BoxGeometry(0.032, 0.032, 0.032), color: 0x22d3ee, radius: 0.54, y: 0.46, speed: -0.36, phase: 1.8 },
  { geo: new THREE.OctahedronGeometry(0.021, 0), color: 0x48b422, radius: 0.46, y: 0.24, speed: 0.52, phase: 3.1 },
  { geo: new THREE.IcosahedronGeometry(0.022, 0), color: 0xf4f0e2, radius: 0.52, y: 0.88, speed: -0.42, phase: 4.5 },
  { geo: new THREE.TetrahedronGeometry(0.024, 0), color: 0x58c428, radius: 0.48, y: 0.62, speed: 0.38, phase: 5.4 },
];

satConfigs.forEach((cfg) => {
  const mat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: 0.2,
    metalness: 0.15,
    emissive: cfg.color,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(cfg.geo, mat);
  satellitesGroup.add(mesh);
  satelliteItems.push({ mesh, mat, ...cfg });
});

/* -------------------------------------------------------------------------- */
/* 3. Load Mascot GLB & Register Chest Logo Prism Nodes                       */
/* -------------------------------------------------------------------------- */
let mascotModel = null;
let modelLoadFailed = false;
let contextLost = false;
let hideLoaderTimer = 0;
const logoNodes = []; // { mesh, mat, basePos, groupKey, depthOffset }
const logoGroups = {
  leaf: ['Logo_Leaf1', 'Logo_Leaf2'],
  s: ['Logo_S_Top', 'Logo_S_Mid', 'Logo_S_Bot', 'Logo_S_In'],
  f: ['Logo_F_Top', 'Logo_F_Vert', 'Logo_F_B1', 'Logo_F_B2', 'Logo_F_B3'],
  text: ['Chest_Text_ZH', 'Chest_Text_EN'],
};

const logoDepthMap = {
  Logo_Leaf1: 0.062,
  Logo_Leaf2: 0.056,
  Logo_S_Top: 0.044,
  Logo_F_Top: 0.044,
  Logo_S_Mid: 0.032,
  Logo_F_Vert: 0.032,
  Logo_S_In: 0.024,
  Logo_S_Bot: 0.022,
  Logo_F_B1: 0.024,
  Logo_F_B2: 0.022,
  Logo_F_B3: 0.020,
  Chest_Text_ZH: 0.018,
  Chest_Text_EN: 0.015,
};

function findLogoGroup(name) {
  for (const [key, list] of Object.entries(logoGroups)) {
    if (list.includes(name)) return key;
  }
  return null;
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./vendor/draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

function handleLoadedGltf(gltf) {
  mascotModel = gltf.scene;
  mascotModel.traverse((child) => {
    if (child.isMesh) {
      // Clone material per mesh for chest logo pieces so we can highlight independently
      const groupKey = findLogoGroup(child.name);
      if (groupKey) {
        child.material = child.material.clone();
        child.material.emissive?.setHex(0x58c428);
        logoNodes.push({
          mesh: child,
          mat: child.material,
          basePos: child.position.clone(),
          groupKey,
          depthOffset: logoDepthMap[child.name] || 0.03,
          extraBoost: 0,
        });
      }
      // Subtle clearcoat/gloss polish on ceramic surfaces
      if (child.material && child.material.roughness !== undefined) {
        child.material.envMapIntensity = 1.05;
      }
    }
  });

  mascotAnchor.add(mascotModel);
  dracoLoader.dispose();
  if (!contextLost) showLoadedModel();
}

function showLoadedModel() {
  stagePosterEl.classList.add('is-hidden');
  loaderTitle.textContent = '正在加载 3D 实体建模…';
  loaderBarFill.style.width = '100%';
  loaderPercent.textContent = '100%';
  clearTimeout(hideLoaderTimer);
  hideLoaderTimer = setTimeout(() => {
    loaderOverlay.classList.add('is-hidden');
  }, 160);
}

function loadMascot() {
  dracoLoader.preload();
  gltfLoader.load(
    './models/shuchuang_fangzhou_mascot_opt.glb',
    handleLoadedGltf,
    (xhr) => {
      if (contextLost) return;
      if (xhr.lengthComputable && xhr.total > 0) {
        const pct = Math.min(99, Math.round((xhr.loaded / xhr.total) * 100));
        loaderBarFill.style.width = `${pct}%`;
        loaderPercent.textContent = `${pct}%`;
      } else {
        loaderBarFill.style.width = '78%';
        loaderPercent.textContent = '快速解码中…';
      }
    },
    (error) => {
      console.warn('Optimized GLB fallback to source GLB:', error);
      gltfLoader.load('./models/shuchuang_fangzhou_mascot.glb', handleLoadedGltf, undefined, (fallbackError) => {
        console.warn('Failed to load GLB:', fallbackError);
        modelLoadFailed = true;
        dracoLoader.dispose();
        showStaticPreview('3D 模型加载失败，可刷新重试');
      });
    }
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Scroll-Driven Narrative State + Camera & Mascot Choreography            */
/* -------------------------------------------------------------------------- */
const scrollState = {
  stageX: 0.36,
  stageY: 0.0,
  stageScale: 1.0,
  camX: 0.0,
  camY: 0.60,
  camZ: 2.08,
  lookX: 0.0,
  lookY: 0.55,
  lookZ: 0.0,
  rotY: -0.34,
  rotX: 0.03,
  explode: 0.0,
  accentPointIntensity: 0.0,
};

let manualExplodeOverride = null; // number 0..1 when user drags slider
let activePartFilter = 'all';
let freeInspectMode = false;

const navLinks = document.querySelectorAll('.site-nav a');
const railItems = document.querySelectorAll('.rail-item');
let activeChapter;

function setActiveNavAndTheme(chapterId) {
  if (chapterId === activeChapter) return;
  activeChapter = chapterId;
  navLinks.forEach((a) => {
    a.classList.toggle('is-active', a.dataset.nav === chapterId);
  });
  railItems.forEach((r) => {
    r.classList.toggle('is-active', r.dataset.rail === chapterId);
  });

  if (chapterId === 'tech') {
    document.body.setAttribute('data-theme', 'greenhouse');
    scene.environmentIntensity = 0.55;
  } else if (chapterId === 'closing') {
    document.body.setAttribute('data-theme', 'ceramic');
    scene.environmentIntensity = 0.75;
  } else {
    document.body.setAttribute('data-theme', 'daylight');
    scene.environmentIntensity = 0.68;
  }
}

function getChapterPose(id, desktop) {
  switch (id) {
    case 'hero':
      return {
        stageX: desktop ? 0.48 : 0,
        stageY: desktop ? 0.0 : 0.38,
        camX: 0.0,
        camY: desktop ? 0.56 : 0.56,
        camZ: desktop ? 2.15 : 3.85,
        lookX: 0.0,
        lookY: desktop ? 0.54 : 0.56,
        lookZ: 0.0,
        rotY: -0.30,
        rotX: 0.03,
        explode: 0.0,
        accentPointIntensity: 0.0,
      };
    case 'emblem':
      return {
        stageX: desktop ? 0.16 : 0,
        stageY: desktop ? 0.0 : 0.14,
        camX: 0.0,
        camY: desktop ? 0.355 : 0.35,
        camZ: desktop ? 0.58 : 0.98,
        lookX: 0.0,
        lookY: desktop ? 0.352 : 0.33,
        lookZ: 0.18,
        rotY: -0.14,
        rotX: -0.02,
        explode: 0.98,
        accentPointIntensity: 0.15,
      };
    case 'tech':
      return {
        stageX: desktop ? 0.48 : 0,
        stageY: desktop ? 0.0 : 0.22,
        camX: 0.0,
        camY: desktop ? 0.52 : 0.50,
        camZ: desktop ? 1.92 : 3.10,
        lookX: 0.0,
        lookY: desktop ? 0.48 : 0.48,
        lookZ: 0.0,
        rotY: Math.PI * 0.86,
        rotX: 0.06,
        explode: 0.0,
        accentPointIntensity: 1.65,
      };
    case 'pavilion':
      return {
        stageX: desktop ? 0.48 : 0,
        stageY: desktop ? 0.0 : 0.22,
        camX: 0.0,
        camY: desktop ? 0.58 : 0.52,
        camZ: desktop ? 2.08 : 3.15,
        lookX: 0.0,
        lookY: desktop ? 0.54 : 0.50,
        lookZ: 0.0,
        rotY: Math.PI * 1.76,
        rotX: 0.02,
        explode: 0.12,
        accentPointIntensity: 0.25,
      };
    case 'scenarios':
      return {
        stageX: desktop ? -0.56 : 0,
        stageY: desktop ? 0.0 : 0.22,
        camX: 0.0,
        camY: desktop ? 0.58 : 0.52,
        camZ: desktop ? 2.22 : 3.20,
        lookX: 0.0,
        lookY: desktop ? 0.54 : 0.50,
        lookZ: 0.0,
        rotY: Math.PI * 2.18,
        rotX: 0.04,
        explode: 0.0,
        accentPointIntensity: 0.45,
      };
    case 'closing':
    default:
      return {
        stageX: desktop ? 0.44 : 0,
        stageY: desktop ? 0.0 : 0.22,
        camX: 0.0,
        camY: desktop ? 0.56 : 0.52,
        camZ: desktop ? 2.02 : 3.10,
        lookX: 0.0,
        lookY: desktop ? 0.54 : 0.50,
        lookZ: 0.0,
        rotY: Math.PI * 2.02,
        rotX: 0.0,
        explode: 0.0,
        accentPointIntensity: 0.0,
      };
  }
}

const chapterIds = ['hero', 'emblem', 'tech', 'pavilion', 'scenarios', 'closing'];
const chapters = chapterIds.map((id) => document.getElementById(id));
const desktopPoses = chapterIds.map((id) => getChapterPose(id, true));
const compactPoses = chapterIds.map((id) => getChapterPose(id, false));
const poseKeys = Object.keys(desktopPoses[0]);
const stops = new Array(chapters.length);

function updatePoseFromScroll(scrollY) {
  const height = window.innerHeight;
  const viewCenterY = scrollY + height * 0.45;
  let activeIndex = 0;
  for (let i = 0; i < chapters.length; i++) {
    const top = chapters[i].offsetTop;
    if (viewCenterY >= top) activeIndex = i;
    if (!prefersReducedMotion) stops[i] = top + Math.min(chapters[i].offsetHeight * 0.22, 180);
  }
  setActiveNavAndTheme(chapterIds[activeIndex]);
  const poses = compactLayout.matches ? compactPoses : desktopPoses;

  if (prefersReducedMotion) {
    Object.assign(scrollState, poses[activeIndex]);
    return;
  }

  const anchorY = scrollY + height * 0.35;

  let idx = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    if (anchorY >= stops[i]) idx = i;
  }

  const nextIdx = Math.min(stops.length - 1, idx + 1);
  const span = Math.max(1, stops[nextIdx] - stops[idx]);
  const rawT = idx === nextIdx ? 0 : THREE.MathUtils.clamp((anchorY - stops[idx]) / span, 0, 1);
  // Smoothstep easing for cinematic chapter transitions
  const t = rawT * rawT * (3 - 2 * rawT);

  const a = poses[idx];
  const b = poses[nextIdx];
  for (const key of poseKeys) {
    scrollState[key] = THREE.MathUtils.lerp(a[key], b[key], t);
  }
}

// Smooth anchor navigation
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const targetId = link.getAttribute('href');
    if (!targetId || targetId === '#') return;
    const el = document.querySelector(targetId);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Touch, Swipe & Pointer 3D Materialized Floating Physics                 */
/* -------------------------------------------------------------------------- */
const physics = {
  userRotY: 0,
  userRotX: 0,
  velY: 0,
  velX: 0,
  pointerNormX: 0,
  pointerNormY: 0,
  hopY: 0,
  hopVel: 0,
  tapExplodeBoost: 0,
  rippleProgress: 1.0, // >= 1 means inactive
};

let isDraggingStage = false;
let dragMoved = false;
let lastPX = 0;
let lastPY = 0;

function triggerMaterializedBounce(withBurst = true) {
  if (prefersReducedMotion) return;
  physics.hopVel = 0.019;
  physics.tapExplodeBoost = 0.72;
  if (withBurst) {
    physics.rippleProgress = 0.0;
  }
}

window.addEventListener(
  'pointermove',
  (e) => {
    physics.pointerNormX = (e.clientX / window.innerWidth) * 2 - 1;
    physics.pointerNormY = (e.clientY / window.innerHeight) * 2 - 1;
  },
  { passive: true }
);

stageEl.addEventListener('pointerdown', (e) => {
  // Ignore if user clicked an interactive DOM element above
  if (e.target !== canvasEl) return;
  isDraggingStage = true;
  dragMoved = false;
  lastPX = e.clientX;
  lastPY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (!isDraggingStage) return;
  const dx = e.clientX - lastPX;
  const dy = e.clientY - lastPY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;

  physics.velY += dx * 0.0022;
  physics.velX += dy * 0.0014;
  lastPX = e.clientX;
  lastPY = e.clientY;
});

window.addEventListener('pointerup', () => {
  if (!isDraggingStage) return;
  isDraggingStage = false;
  if (!dragMoved) {
    triggerMaterializedBounce(true);
  }
});

window.addEventListener('pointercancel', () => {
  isDraggingStage = false;
});

// Touch swipe support on mobile stage spacers so swiping left/right spins mascot cleanly
let touchStartX = 0;
let touchStartY = 0;
document.querySelectorAll('.stage-spacer').forEach((spacer) => {
  spacer.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );
  spacer.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy)) {
          physics.velY += dx * 0.0024;
        }
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );
});

/* -------------------------------------------------------------------------- */
/* 6. Interactive UI Controls (Emblem, Telemetry, Pavilion, Scenarios, Close) */
/* -------------------------------------------------------------------------- */
// Free Inspect Toggle
const freeInspectBtn = document.getElementById('toggle-free-inspect');
freeInspectBtn.addEventListener('click', () => {
  freeInspectMode = !freeInspectMode;
  freeInspectBtn.classList.toggle('is-active', freeInspectMode);
  freeInspectBtn.setAttribute('aria-pressed', String(freeInspectMode));
  stageEl.classList.toggle('is-free-inspect', freeInspectMode);
  hudHintText.textContent = freeInspectMode
    ? '已开启自由巡检 · 拖动任意旋转 3D 吉祥物 · 轻触触发悬浮跃动'
    : '拖拽旋转视角 · 轻触实体悬浮 · 滚动驱动叙事';
});

document.getElementById('hero-burst-btn').addEventListener('click', () => {
  triggerMaterializedBounce(true);
  physics.velY += 0.14;
});

// Chapter 1: Chest Emblem Explode Slider & Part Filter
const explodeSlider = document.getElementById('explode-slider');
const explodeValue = document.getElementById('explode-value');

explodeSlider.addEventListener('input', (e) => {
  const val = Number(e.target.value) / 100;
  manualExplodeOverride = val;
  explodeValue.textContent = `${Math.round(val * 45)} mm 立体悬浮`;
});

document.querySelectorAll('.part-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.part-pill').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    activePartFilter = btn.dataset.part;
    if (manualExplodeOverride === null || manualExplodeOverride < 0.35) {
      manualExplodeOverride = 0.75;
      explodeSlider.value = '75';
      explodeValue.textContent = '34 mm 立体悬浮';
    }
    triggerMaterializedBounce(false);
  });
});

// Chapter 2: Telemetry Presets & 4 Tech Pillars
const cropPresets = {
  leafy: { humidity: 65, light: 80, nutrient: 90, co2: '820 ppm', co2Pct: 72, rim: 0x7ad832, point: 0x22d3ee },
  berry: { humidity: 58, light: 92, nutrient: 86, co2: '960 ppm', co2Pct: 84, rim: 0x38bdf8, point: 0x7ad832 },
  ganoderma: { humidity: 85, light: 48, nutrient: 78, co2: '1180 ppm', co2Pct: 92, rim: 0x22d3ee, point: 0x34d399 },
};

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const p = cropPresets[btn.dataset.preset];
    document.getElementById('val-humidity').textContent = `${p.humidity}%`;
    document.getElementById('bar-humidity').style.width = `${p.humidity}%`;
    document.getElementById('val-light').textContent = `${p.light}%`;
    document.getElementById('bar-light').style.width = `${p.light}%`;
    document.getElementById('val-nutrient').textContent = `${p.nutrient}%`;
    document.getElementById('bar-nutrient').style.width = `${p.nutrient}%`;
    document.getElementById('val-co2').textContent = p.co2;
    document.getElementById('bar-co2').style.width = `${p.co2Pct}%`;

    rimLight.color.setHex(p.rim);
    accentPoint.color.setHex(p.point);
    triggerMaterializedBounce(true);
  });
});

document.querySelectorAll('.pillar-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.pillar-card').forEach((c) => c.classList.remove('is-active'));
    card.classList.add('is-active');
    physics.velY += 0.08;
  });
});

// Chapter 3: Pavilion 4-Face Interactive Prism (Swipe / Tab)
const pavilionFaces = [
  {
    badge: '智慧种植坊正面彩绘方案',
    headline: '数创方舟 · 智能机械臂与生态温室',
    desc: '主立面呈现透明智能温室中的立体水培菜畦、精密采摘机械臂与人形农艺助手，直观建立“未来农业展示窗口”的第一印象。',
    tags: ['智能采摘机械臂', '立体水培舱', '生态采摘体验'],
    gradient: 'linear-gradient(135deg, #063d3f 0%, #0b5f52 58%, #15803d 100%)',
  },
  {
    badge: '智慧种植坊东侧面彩绘方案',
    headline: '我在数创方舟等你 · 四维价值生活化',
    desc: '以立体种植塔架为中心，对称分布“趣科普、玩创意、乐生活、享健康”四大价值标签，面向访客传递绿色慢生活理念。',
    tags: ['趣科普', '玩创意', '乐生活', '享健康'],
    gradient: 'linear-gradient(135deg, #073b44 0%, #0e6456 58%, #3ca02a 100%)',
  },
  {
    badge: '智慧种植坊背面彩绘方案',
    headline: 'AI 智慧种植 · 全时感知与数字大脑',
    desc: '深海蓝绿科技墙面呈现 AI 脑机图谱与实时遥测仪表：湿度 65%、光照 80%、营养液 90%，与机械臂协同守护作物生长。',
    tags: ['湿度 65%', '光照 80%', '营养液 90%', 'AI 闭环决策'],
    gradient: 'linear-gradient(135deg, #052630 0%, #0a4950 58%, #0891b2 100%)',
  },
  {
    badge: '智慧种植坊西侧面彩绘方案',
    headline: '未来农业的智慧方舟 · 四大技术承诺',
    desc: '以多层智能栽培柜为主视觉，将“慧种植、慧调控、可节能、可追溯”四大技术承诺与实体舱体融为一体。',
    tags: ['慧种植', '慧调控', '可节能', '可追溯'],
    gradient: 'linear-gradient(135deg, #0a3c2d 0%, #11663b 58%, #48b422 100%)',
  },
];

let currentPavIndex = 0;
const pavCard = document.getElementById('pavilion-face-card');
const pavStage = document.getElementById('pavilion-stage');

function renderPavilionFace(index, direction = 1) {
  currentPavIndex = (index + pavilionFaces.length) % pavilionFaces.length;
  const data = pavilionFaces[currentPavIndex];
  document.querySelectorAll('.pav-tab').forEach((t, idx) => {
    t.classList.toggle('is-active', idx === currentPavIndex);
  });

  if (!prefersReducedMotion) {
    pavCard.style.transform = `rotateY(${direction * 14}deg) translateZ(18px) scale(0.98)`;
    setTimeout(() => {
      pavCard.style.transform = 'rotateY(0deg) translateZ(0px) scale(1)';
    }, 180);
  }

  pavCard.style.background = data.gradient;
  document.getElementById('pav-badge').textContent = data.badge;
  document.getElementById('pav-headline').textContent = data.headline;
  document.getElementById('pav-desc').textContent = data.desc;
  document.getElementById('pav-tags').innerHTML = data.tags.map((t) => `<span>${t}</span>`).join('');
}

document.querySelectorAll('.pav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const idx = Number(tab.dataset.face);
    renderPavilionFace(idx, idx >= currentPavIndex ? 1 : -1);
  });
});

let pavStartX = 0;
pavStage.addEventListener('pointerdown', (e) => {
  pavStartX = e.clientX;
});
pavStage.addEventListener('pointerup', (e) => {
  const dx = e.clientX - pavStartX;
  if (Math.abs(dx) > 36) {
    renderPavilionFace(currentPavIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }
});

// Chapter 4: 4 Application Scenarios -> Live WebGL Atmosphere Mood
const scenarioMoods = {
  rural: { ring: 0x48b422, outer: 0x7ad832, rim: 0x7ad832, rotOffset: 0.0 },
  park: { ring: 0x0891b2, outer: 0x22d3ee, rim: 0x22d3ee, rotOffset: 0.45 },
  university: { ring: 0x10b981, outer: 0x38bdf8, rim: 0x34d399, rotOffset: -0.45 },
  ocean: { ring: 0x0284c7, outer: 0x22d3ee, rim: 0x38bdf8, rotOffset: 0.78 },
};

document.querySelectorAll('.scenario-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.scenario-card').forEach((c) => c.classList.remove('is-active'));
    card.classList.add('is-active');
    const m = scenarioMoods[card.dataset.scenario];
    mainRingMat.color.setHex(m.ring);
    outerRingMat.color.setHex(m.outer);
    rimLight.color.setHex(m.rim);
    physics.velY += (m.rotOffset - physics.userRotY) * 0.08 + 0.06;
    triggerMaterializedBounce(true);
  });
});

// Chapter 5: Playground Controls
let isClosingExploded = false;
document.getElementById('pg-bounce').addEventListener('click', () => {
  triggerMaterializedBounce(true);
});

document.getElementById('pg-explode').addEventListener('click', () => {
  isClosingExploded = !isClosingExploded;
  manualExplodeOverride = isClosingExploded ? 0.95 : 0.0;
  explodeSlider.value = isClosingExploded ? '95' : '0';
  explodeValue.textContent = isClosingExploded ? '43 mm 立体悬浮' : '0 mm 闭合状态';
  triggerMaterializedBounce(true);
});

document.getElementById('pg-spin').addEventListener('click', () => {
  physics.velY += 0.24;
  triggerMaterializedBounce(false);
});

document.getElementById('pg-reset').addEventListener('click', () => {
  manualExplodeOverride = null;
  isClosingExploded = false;
  explodeValue.textContent = '自动叙事驱动';
  gsap.to(physics, {
    userRotY: 0,
    userRotX: 0,
    velY: 0,
    velX: 0,
    duration: 0.9,
    ease: 'power3.out',
  });
});

/* -------------------------------------------------------------------------- */
/* 7. DOM Card 3D Materialized Floating Physics (Hover & Touch Slide)         */
/* -------------------------------------------------------------------------- */
function bindMaterializedCards() {
  if (prefersReducedMotion) return;

  document.querySelectorAll('[data-float-card]').forEach((card) => {
    const rotXTo = gsap.quickTo(card, 'rotationX', { duration: 0.45, ease: 'power3.out' });
    const rotYTo = gsap.quickTo(card, 'rotationY', { duration: 0.45, ease: 'power3.out' });
    const yTo = gsap.quickTo(card, 'y', { duration: 0.45, ease: 'power3.out' });
    const scaleTo = gsap.quickTo(card, 'scale', { duration: 0.45, ease: 'power3.out' });

    gsap.set(card, { transformPerspective: 950, transformStyle: 'preserve-3d' });

    const updateLevitation = (clientX, clientY) => {
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;

      card.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
      card.classList.add('is-levitating');

      rotYTo((nx - 0.5) * 8.5);
      rotXTo((0.5 - ny) * 8.5);
      yTo(-5);
      scaleTo(1.012);
    };

    const settleCard = () => {
      card.classList.remove('is-levitating');
      rotXTo(0);
      rotYTo(0);
      yTo(0);
      scaleTo(1);
    };

    card.addEventListener('pointermove', (e) => updateLevitation(e.clientX, e.clientY));
    card.addEventListener('pointerleave', settleCard);
    card.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches[0]) updateLevitation(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    card.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) updateLevitation(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    card.addEventListener('touchend', settleCard, { passive: true });
  });
}

bindMaterializedCards();

/* -------------------------------------------------------------------------- */
/* 8. Main Animation Loop (WebGL Render + Physical Floating)                  */
/* -------------------------------------------------------------------------- */
const currentLookAt = new THREE.Vector3(0, 0.55, 0);
const target = new THREE.Vector3();
const clock = new THREE.Clock();
let lastObservedScrollY = -1;
let poseNeedsUpdate = true;
let rafId = 0;

function requestFrame() {
  if (!rafId && !document.hidden) rafId = requestAnimationFrame(animate);
}

function updateOnNextFrame() {
  poseNeedsUpdate = true;
  requestFrame();
}

function pauseRendering() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  if (clock.running) clock.stop();
}

function animate() {
  rafId = 0;
  if (document.hidden) return;

  const scrollY = window.scrollY;
  if (poseNeedsUpdate || lastObservedScrollY !== scrollY) {
    lastObservedScrollY = scrollY;
    poseNeedsUpdate = false;
    updatePoseFromScroll(scrollY);
  }

  if (!renderer || contextLost) return;
  requestFrame();
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const camAlpha = 1 - Math.exp(-9.0 * Math.min(rawDt, 0.35));
  const t = clock.elapsedTime;

  // 1. Update drag inertia & spring return (only return gently when not in Free Inspect)
  physics.userRotY += physics.velY;
  physics.userRotX += physics.velX;
  physics.velY *= 0.91;
  physics.velX *= 0.91;
  physics.userRotX = THREE.MathUtils.clamp(physics.userRotX, -0.42, 0.42);

  if (!isDraggingStage && !freeInspectMode) {
    physics.userRotY *= 0.965;
    physics.userRotX *= 0.94;
  }

  // 2. Buoyant vertical hop spring physics on tap/click
  const springK = -0.14;
  const damping = 0.84;
  physics.hopVel += physics.hopY * springK;
  physics.hopVel *= damping;
  physics.hopY += physics.hopVel;
  physics.tapExplodeBoost *= 0.92;

  // 3. Expanding bio-spore ripple ring
  if (physics.rippleProgress < 1.0) {
    physics.rippleProgress += dt * 1.35;
    const s = 1.0 + physics.rippleProgress * 1.45;
    rippleRing.scale.set(s, s, 1);
    rippleRingMat.opacity = (1.0 - physics.rippleProgress) * 0.55;
  } else {
    rippleRingMat.opacity = 0;
  }

  // 4. Harmonic anti-gravity levitation + pointer magnetic tilt
  const idleFloatY = prefersReducedMotion ? 0 : Math.sin(t * 1.65) * 0.022;
  const pointerTiltY = prefersReducedMotion ? 0 : physics.pointerNormX * 0.14;
  const pointerTiltX = prefersReducedMotion ? 0 : physics.pointerNormY * 0.08;

  worldStageGroup.position.x = THREE.MathUtils.lerp(worldStageGroup.position.x, scrollState.stageX, camAlpha);
  worldStageGroup.position.y = THREE.MathUtils.lerp(worldStageGroup.position.y, scrollState.stageY, camAlpha);

  mascotAnchor.position.y = idleFloatY + physics.hopY;
  mascotAnchor.rotation.y = scrollState.rotY + physics.userRotY + pointerTiltY;
  mascotAnchor.rotation.x = scrollState.rotX + physics.userRotX + pointerTiltX;

  // Dynamic contact shadow & botanical floor rings inversely respond to float height
  const heightNorm = Math.max(0, idleFloatY + physics.hopY);
  const shadowScale = 1.0 - heightNorm * 2.2;
  shadowMesh.scale.set(shadowScale, shadowScale, 1);
  mainRing.rotation.z = t * 0.18;
  outerRing.rotation.z = -t * 0.12;

  // 5. Orbiting 3D Bio-Prism Satellites with pointer parallax
  satelliteItems.forEach((item, idx) => {
    const angle = t * item.speed + item.phase + physics.pointerNormX * 0.35;
    const r = item.radius + Math.sin(t * 1.2 + idx) * 0.025;
    item.mesh.position.set(
      Math.cos(angle) * r,
      item.y + Math.sin(t * 1.8 + item.phase) * 0.035 - physics.pointerNormY * 0.04,
      Math.sin(angle) * r * 0.72
    );
    item.mesh.rotation.x = t * 0.7 + idx;
    item.mesh.rotation.y = t * 0.9;
  });

  // 6. Chest Logo 3D Materialized Relief Explode & Highlight
  const targetExplode =
    manualExplodeOverride !== null
      ? Math.min(1.25, manualExplodeOverride + physics.tapExplodeBoost * 0.35)
      : Math.min(1.25, scrollState.explode + physics.tapExplodeBoost);

  logoNodes.forEach((node, idx) => {
    const isMatch = activePartFilter === 'all' || node.groupKey === activePartFilter;
    const partMultiplier = activePartFilter !== 'all' && isMatch ? 1.45 : isMatch ? 1.0 : 0.25;
    const wave = targetExplode > 0.15 && !prefersReducedMotion ? Math.sin(t * 2.4 + idx * 0.55) * 0.0022 : 0;
    const zFloat = targetExplode * node.depthOffset * partMultiplier + wave;

    node.mesh.position.z = THREE.MathUtils.lerp(node.mesh.position.z, node.basePos.z + zFloat, camAlpha);

    if (node.mat && node.mat.emissive) {
      const targetEmissive = activePartFilter !== 'all' && isMatch ? 0.45 : targetExplode * 0.12;
      node.mat.emissiveIntensity = THREE.MathUtils.lerp(node.mat.emissiveIntensity || 0, targetEmissive, camAlpha);
    }
  });

  // 7. Camera & Accent Point Light
  camera.position.lerp(target.set(scrollState.camX, scrollState.camY, scrollState.camZ), camAlpha);
  currentLookAt.lerp(target.set(scrollState.lookX, scrollState.lookY, scrollState.lookZ), camAlpha);
  camera.lookAt(currentLookAt);
  accentPoint.intensity = THREE.MathUtils.lerp(accentPoint.intensity, scrollState.accentPointIntensity, camAlpha);

  renderer.render(scene, camera);
}

/* -------------------------------------------------------------------------- */
/* 9. Resize Handling                                                         */
/* -------------------------------------------------------------------------- */
let renderWidth = 0;
let renderHeight = 0;
let renderRatio = 0;

function updateViewport() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, mobileViewport.matches ? 1.25 : 1.5);
  if (width === renderWidth && height === renderHeight && ratio === renderRatio) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (renderer) {
    if (ratio !== renderRatio) renderer.setPixelRatio(ratio);
    renderer.setSize(width, height);
  }
  renderWidth = width;
  renderHeight = height;
  renderRatio = ratio;
}

if (renderer) {
  canvasEl.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    pauseRendering();
    clearTimeout(hideLoaderTimer);
    showStaticPreview('3D 画面暂时中断，正在等待恢复');
  });

  canvasEl.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    prepareEnvironment();
    if (mascotModel) {
      showLoadedModel();
    } else if (modelLoadFailed) {
      showStaticPreview('3D 模型加载失败，可刷新重试');
    } else {
      loaderTitle.textContent = '正在加载 3D 实体建模…';
      loaderBarFill.style.width = '0%';
      loaderPercent.textContent = '0%';
    }
    if (!document.hidden) clock.start();
    updateOnNextFrame();
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseRendering();
  } else {
    if (renderer && !contextLost) clock.start();
    updateOnNextFrame();
  }
});

ScrollTrigger.create({
  trigger: '#main-content',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: updateOnNextFrame,
});
window.addEventListener('scroll', updateOnNextFrame, { passive: true });

let resizeTimer = null;
window.addEventListener('resize', () => {
  updateViewport();
  updateOnNextFrame();

  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    ScrollTrigger.refresh();
  }, 120);
});

updateViewport();
if (renderer) {
  loadMascot();
  prepareEnvironment();
}
cancelAnimationFrame(rafId);
animate();
