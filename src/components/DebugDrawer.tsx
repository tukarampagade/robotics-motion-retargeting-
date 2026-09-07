/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity, Layers, X } from 'lucide-react';
import {
  HandTrackingState,
  RobotJointAngles,
  TrackingMetrics,
} from '../types';

interface DebugDrawerProps {
  isOpen: boolean;
  angles: RobotJointAngles;
  leftHand: HandTrackingState;
  rightHand: HandTrackingState;
  metrics: TrackingMetrics;
  onClose: () => void;
}

export const DebugDrawer: React.FC<DebugDrawerProps> = ({
  isOpen,
  angles,
  leftHand,
  rightHand,
  metrics,
  onClose,
}) => {
  if (!isOpen) return null;

  const toDeg = (rad: number) => Math.round((rad * 180) / Math.PI);

  return (
    <div className="absolute top-16 right-4 w-96 max-h-[85vh] bg-white/95 border border-slate-200/90 rounded-2xl shadow-xl backdrop-blur-md z-40 p-4 font-mono text-xs select-none text-slate-800 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900">Live Telemetry Inspector</h3>
            <p className="text-[10px] text-slate-500">Real-time Kinematics & Tracking</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Head & Gaze */}
      <div className="mb-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
          Head & Eye Tracking
        </span>
        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
          <div>Yaw: <b className="text-cyan-700">{toDeg(angles.headYaw)}°</b></div>
          <div>Pitch: <b className="text-cyan-700">{toDeg(angles.headPitch)}°</b></div>
          <div>Roll: <b className="text-cyan-700">{toDeg(angles.headRoll)}°</b></div>
        </div>
        <div className="mt-1.5 text-[10.5px] text-slate-600 flex justify-between">
          <span>Eye Gaze X: <b>{angles.eyeX.toFixed(2)}</b></span>
          <span>Eye Gaze Y: <b>{angles.eyeY.toFixed(2)}</b></span>
          <span>Mouth: <b className="capitalize text-cyan-700">{angles.mouthState}</b></span>
        </div>
      </div>

      {/* Left Arm & Wrist */}
      <div className="mb-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase">
            Left Arm (Source: {metrics.activeArmSource.left})
          </span>
          <span
            className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold ${
              leftHand.detected ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {leftHand.detected ? 'DETECTED' : 'LOST'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10.5px] mb-1">
          <div>Shoulder Z: <b>{toDeg(angles.lShoulderZ)}°</b></div>
          <div>Shoulder X: <b>{toDeg(angles.lShoulderX)}°</b></div>
          <div>Shoulder Y: <b>{toDeg(angles.lShoulderY)}°</b></div>
          <div>Elbow Bend: <b>{toDeg(angles.lElbow)}°</b></div>
          <div>Wrist Roll: <b>{toDeg(angles.lWristRoll)}°</b></div>
          <div>Wrist Pitch: <b>{toDeg(angles.lWristPitch)}°</b></div>
          <div>Wrist Yaw: <b>{toDeg(angles.lWristYaw)}°</b></div>
        </div>
        {leftHand.detected && (
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/70">
            Wrist Pos: [{leftHand.wristPos.x.toFixed(2)}, {leftHand.wristPos.y.toFixed(2)}, {leftHand.wristPos.z.toFixed(2)}]
          </div>
        )}
      </div>

      {/* Right Arm & Wrist */}
      <div className="mb-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase">
            Right Arm (Source: {metrics.activeArmSource.right})
          </span>
          <span
            className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold ${
              rightHand.detected ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {rightHand.detected ? 'DETECTED' : 'LOST'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10.5px] mb-1">
          <div>Shoulder Z: <b>{toDeg(angles.rShoulderZ)}°</b></div>
          <div>Shoulder X: <b>{toDeg(angles.rShoulderX)}°</b></div>
          <div>Shoulder Y: <b>{toDeg(angles.rShoulderY)}°</b></div>
          <div>Elbow Bend: <b>{toDeg(angles.rElbow)}°</b></div>
          <div>Wrist Roll: <b>{toDeg(angles.rWristRoll)}°</b></div>
          <div>Wrist Pitch: <b>{toDeg(angles.rWristPitch)}°</b></div>
          <div>Wrist Yaw: <b>{toDeg(angles.rWristYaw)}°</b></div>
        </div>
        {rightHand.detected && (
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/70">
            Wrist Pos: [{rightHand.wristPos.x.toFixed(2)}, {rightHand.wristPos.y.toFixed(2)}, {rightHand.wristPos.z.toFixed(2)}]
          </div>
        )}
      </div>

      {/* Individual Finger Articulation */}
      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
          Finger Flexion (MCP °)
        </span>
        <div className="grid grid-cols-2 gap-2 text-[10.5px]">
          <div>
            <span className="text-[9.5px] text-cyan-700 font-bold block">LEFT HAND</span>
            <div>Thumb: {toDeg(leftHand.fingers.thumb.mcp)}°</div>
            <div>Index: {toDeg(leftHand.fingers.index.mcp)}°</div>
            <div>Middle: {toDeg(leftHand.fingers.middle.mcp)}°</div>
            <div>Ring: {toDeg(leftHand.fingers.ring.mcp)}°</div>
            <div>Pinky: {toDeg(leftHand.fingers.pinky.mcp)}°</div>
          </div>
          <div>
            <span className="text-[9.5px] text-cyan-700 font-bold block">RIGHT HAND</span>
            <div>Thumb: {toDeg(rightHand.fingers.thumb.mcp)}°</div>
            <div>Index: {toDeg(rightHand.fingers.index.mcp)}°</div>
            <div>Middle: {toDeg(rightHand.fingers.middle.mcp)}°</div>
            <div>Ring: {toDeg(rightHand.fingers.ring.mcp)}°</div>
            <div>Pinky: {toDeg(rightHand.fingers.pinky.mcp)}°</div>
          </div>
        </div>
      </div>
    </div>
  );
};
