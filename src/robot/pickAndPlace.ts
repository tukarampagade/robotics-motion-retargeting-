/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { PickableObject } from '../types';

export interface PickPlaceStation {
  group: THREE.Group;
  objects: PickableObject[];
  activeObjectId: string;
  selectObject: (id: string) => void;
  resetObjects: () => void;
  update: (
    leftHandPos: THREE.Vector3,
    rightHandPos: THREE.Vector3,
    isLeftGrip: boolean,
    isRightGrip: boolean
  ) => {
    statusText: string;
    heldObject: PickableObject | null;
    justPlaced: boolean;
  };
}

export function createPickAndPlaceStation(scene: THREE.Scene): PickPlaceStation {
  const group = new THREE.Group();
  scene.add(group);

  // Workbench Table positioned on the robot's right side (robot's right / viewer's left or right)
  // Let's position it slightly forward and to the right of the robot at x: 0.65, y: 0.72, z: 0.35
  const tableGroup = new THREE.Group();
  tableGroup.position.set(0.62, 0, 0.28);
  group.add(tableGroup);

  // Table top
  const tableTopGeom = new THREE.BoxGeometry(0.72, 0.04, 0.46);
  const tableMat = new THREE.MeshStandardMaterial({
    color: 0xe0e6ed,
    roughness: 0.35,
    metalness: 0.4,
  });
  const tableTop = new THREE.Mesh(tableTopGeom, tableMat);
  tableTop.position.y = 0.7;
  tableTop.receiveShadow = true;
  tableTop.castShadow = true;
  tableGroup.add(tableTop);

  // Table Legs
  const legGeom = new THREE.CylinderGeometry(0.024, 0.024, 0.68, 12);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x3d4450,
    roughness: 0.5,
    metalness: 0.7,
  });

  const legOffsets = [
    [-0.32, -0.19],
    [0.32, -0.19],
    [-0.32, 0.19],
    [0.32, 0.19],
  ];
  legOffsets.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(lx, 0.34, lz);
    leg.castShadow = true;
    tableGroup.add(leg);
  });

  // Pick Zone Marker (Amber/Cyan border on table)
  const pickZoneGeom = new THREE.PlaneGeometry(0.24, 0.24);
  const pickZoneMat = new THREE.MeshBasicMaterial({
    color: 0x00b4d8,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });
  const pickZone = new THREE.Mesh(pickZoneGeom, pickZoneMat);
  pickZone.rotation.x = -Math.PI / 2;
  pickZone.position.set(-0.18, 0.722, 0);
  tableGroup.add(pickZone);

  // Place Zone Marker (Green/Teal target area)
  const placeZoneGeom = new THREE.PlaneGeometry(0.24, 0.24);
  const placeZoneMat = new THREE.MeshBasicMaterial({
    color: 0x2ec4b6,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const placeZone = new THREE.Mesh(placeZoneGeom, placeZoneMat);
  placeZone.rotation.x = -Math.PI / 2;
  placeZone.position.set(0.18, 0.722, 0);
  tableGroup.add(placeZone);

  // Boundary lines on table
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00b4d8 });
  const makeBoxOutline = (w: number, d: number, x: number) => {
    const pts = [
      new THREE.Vector3(x - w / 2, 0.723, -d / 2),
      new THREE.Vector3(x + w / 2, 0.723, -d / 2),
      new THREE.Vector3(x + w / 2, 0.723, d / 2),
      new THREE.Vector3(x - w / 2, 0.723, d / 2),
      new THREE.Vector3(x - w / 2, 0.723, -d / 2),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geom, lineMat);
  };
  tableGroup.add(makeBoxOutline(0.24, 0.24, -0.18));
  tableGroup.add(makeBoxOutline(0.24, 0.24, 0.18));

  // -------------------------------------------------------------
  // Interactive Objects definitions
  // -------------------------------------------------------------
  const initialData: Omit<PickableObject, 'isHeld' | 'heldByHand' | 'isPlaced'>[] = [
    {
      id: 'box-01',
      name: 'BOX 01 (Precision Cube)',
      type: 'box',
      color: '#e63946',
      size: [0.08, 0.08, 0.08],
      position: [0.44, 0.76, 0.28], // inside pick zone in world coordinates
      rotation: [0, 0, 0],
    },
    {
      id: 'box-02',
      name: 'BOX 02 (Telemetry Sensor)',
      type: 'box',
      color: '#f4a261',
      size: [0.09, 0.06, 0.09],
      position: [0.44, 0.75, 0.35],
      rotation: [0, 0.2, 0],
    },
    {
      id: 'cyl-01',
      name: 'CYLINDER (Actuator Core)',
      type: 'cylinder',
      color: '#2a9d8f',
      size: [0.045, 0.1, 0.045],
      position: [0.44, 0.77, 0.21],
      rotation: [0, 0, 0],
    },
    {
      id: 'pkg-01',
      name: 'PACKAGE (Composite Unit)',
      type: 'package',
      color: '#457b9d',
      size: [0.11, 0.07, 0.08],
      position: [0.44, 0.755, 0.28],
      rotation: [0, -0.15, 0],
    },
  ];

  const objectsState: PickableObject[] = initialData.map(d => ({
    ...d,
    isHeld: false,
    heldByHand: null,
    isPlaced: false,
  }));

  let activeObjectId = 'box-01';

  // Three.js meshes corresponding to objects
  const objectMeshes = new Map<string, THREE.Mesh>();

  objectsState.forEach(obj => {
    let geom: THREE.BufferGeometry;
    if (obj.type === 'box' || obj.type === 'package') {
      geom = new THREE.BoxGeometry(obj.size[0], obj.size[1], obj.size[2]);
    } else {
      geom = new THREE.CylinderGeometry(obj.size[0], obj.size[0], obj.size[1], 16);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: obj.color,
      roughness: 0.3,
      metalness: 0.4,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(...obj.position);
    mesh.rotation.set(...obj.rotation);
    mesh.visible = obj.id === activeObjectId;
    group.add(mesh);
    objectMeshes.set(obj.id, mesh);
  });

  const selectObject = (id: string) => {
    activeObjectId = id;
    objectMeshes.forEach((mesh, mId) => {
      mesh.visible = mId === id;
    });
  };

  const resetObjects = () => {
    objectsState.forEach((obj, idx) => {
      obj.isHeld = false;
      obj.heldByHand = null;
      obj.isPlaced = false;
      obj.position = [...initialData[idx].position];
      obj.rotation = [...initialData[idx].rotation];
      const mesh = objectMeshes.get(obj.id);
      if (mesh) {
        mesh.position.set(...obj.position);
        mesh.rotation.set(...obj.rotation);
      }
    });
  };

  // World coordinates of place zone: table at [0.62, 0, 0.28] + placeZone at [0.18, 0.722, 0]
  const placeZoneWorldCenter = new THREE.Vector3(0.62 + 0.18, 0.722, 0.28);
  const placeZoneRadius = 0.14;

  const update = (
    leftHandPos: THREE.Vector3,
    rightHandPos: THREE.Vector3,
    isLeftGrip: boolean,
    isRightGrip: boolean
  ) => {
    const curObj = objectsState.find(o => o.id === activeObjectId);
    const mesh = objectMeshes.get(activeObjectId);
    if (!curObj || !mesh) {
      return { statusText: 'STATION READY', heldObject: null, justPlaced: false };
    }

    let statusText = curObj.isPlaced ? 'PLACED ✓' : 'READY TO PICK';
    let justPlaced = false;

    // Pick distance threshold (meters)
    const GRIP_THRESHOLD = 0.18;

    if (!curObj.isHeld) {
      // Check if either hand is near the object and executing a grip gesture
      const objPos = mesh.position;
      const dRight = rightHandPos.distanceTo(objPos);
      const dLeft = leftHandPos.distanceTo(objPos);

      if (isRightGrip && dRight < GRIP_THRESHOLD) {
        curObj.isHeld = true;
        curObj.heldByHand = 'right';
        statusText = 'HELD BY RIGHT HAND';
      } else if (isLeftGrip && dLeft < GRIP_THRESHOLD) {
        curObj.isHeld = true;
        curObj.heldByHand = 'left';
        statusText = 'HELD BY LEFT HAND';
      } else if (dRight < GRIP_THRESHOLD || dLeft < GRIP_THRESHOLD) {
        statusText = 'CLOSE HAND TO GRIP';
      }
    } else {
      // Object is currently held
      const activeHand = curObj.heldByHand;
      const handPos = activeHand === 'left' ? leftHandPos : rightHandPos;
      const isGrip = activeHand === 'left' ? isLeftGrip : isRightGrip;

      if (isGrip) {
        // Follow hand smoothly
        mesh.position.lerp(handPos, 0.35);
        // Keep minimum height above table
        mesh.position.y = Math.max(mesh.position.y, 0.74);
        statusText = `TRANSPORTING: ${curObj.name}`;
      } else {
        // Hand released! Check if dropped over Place Zone
        curObj.isHeld = false;
        curObj.heldByHand = null;

        const dPlace = new THREE.Vector2(mesh.position.x, mesh.position.z).distanceTo(
          new THREE.Vector2(placeZoneWorldCenter.x, placeZoneWorldCenter.z)
        );

        if (dPlace < placeZoneRadius && mesh.position.y < 0.9) {
          // Successfully placed!
          curObj.isPlaced = true;
          mesh.position.set(placeZoneWorldCenter.x, 0.76, placeZoneWorldCenter.z);
          statusText = 'PLACED ✓';
          justPlaced = true;
        } else {
          // Misplaced / placed outside target zone
          statusText = 'RELEASED (OUTSIDE TARGET)';
          // Rest on table surface
          mesh.position.y = 0.76;
        }
      }
    }

    return {
      statusText,
      heldObject: curObj.isHeld ? curObj : null,
      justPlaced,
    };
  };

  return {
    group,
    objects: objectsState,
    activeObjectId,
    selectObject,
    resetObjects,
    update,
  };
}
