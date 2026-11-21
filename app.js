import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export async function createScene(canvas, compact, reducedMotion) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !compact,
    alpha: true,
    powerPreference: compact ? 'low-power' : 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const decoder = new DRACOLoader();
  decoder.setDecoderPath(new URL('./vendor/draco/', import.meta.url).href);
  decoder.setWorkerLimit(compact ? 1 : 2);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const modelName = compact ? 'shuchuang_fangzhou_mascot_mobile.glb' : 'shuchuang_fangzhou_mascot_opt.glb';
  let model;
  try {
    const gltf = await loader.loadAsync(new URL('./models/' + modelName, import.meta.url).href);
    model = gltf.scene;
  } catch (error) {
    renderer.dispose();
    throw error;
  } finally {
    decoder.dispose();
  }

  const scene = new THREE.Scene();

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.68;
  roomEnv.dispose();
  pmremGenerator.dispose();

  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 40);
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

  model.traverse((child) => {
    if (!child.isMesh) return;
    const groupKey = findLogoGroup(child.name);
    if (groupKey) {
      child.material = child.material.clone();
      child.material.emissive.setHex(0x58c428);
      logoNodes.push({
        mesh: child,
        mat: child.material,
        basePos: child.position.clone(),
        groupKey,
        depthOffset: logoDepthMap[child.name] || 0.03,
      });
    }
    child.material.envMapIntensity = 1.05;
  });
  mascotAnchor.add(model);

  function getChapterPose(id) {
    const desktop = !compact;
    switch (id) {
      case 'hero':
        return {
          stageX: desktop ? 0.48 : 0,
          stageY: 0,
          camX: 0.0,
          camY: desktop ? 0.56 : 0.56,
          camZ: desktop ? 2.15 : 2.34,
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
          stageY: 0,
          camX: 0.0,
          camY: desktop ? 0.355 : 0.35,
          camZ: desktop ? 0.58 : 0.89,
          lookX: 0.0,
          lookY: desktop ? 0.352 : 0.38,
          lookZ: 0.18,
          rotY: -0.14,
          rotX: -0.02,
          explode: 0.98,
          accentPointIntensity: 0.15,
        };
      case 'tech':
        return {
          stageX: desktop ? 0.48 : 0,
          stageY: 0,
          camX: 0.0,
          camY: desktop ? 0.52 : 0.50,
          camZ: desktop ? 1.92 : 2.20,
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
          stageY: 0,
          camX: 0.0,
          camY: desktop ? 0.58 : 0.52,
          camZ: desktop ? 2.08 : 2.20,
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
          stageY: 0,
          camX: 0.0,
          camY: desktop ? 0.58 : 0.52,
          camZ: desktop ? 2.22 : 2.20,
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
          stageY: 0,
          camX: 0.0,
          camY: desktop ? 0.56 : 0.52,
          camZ: desktop ? 2.02 : 2.20,
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

  const scenarioMoods = {
    rural: { ring: 0x48b422, outer: 0x7ad832, rim: 0x7ad832, rotOffset: 0.0 },
    park: { ring: 0x0891b2, outer: 0x22d3ee, rim: 0x22d3ee, rotOffset: 0.45 },
    university: { ring: 0x10b981, outer: 0x38bdf8, rim: 0x34d399, rotOffset: -0.45 },
    ocean: { ring: 0x0284c7, outer: 0x22d3ee, rim: 0x38bdf8, rotOffset: 0.78 },
  };

  let pose = getChapterPose('hero');
  let explode = null;
  let part = 'all';
  let inspect = false;
  let dragging = false;
  let visible = false;
  let frame = 0;
  let lastTime = 0;
  let motionUntil = 0;
  let time = 0;
  let size = '';
  let spinY = 0;
  let spinX = 0;
  let velocityY = 0;
  let velocityX = 0;
  let pointerX = 0;
  let pointerY = 0;
  let hopY = 0;
  let hopVelocity = 0;
  let tapExplode = 0;
  let ripple = 1;
  let resetting = false;
  let spinTarget = null;
  const currentLook = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const targetCamera = new THREE.Vector3();
  const lerp = THREE.MathUtils.lerp;
  function schedule() {
    if (visible && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }

  function wake(duration = 900) {
    motionUntil = Math.max(motionUntil, performance.now() + duration);
    schedule();
  }

  function render(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    if (compact && lastTime && now - lastTime < 30) {
      schedule();
      return;
    }

    const animateIdle = !compact && !reducedMotion;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.04) : 1 / 60;
    const step = dt * 60;
    const alpha = 1 - Math.exp(-12 * dt);
    lastTime = now;
    time += dt;

    spinY += velocityY * step;
    spinX = THREE.MathUtils.clamp(spinX + velocityX * step, -0.42, 0.42);
    velocityY *= 0.91 ** step;
    velocityX *= 0.91 ** step;
    if (resetting || (!dragging && !inspect && spinTarget === null)) {
      spinY *= 0.94 ** step;
      spinX *= 0.90 ** step;
    }
    if (spinTarget !== null) {
      spinY = lerp(spinY, spinTarget, alpha * 0.36);
      if (Math.abs(spinY - spinTarget) < 0.01) spinTarget = null;
    }
    hopVelocity = (hopVelocity - hopY * 0.14 * step) * 0.84 ** step;
    hopY += hopVelocity * step;
    tapExplode *= 0.92 ** step;
    ripple = Math.min(1, ripple + dt * 1.35);
    const ringScale = 1 + ripple * 1.45;
    rippleRing.visible = ripple < 1;
    rippleRing.scale.set(ringScale, ringScale, 1);
    rippleRingMat.opacity = (1 - ripple) * 0.55;

    const idleY = animateIdle ? Math.sin(time * 1.65) * 0.022 : 0;
    worldStageGroup.position.x = lerp(worldStageGroup.position.x, pose.stageX, alpha);
    worldStageGroup.position.y = lerp(worldStageGroup.position.y, pose.stageY, alpha);
    mascotAnchor.position.y = idleY + hopY;
    mascotAnchor.rotation.y = pose.rotY + spinY + pointerX * 0.14;
    mascotAnchor.rotation.x = pose.rotX + spinX + pointerY * 0.08;
    const shadowScale = Math.max(0.1, 1 - Math.max(0, idleY + hopY) * 2.2);
    shadowMesh.scale.set(shadowScale, shadowScale, 1);

    const orbitTime = animateIdle ? time : 0;
    satelliteItems.forEach((item, index) => {
      const angle = orbitTime * item.speed + item.phase + pointerX * 0.35;
      const radius = item.radius + Math.sin(orbitTime * 1.2 + index) * 0.025;
      item.mesh.position.set(
        Math.cos(angle) * radius,
        item.y + Math.sin(orbitTime * 1.8 + item.phase) * 0.035 - pointerY * 0.04,
        Math.sin(angle) * radius * 0.72,
      );
      item.mesh.rotation.set(orbitTime * 0.7 + index, orbitTime * 0.9, 0);
    });

    const depth = Math.min(1.25, (explode ?? pose.explode) + tapExplode * (explode === null ? 1 : 0.35));
    logoNodes.forEach((node, index) => {
      const selected = part === node.groupKey;
      const factor = part === 'all' ? 1 : selected ? 1.45 : 0.25;
      const wave = depth > 0.15 && animateIdle ? Math.sin(time * 2.4 + index * 0.55) * 0.0022 : 0;
      node.mesh.position.z = lerp(node.mesh.position.z, node.basePos.z + depth * node.depthOffset * factor + wave, alpha);
      node.mat.emissiveIntensity = lerp(node.mat.emissiveIntensity, selected ? 0.45 : depth * 0.12, alpha);
    });

    camera.position.lerp(targetCamera.set(pose.camX, pose.camY, pose.camZ), alpha);
    currentLook.lerp(targetLook.set(pose.lookX, pose.lookY, pose.lookZ), alpha);
    camera.lookAt(currentLook);
    accentPoint.intensity = lerp(accentPoint.intensity, pose.accentPointIntensity, alpha);
    renderer.render(scene, camera);

    if (animateIdle || now < motionUntil) schedule();
    else lastTime = 0;
  }

  function setView(chapter, next, progress, snap) {
    pose = getChapterPose(chapter);
    if (!compact && !reducedMotion && chapter !== next) {
      const end = getChapterPose(next);
      for (const key of Object.keys(pose)) pose[key] = lerp(pose[key], end[key], progress);
    }
    scene.environmentIntensity = chapter === 'tech' ? 0.55 : chapter === 'closing' ? 0.75 : 0.68;
    if (snap || reducedMotion) {
      worldStageGroup.position.set(pose.stageX, pose.stageY, 0);
      camera.position.set(pose.camX, pose.camY, pose.camZ);
      currentLook.set(pose.lookX, pose.lookY, pose.lookZ);
    }
    wake();
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function bounce(withRipple = true) {
    if (reducedMotion) return;
    hopVelocity = 0.019;
    tapExplode = 0.72;
    if (withRipple) ripple = 0;
    wake();
  }

  return {
    setView,
    bounce,
    setLayout(value) { compact = value; },
    setSize(width, height) {
      const ratio = Math.min(window.devicePixelRatio || 1, compact ? 1.2 : 1.5);
      const nextSize = [width, height, ratio].join(':');
      if (!width || !height || size === nextSize) return;
      size = nextSize;
      renderer.setDrawingBufferSize(width, height, ratio);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      wake();
    },
    setVisible(value) {
      if (visible === value) return;
      visible = value;
      if (value) wake();
      else stop();
    },
    draw() {
      stop();
      render(performance.now());
    },
    setInspect(value) { inspect = value; wake(); },
    setDragging(value) { dragging = value; },
    point(x, y) {
      if (reducedMotion || compact) return;
      pointerX = x;
      pointerY = y;
    },
    drag(dx, dy) {
      spinTarget = null;
      resetting = false;
      spinY += dx * 0.009;
      spinX = THREE.MathUtils.clamp(spinX + dy * 0.006, -0.42, 0.42);
      if (!reducedMotion) {
        velocityY = dx * 0.0009;
        velocityX = dy * 0.0006;
      }
      wake();
    },
    setExplode(value, filter) { explode = value; part = filter; wake(); },
    setLights(rim, point) {
      rimLight.color.setHex(rim);
      accentPoint.color.setHex(point);
      wake();
    },
    setScenario(id, move = true) {
      const mood = scenarioMoods[id];
      mainRingMat.color.setHex(mood.ring);
      outerRingMat.color.setHex(mood.outer);
      rimLight.color.setHex(mood.rim);
      if (move) {
        if (reducedMotion) spinY = mood.rotOffset;
        else velocityY = (mood.rotOffset - spinY) * 0.08 + 0.06;
      }
      wake();
    },
    spin() {
      resetting = false;
      inspect = true;
      spinTarget = spinY + Math.PI;
      if (reducedMotion) { spinY = spinTarget; spinTarget = null; }
      wake(1600);
    },
    reset() {
      spinTarget = null;
      resetting = true;
      velocityY = velocityX = 0;
      if (reducedMotion) spinY = spinX = 0;
      wake();
    },
    pause() { stop(); },
    resume() { wake(); },
    dispose() {
      stop();
      scene.traverse((child) => {
        child.geometry?.dispose();
        child.material?.map?.dispose();
        child.material?.dispose();
      });
      envRT.dispose();
      renderer.dispose();
    },
  };
}
