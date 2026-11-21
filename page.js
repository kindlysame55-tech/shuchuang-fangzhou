const $ = (id) => document.getElementById(id);
const compact = matchMedia('(max-width: 1024px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const chapters = [...document.querySelectorAll('[data-chapter]')];
const stages = new Map([...document.querySelectorAll('[data-stage]')].map((stage) => [stage.dataset.stage, stage]));
const stageRoot = $('webgl-stage');
const canvas = $('ark-canvas');
const header = document.querySelector('.site-header');
const menu = $('chapter-menu');
const inspectButton = $('toggle-free-inspect');
const heroButton = $('hero-burst-btn');
const loadButtons = [...document.querySelectorAll('.scene-start')];
const modelControls = [...document.querySelectorAll('.control-card button, .control-card input, .playground-actions button')];
const activeLinks = [...document.querySelectorAll('[data-nav], [data-rail]')];
const themes = { tech: 'greenhouse', closing: 'ceramic' };

let scene;
let pendingScene;
let chapter = '';
let metrics = [];
let viewFrame = 0;
let currentSurface;
let lastPose = '';
let inspect = false;
let explode = null;
let part = 'all';
let crop = 'leafy';
let scenario = 'rural';
let closingExploded = false;
let drag;

function setMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  header.classList.toggle('is-menu-open', open);
}

menu.hidden = false;
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
$('chapter-nav').addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link || !compact.matches) return;
  const target = $(link.dataset.nav);
  setMenu(false);
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
});
document.addEventListener('click', (event) => {
  if (!header.contains(event.target)) setMenu(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menu.focus();
  }
});

function updateView() {
  viewFrame = 0;
  const scrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  const isCompact = compact.matches;
  const midpoint = scrollY + viewportHeight * 0.43;
  let index = 0;
  for (let i = 1; i < metrics.length; i++) {
    if (midpoint >= metrics[i].top) index = i;
  }
  const active = metrics[index].id;
  if (active !== chapter) {
    chapter = active;
    activeLinks.forEach((link) => {
      const selected = (link.dataset.nav || link.dataset.rail) === active;
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  const theme = isCompact ? 'daylight' : themes[active] || 'daylight';
  if (document.body.dataset.theme !== theme) document.body.dataset.theme = theme;
  if (!scene) return;

  const surface = isCompact ? stages.get(active) : stageRoot;
  const switchedSurface = surface !== currentSurface;
  if (switchedSurface) {
    surface.prepend(canvas);
    currentSurface = surface;
    scene.setLayout(isCompact);
  }
  const bounds = surface.getBoundingClientRect();
  const visible = !isCompact || (bounds.bottom > header.offsetHeight && bounds.top < viewportHeight);
  scene.setVisible(visible);
  scene.setSize(Math.round(bounds.width), Math.round(bounds.height));

  let start = metrics[index];
  let end = start;
  let progress = 0;
  if (!isCompact && !reducedMotion.matches && !inspect) {
    const anchor = scrollY + viewportHeight * 0.35;
    const next = metrics.findIndex((item) => item.stop > anchor);
    if (next > 0) {
      start = metrics[next - 1];
      end = metrics[next];
      const fraction = (anchor - start.stop) / (end.stop - start.stop);
      progress = fraction * fraction * (3 - 2 * fraction);
    } else {
      start = next === 0 ? metrics[0] : metrics.at(-1);
      end = start;
    }
  }
  const pose = [start.id, end.id, progress, isCompact].join(':');
  if (pose !== lastPose || switchedSurface) {
    lastPose = pose;
    scene.setView(start.id, end.id, progress, switchedSurface);
  }
}

function queueView() {
  if (!viewFrame) viewFrame = requestAnimationFrame(updateView);
}

function measure() {
  metrics = chapters.map((section) => ({
    id: section.dataset.chapter,
    top: section.offsetTop,
    stop: section.offsetTop + Math.min(section.offsetHeight * 0.22, 180),
  }));
  if (!compact.matches) setMenu(false);
  queueView();
}

measure();
window.addEventListener('scroll', queueView, { passive: true });
window.addEventListener('resize', measure);
if ('ResizeObserver' in window) new ResizeObserver(measure).observe($('main-content'));

function setSceneState(state, message = '') {
  document.body.dataset.scene = state;
  $('scene-status').textContent = message;
  const ready = state === 'ready';
  const loading = state === 'loading';
  const label = loading ? '加载 3D 中…' : state === 'failed' ? '重试 3D' : '加载 3D';
  loadButtons.forEach((button) => {
    button.hidden = ready;
    button.disabled = loading;
    button.textContent = label;
  });
  heroButton.hidden = false;
  heroButton.disabled = loading;
  heroButton.textContent = ready ? '轻触悬浮' : label;
  inspectButton.hidden = false;
  inspectButton.disabled = loading;
  modelControls.forEach((control) => { control.disabled = !ready; });
}

function loadScene() {
  if (scene) return Promise.resolve(scene);
  if (pendingScene) return pendingScene;
  setSceneState('loading', '正在加载 3D 模型');
  const useCompactModel = compact.matches;
  const modelPath = useCompactModel ? './models/shuchuang_fangzhou_mascot_mobile.glb' : './models/shuchuang_fangzhou_mascot_opt.glb';
  const modelBytes = fetch(new URL(modelPath, import.meta.url)).then((response) => {
    if (!response.ok) throw new Error('3D model request failed (' + response.status + ')');
    return response.arrayBuffer();
  });
  pendingScene = Promise.all([import('./app.js?v=2'), modelBytes])
    .then(([{ createScene }, bytes]) => createScene(canvas, bytes, useCompactModel, reducedMotion.matches))
    .then((model) => {
      scene = model;
      updateView();
      scene.setExplode(explode, part);
      applyCrop();
      if (scenario !== 'rural') scene.setScenario(scenario, false);
      scene.setInspect(inspect);
      scene.draw();
      setSceneState('ready', '3D 模型已就绪');
      return model;
    })
    .catch((error) => {
      console.warn('3D preview fallback', error);
      scene?.dispose();
      scene = undefined;
      currentSurface = undefined;
      setSceneState('failed', '3D 加载失败。当前显示静态预览，可点按重试。');
    })
    .finally(() => { pendingScene = undefined; });
  return pendingScene;
}

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  if (!scene) return;
  scene.dispose();
  scene = undefined;
  currentSurface = undefined;
  setSceneState('failed', '3D 画面已暂停。可点按重试。');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) scene?.pause();
  else { queueView(); scene?.resume(); }
});

