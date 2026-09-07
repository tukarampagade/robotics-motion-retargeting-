/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export interface RobotMaterialSet {
  armorWhite: THREE.MeshStandardMaterial;
  armorWhiteGloss: THREE.MeshStandardMaterial;
  titaniumSilver: THREE.MeshStandardMaterial;
  darkMechanism: THREE.MeshStandardMaterial;
  jointBearing: THREE.MeshStandardMaterial;
  carbonFiber: THREE.MeshStandardMaterial;
  cyanAccent: THREE.MeshStandardMaterial;
  amberAccent: THREE.MeshStandardMaterial;
  eyeSclera: THREE.MeshStandardMaterial;
  eyePupil: THREE.MeshBasicMaterial;
  mouthDisplay: THREE.MeshBasicMaterial;
  chestReactor: THREE.MeshStandardMaterial;
  pedestalColumn: THREE.MeshStandardMaterial;
  pedestalBase: THREE.MeshStandardMaterial;
  boundaryShield: THREE.MeshStandardMaterial;
  boundaryShieldWire: THREE.MeshBasicMaterial;
  energyConduit: THREE.MeshStandardMaterial;
  reactorCoreGlow: THREE.MeshBasicMaterial;
}

export function createRobotMaterials(): RobotMaterialSet {
  // Primary white outer composite armor (inspired by reference humanoid)
  const armorWhite = new THREE.MeshStandardMaterial({
    color: 0xf3f5f8,
    roughness: 0.28,
    metalness: 0.15,
  });

  const armorWhiteGloss = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.2,
  });

  // Brushed titanium / metallic mechanical joints
  const titaniumSilver = new THREE.MeshStandardMaterial({
    color: 0xc4cbd4,
    roughness: 0.32,
    metalness: 0.82,
  });

  // Dark internal mechanism, actuators, bearings, hydraulics
  const darkMechanism = new THREE.MeshStandardMaterial({
    color: 0x22262c,
    roughness: 0.45,
    metalness: 0.6,
  });

  // Joint bearings & pivot rings
  const jointBearing = new THREE.MeshStandardMaterial({
    color: 0x3d4450,
    roughness: 0.25,
    metalness: 0.9,
  });

  // Carbon fiber / darker recessed panels
  const carbonFiber = new THREE.MeshStandardMaterial({
    color: 0x181a1e,
    roughness: 0.6,
    metalness: 0.3,
  });

  // Cyan luminous accents
  const cyanAccent = new THREE.MeshStandardMaterial({
    color: 0x00b4d8,
    emissive: 0x0096c7,
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0.5,
  });

  // Amber warning / status glow
  const amberAccent = new THREE.MeshStandardMaterial({
    color: 0xe0a953,
    emissive: 0xb87d2b,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.4,
  });

  // Realistic mechanical eye system
  const eyeSclera = new THREE.MeshStandardMaterial({
    color: 0x151920,
    roughness: 0.1,
    metalness: 0.8,
  });

  const eyePupil = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
  });

  const mouthDisplay = new THREE.MeshBasicMaterial({
    color: 0x00d2ff,
  });

  // Chest central reactor / status core
  const chestReactor = new THREE.MeshStandardMaterial({
    color: 0x00b4d8,
    emissive: 0x0096c7,
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.3,
  });

  // Sleek industrial pedestal (half-body mount)
  const pedestalColumn = new THREE.MeshStandardMaterial({
    color: 0x30353f,
    roughness: 0.38,
    metalness: 0.75,
  });

  const pedestalBase = new THREE.MeshStandardMaterial({
    color: 0xe4e8ee,
    roughness: 0.3,
    metalness: 0.4,
  });

  // Futuristic Holographic Body Collision Boundary Shield
  const boundaryShield = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x0096c7,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.18,
    roughness: 0.08,
    metalness: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Futuristic Holographic Shield Wireframe Hex Lattice
  const boundaryShieldWire = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    wireframe: true,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });

  // Futuristic Glowing Energy Conduits
  const energyConduit = new THREE.MeshStandardMaterial({
    color: 0x00f5ff,
    emissive: 0x00c8f8,
    emissiveIntensity: 1.4,
    roughness: 0.1,
    metalness: 0.5,
  });

  // Futuristic Quantum Reactor Core Glow
  const reactorCoreGlow = new THREE.MeshBasicMaterial({
    color: 0xa8f5ff,
  });

  return {
    armorWhite,
    armorWhiteGloss,
    titaniumSilver,
    darkMechanism,
    jointBearing,
    carbonFiber,
    cyanAccent,
    amberAccent,
    eyeSclera,
    eyePupil,
    mouthDisplay,
    chestReactor,
    pedestalColumn,
    pedestalBase,
    boundaryShield,
    boundaryShieldWire,
    energyConduit,
    reactorCoreGlow,
  };
}
