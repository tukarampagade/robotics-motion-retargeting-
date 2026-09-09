/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export interface LabEnvironment {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.PointLight;
  leftHandSpotlight: THREE.SpotLight;
  rightHandSpotlight: THREE.SpotLight;
  leftSpotTarget: THREE.Object3D;
  rightSpotTarget: THREE.Object3D;
  setStudioLightingEnabled: (enabled: boolean) => void;
  updateStudioLights: (dt: number, leftHandPos: THREE.Vector3, rightHandPos: THREE.Vector3) => void;
  setCameraPreset: (preset: 'front' | '3q' | 'side' | 'top' | 'close') => void;
  updateCamera: (dt: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export const CAMERA_PRESETS = {
  front: {
    pos: new THREE.Vector3(0, 1.42, 2.75),
    lookAt: new THREE.Vector3(0, 1.15, 0),
  },
  '3q': {
    pos: new THREE.Vector3(1.95, 1.55, 2.15),
    lookAt: new THREE.Vector3(0, 1.15, 0),
  },
  side: {
    pos: new THREE.Vector3(2.65, 1.35, 0.25),
    lookAt: new THREE.Vector3(0, 1.15, 0),
  },
  top: {
    pos: new THREE.Vector3(0.01, 3.4, 0.6),
    lookAt: new THREE.Vector3(0, 1.0, 0),
  },
  close: {
    pos: new THREE.Vector3(0, 1.38, 1.65),
    lookAt: new THREE.Vector3(0, 1.25, 0.1),
  },
};

export function setupLabEnvironment(canvas: HTMLCanvasElement): LabEnvironment {
  const scene = new THREE.Scene();

  // Clean, high-tech light robotics research lab background
  const bgColor = new THREE.Color(0xf4f7fa);
  scene.background = bgColor;
  scene.fog = new THREE.Fog(0xf4f7fa, 6, 18);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  let currentTargetPos = CAMERA_PRESETS.front.pos.clone();
  let currentLookAt = CAMERA_PRESETS.front.lookAt.clone();
  camera.position.copy(currentTargetPos);
  camera.lookAt(currentLookAt);

  // -------------------------------------------------------------
  // Lighting: Balanced 3-point Studio / Robotics Laboratory Rig
  // -------------------------------------------------------------
  // Soft ambient bounce
  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambient);

  // Hemisphere light: crisp sky white + warm lab floor bounce
  const hemi = new THREE.HemisphereLight(0xffffff, 0xe4ebf2, 0.7);
  scene.add(hemi);

  // Key directional light with soft shadows
  const keyLight = new THREE.DirectionalLight(0xfffaed, 1.4);
  keyLight.position.set(2.4, 4.5, 3.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 12;
  keyLight.shadow.camera.left = -2.5;
  keyLight.shadow.camera.right = 2.5;
  keyLight.shadow.camera.top = 2.5;
  keyLight.shadow.camera.bottom = -2.5;
  scene.add(keyLight);

  // Cool fill light from opposite side
  const fillLight = new THREE.DirectionalLight(0xd9e8f5, 0.75);
  fillLight.position.set(-3.2, 2.8, 1.8);
  scene.add(fillLight);

  // Subtle rear rim light for crisp humanoid silhouette separation
  const rimLight = new THREE.PointLight(0x00d2ff, 1.1, 8);
  rimLight.position.set(-1.8, 2.2, -1.8);
  scene.add(rimLight);

  // Front soft detail fill
  const frontFill = new THREE.DirectionalLight(0xffffff, 0.4);
  frontFill.position.set(0, 1.5, 3.5);
  scene.add(frontFill);

  // -------------------------------------------------------------
  // Studio Lighting: Two Dynamic Spotlights Tracking Robot Hands
  // -------------------------------------------------------------
  // Creates dramatic high-contrast key shadows and specular depth on white armor
  let isStudioLightingEnabled = true;

  const leftSpotTarget = new THREE.Object3D();
  leftSpotTarget.position.set(-0.35, 1.1, 0.2);
  scene.add(leftSpotTarget);

  const rightSpotTarget = new THREE.Object3D();
  rightSpotTarget.position.set(0.35, 1.1, 0.2);
  scene.add(rightSpotTarget);

  // Left Hand Key Spotlight (High-CRI studio warm key light)
  const leftHandSpotlight = new THREE.SpotLight(0xfff8ee, 4.8);
  leftHandSpotlight.angle = Math.PI / 4.4; // ~41 degrees wide focused beam
  leftHandSpotlight.penumbra = 0.52; // Soft edge gradient falloff
  leftHandSpotlight.decay = 1.45;
  leftHandSpotlight.distance = 8.5;
  leftHandSpotlight.position.set(-1.25, 2.35, 1.65);
  leftHandSpotlight.target = leftSpotTarget;
  leftHandSpotlight.castShadow = true;
  leftHandSpotlight.shadow.mapSize.width = 1024;
  leftHandSpotlight.shadow.mapSize.height = 1024;
  leftHandSpotlight.shadow.bias = -0.0004;
  leftHandSpotlight.shadow.camera.near = 0.2;
  leftHandSpotlight.shadow.camera.far = 8.5;
  scene.add(leftHandSpotlight);

  // Right Hand Key Spotlight (High-CRI studio cool key light)
  const rightHandSpotlight = new THREE.SpotLight(0xf2f7ff, 4.8);
  rightHandSpotlight.angle = Math.PI / 4.4;
  rightHandSpotlight.penumbra = 0.52;
  rightHandSpotlight.decay = 1.45;
  rightHandSpotlight.distance = 8.5;
  rightHandSpotlight.position.set(1.25, 2.35, 1.65);
  rightHandSpotlight.target = rightSpotTarget;
  rightHandSpotlight.castShadow = true;
  rightHandSpotlight.shadow.mapSize.width = 1024;
  rightHandSpotlight.shadow.mapSize.height = 1024;
  rightHandSpotlight.shadow.bias = -0.0004;
  rightHandSpotlight.shadow.camera.near = 0.2;
  rightHandSpotlight.shadow.camera.far = 8.5;
  scene.add(rightHandSpotlight);

  const setStudioLightingEnabled = (enabled: boolean) => {
    isStudioLightingEnabled = enabled;
  };

  const updateStudioLights = (
    _dt: number,
    leftHandPos: THREE.Vector3,
    rightHandPos: THREE.Vector3
  ) => {
    // Smoothly track hand world positions
    leftSpotTarget.position.lerp(leftHandPos, 0.14);
    rightSpotTarget.position.lerp(rightHandPos, 0.14);

    // Dynamically angle the studio spotlights to maintain dramatic raking shadows
    const targetLeftSpotPos = new THREE.Vector3(
      leftHandPos.x * 0.45 - 1.18,
      Math.max(1.8, leftHandPos.y * 0.35 + 2.0),
      Math.max(1.35, leftHandPos.z + 1.25)
    );
    leftHandSpotlight.position.lerp(targetLeftSpotPos, 0.08);

    const targetRightSpotPos = new THREE.Vector3(
      rightHandPos.x * 0.45 + 1.18,
      Math.max(1.8, rightHandPos.y * 0.35 + 2.0),
      Math.max(1.35, rightHandPos.z + 1.25)
    );
    rightHandSpotlight.position.lerp(targetRightSpotPos, 0.08);

    // Smooth intensity cross-fade between dramatic studio key and standard lab
    if (isStudioLightingEnabled) {
      leftHandSpotlight.intensity = THREE.MathUtils.lerp(leftHandSpotlight.intensity, 4.8, 0.08);
      rightHandSpotlight.intensity = THREE.MathUtils.lerp(rightHandSpotlight.intensity, 4.8, 0.08);

      // Deepen chiaroscuro contrast: slightly lower flat ambient/fill to let spotlights pop
      ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, 0.36, 0.08);
      hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, 0.42, 0.08);
      keyLight.intensity = THREE.MathUtils.lerp(keyLight.intensity, 0.95, 0.08);
      fillLight.intensity = THREE.MathUtils.lerp(fillLight.intensity, 0.45, 0.08);
      rimLight.intensity = THREE.MathUtils.lerp(rimLight.intensity, 1.55, 0.08);
    } else {
      leftHandSpotlight.intensity = THREE.MathUtils.lerp(leftHandSpotlight.intensity, 0.0, 0.08);
      rightHandSpotlight.intensity = THREE.MathUtils.lerp(rightHandSpotlight.intensity, 0.0, 0.08);

      // Return to uniform clean robotics engineering laboratory lighting
      ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, 0.65, 0.08);
      hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, 0.7, 0.08);
      keyLight.intensity = THREE.MathUtils.lerp(keyLight.intensity, 1.4, 0.08);
      fillLight.intensity = THREE.MathUtils.lerp(fillLight.intensity, 0.75, 0.08);
      rimLight.intensity = THREE.MathUtils.lerp(rimLight.intensity, 1.1, 0.08);
    }
  };

  // -------------------------------------------------------------
  // Architectural Floor & Floor Details
  // -------------------------------------------------------------
  // Clean off-white engineering floor
  const floorGeom = new THREE.CircleGeometry(5.5, 48);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xebf0f5,
    roughness: 0.85,
    metalness: 0.08,
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Subtle engineering grid
  const grid = new THREE.GridHelper(9, 36, 0xc2cfdb, 0xdfe6ed);
  grid.position.y = 0.003;
  scene.add(grid);

  // Concentric platform alignment ring around robot base
  const ringGeom = new THREE.RingGeometry(0.85, 0.875, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00b4d8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
  });
  const platformRing = new THREE.Mesh(ringGeom, ringMat);
  platformRing.rotation.x = -Math.PI / 2;
  platformRing.position.y = 0.006;
  scene.add(platformRing);

  // Outer subtle boundary ring
  const outerRingGeom = new THREE.RingGeometry(1.6, 1.615, 64);
  const outerRingMat = new THREE.MeshBasicMaterial({
    color: 0xa9b7c6,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const outerRing = new THREE.Mesh(outerRingGeom, outerRingMat);
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.005;
  scene.add(outerRing);

  // -------------------------------------------------------------
  // Camera Controls
  // -------------------------------------------------------------
  const setCameraPreset = (preset: 'front' | '3q' | 'side' | 'top' | 'close') => {
    const target = CAMERA_PRESETS[preset] || CAMERA_PRESETS.front;
    currentTargetPos = target.pos.clone();
    currentLookAt = target.lookAt.clone();
  };

  const updateCamera = (_dt: number) => {
    camera.position.lerp(currentTargetPos, 0.07);
    const curLook = new THREE.Vector3();
    camera.getWorldDirection(curLook);
    camera.lookAt(currentLookAt);
    platformRing.rotation.z += 0.001;
  };

  const resize = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return {
    scene,
    camera,
    renderer,
    keyLight,
    fillLight,
    rimLight,
    leftHandSpotlight,
    rightHandSpotlight,
    leftSpotTarget,
    rightSpotTarget,
    setStudioLightingEnabled,
    updateStudioLights,
    setCameraPreset,
    updateCamera,
    resize,
    dispose: () => {
      try {
        renderer.dispose();
      } catch (_) {}
    },
  };
}