function setInspect(value) {
  inspect = value;
  inspectButton.classList.toggle('is-active', value);
  inspectButton.setAttribute('aria-pressed', String(value));
  stageRoot.classList.toggle('is-free-inspect', value);
  $('hud-hint-text').textContent = value ? '自由巡检 · 拖动旋转 · 轻触跃动' : '拖动旋转 · 轻触跃动';
  scene?.setInspect(value);
  queueView();
}

inspectButton.addEventListener('click', async () => {
  if (!await loadScene()) return;
  setInspect(!inspect);
  if (inspect && compact.matches) {
    stages.get(chapter).scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }
});
heroButton.addEventListener('click', async () => (await loadScene())?.bounce());
loadButtons.forEach((button) => button.addEventListener('click', loadScene));

canvas.addEventListener('pointerdown', (event) => {
  if (!scene || !event.isPrimary || event.button !== 0) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  canvas.setPointerCapture(event.pointerId);
  scene.setDragging(true);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== drag?.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
  if (!drag.moved && event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) return;
  drag.moved = true;
  drag.x = event.clientX;
  drag.y = event.clientY;
  scene?.drag(dx, dy);
});
function endDrag(event) {
  if (event.pointerId !== drag?.id) return;
  if (event.type === 'pointerup' && !drag.moved) scene?.bounce();
  drag = undefined;
  scene?.setDragging(false);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);
window.addEventListener('pointermove', (event) => {
  if (scene && event.pointerType === 'mouse' && !compact.matches) {
    scene.point(event.clientX / window.innerWidth * 2 - 1, event.clientY / window.innerHeight * 2 - 1);
  }
}, { passive: true });

function bindChoices(selector, onSelect) {
  const buttons = [...document.querySelectorAll(selector)];
  function select(button) {
    buttons.forEach((option) => {
      option.classList.toggle('is-active', option === button);
      option.setAttribute('aria-pressed', String(option === button));
    });
  }
  select(buttons.find((button) => button.classList.contains('is-active')));
  buttons.forEach((button) => button.addEventListener('click', () => {
    select(button);
    onSelect(button);
  }));
  return select;
}

const slider = $('explode-slider');
function updateExplode(value, filter = part) {
  explode = value;
  part = filter;
  slider.value = String(Math.round((value ?? 0.65) * 100));
  $('explode-value').textContent = value === null ? '自动叙事驱动' : Math.round(value * 45) + ' mm';
  scene?.setExplode(explode, part);
}
slider.addEventListener('input', () => updateExplode(Number(slider.value) / 100));
const selectPart = bindChoices('.part-pill', (button) => {
  updateExplode(Math.max(0.35, explode ?? 0.75), button.dataset.part);
  scene?.bounce(false);
});

const presets = {
  leafy: { humidity: 65, light: 80, nutrient: 90, co2: 820, co2Pct: 72, rim: 0x7ad832, point: 0x22d3ee },
  berry: { humidity: 58, light: 92, nutrient: 86, co2: 960, co2Pct: 84, rim: 0x38bdf8, point: 0x7ad832 },
  ganoderma: { humidity: 85, light: 48, nutrient: 78, co2: 1180, co2Pct: 92, rim: 0x22d3ee, point: 0x34d399 },
};

function applyCrop() {
  const preset = presets[crop];
  scene?.setLights(preset.rim, preset.point);
}

bindChoices('.preset-btn', (button) => {
  crop = button.dataset.preset;
  const preset = presets[crop];
  for (const metric of ['humidity', 'light', 'nutrient']) {
    $('val-' + metric).textContent = preset[metric] + '%';
    $('bar-' + metric).style.setProperty('--fill', preset[metric] / 100);
  }
  $('val-co2').textContent = preset.co2 + ' ppm';
  $('bar-co2').style.setProperty('--fill', preset.co2Pct / 100);
  applyCrop();
  scene?.bounce(false);
});
bindChoices('.pillar-card', () => scene?.bounce(false));
bindChoices('.scenario-card', (button) => {
  scenario = button.dataset.scenario;
  scene?.setScenario(scenario);
  scene?.bounce();
});

$('pg-bounce').addEventListener('click', () => scene?.bounce());
$('pg-explode').addEventListener('click', () => {
  closingExploded = !closingExploded;
  updateExplode(closingExploded ? 0.95 : 0);
  $('pg-explode').setAttribute('aria-pressed', String(closingExploded));
});
$('pg-spin').addEventListener('click', () => {
  setInspect(true);
  scene?.spin();
});
$('pg-reset').addEventListener('click', () => {
  closingExploded = false;
  $('pg-explode').setAttribute('aria-pressed', 'false');
  updateExplode(null, 'all');
  selectPart(document.querySelector('[data-part="all"]'));
  scene?.reset();
});

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

let currentFace = 0;
const pavilion = $('pavilion-stage');
const faceCard = $('pavilion-face-card');
const faceButtons = [...document.querySelectorAll('.pav-tab')];
const selectFace = bindChoices('.pav-tab', (button) => showFace(Number(button.dataset.face)));

function showFace(index) {
  const next = (index + pavilionFaces.length) % pavilionFaces.length;
  const face = pavilionFaces[next];
  selectFace(faceButtons[next]);
  if (next !== currentFace && !reducedMotion.matches) {
    faceCard.getAnimations().forEach((animation) => animation.cancel());
    const direction = index > currentFace ? 1 : -1;
    faceCard.animate([
      { transform: 'rotateY(' + direction * 9 + 'deg)', opacity: 0.88 },
      { transform: 'rotateY(0)', opacity: 1 },
    ], { duration: 230, easing: 'ease-out' });
  }
  currentFace = next;
  faceCard.style.background = face.gradient;
  $('pav-badge').textContent = face.badge;
  $('pav-headline').textContent = face.headline;
  $('pav-desc').textContent = face.desc;
  $('pav-tags').replaceChildren(...face.tags.map((tag) => {
    const span = document.createElement('span');
    span.textContent = tag;
    return span;
  }));
}

let swipe;
pavilion.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  pavilion.setPointerCapture(event.pointerId);
});
pavilion.addEventListener('pointerup', (event) => {
  if (event.pointerId !== swipe?.id) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) showFace(currentFace + (dx < 0 ? 1 : -1));
  swipe = undefined;
});
pavilion.addEventListener('pointercancel', () => { swipe = undefined; });
pavilion.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  showFace(currentFace + (event.key === 'ArrowRight' ? 1 : -1));
});

if (matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1025px)').matches && !reducedMotion.matches) {
  document.querySelectorAll('[data-float-card]').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      card.style.setProperty('--mx', x * 100 + '%');
      card.style.setProperty('--my', y * 100 + '%');
      card.style.setProperty('--rx', (0.5 - y) * 7 + 'deg');
      card.style.setProperty('--ry', (x - 0.5) * 7 + 'deg');
      card.classList.add('is-levitating');
    });
    card.addEventListener('pointerleave', () => card.classList.remove('is-levitating'));
  });
}

setSceneState('preview');
const connection = navigator.connection;
const deferForData = connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
if (location.protocol !== 'file:' && !deferForData && !reducedMotion.matches) {
  const afterPageLoad = () => {
    const start = () => {
      if (document.hidden) {
        document.addEventListener('visibilitychange', start, { once: true });
      } else if (document.body.dataset.scene === 'preview') {
        loadScene();
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 250);
  };
  if (document.readyState === 'complete') afterPageLoad();
  else window.addEventListener('load', afterPageLoad, { once: true });
}
