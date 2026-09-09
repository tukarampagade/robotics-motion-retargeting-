/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Compass,
  Cpu,
  Eye,
  Hand,
  Layers,
  Minimize2,
  RefreshCw,
  Sliders,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { HandDebugTelemetry, HandTrackingState, TrackingMetrics } from '../types';

interface HandDebugPanelProps {
  leftHand: HandTrackingState;
  rightHand: HandTrackingState;
  metrics: TrackingMetrics;
  onCalibrate?: (side: 'left' | 'right' | 'both') => void;
  onResetCalibration?: () => void;
  isCalibrating?: boolean;
  calibrationProgress?: number;
  onClose?: () => void;
}

export const HandDebugPanel: React.FC<HandDebugPanelProps> = ({
  leftHand,
  rightHand,
  metrics,
  onCalibrate,
  onResetCalibration,
  isCalibrating = false,
  calibrationProgress = 0,
  onClose,
}) => {
  const [activeSide, setActiveSide] = useState<'both' | 'left' | 'right'>('both');

  const toDeg = (rad: number) => Math.round((rad * 180) / Math.PI);
  const fmtRad = (rad: number) => rad.toFixed(2);

  const renderFingerTable = (telemetry: HandDebugTelemetry | undefined, sideLabel: 'Left' | 'Right') => {
    if (!telemetry) {
      return (
        <div className="p-6 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-200 shadow-2xs">
          <Hand className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
          <p className="text-xs font-semibold text-slate-700">
            {sideLabel} Hand not detected in camera frame
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Bring hand into view of camera to see live kinematic joint angles
          </p>
        </div>
      );
    }

    const fingersList: Array<{
      name: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
      title: string;
      joints: Array<{ id: 'mcp' | 'pip' | 'dip'; name: string }>;
    }> = [
      {
        name: 'thumb',
        title: 'Thumb',
        joints: [
          { id: 'mcp', name: 'MCP (Flex/Sweep)' },
          { id: 'pip', name: 'IP (Interphalangeal)' },
        ],
      },
      {
        name: 'index',
        title: 'Index',
        joints: [
          { id: 'mcp', name: 'MCP' },
          { id: 'pip', name: 'PIP' },
          { id: 'dip', name: 'DIP' },
        ],
      },
      {
        name: 'middle',
        title: 'Middle',
        joints: [
          { id: 'mcp', name: 'MCP' },
          { id: 'pip', name: 'PIP' },
          { id: 'dip', name: 'DIP' },
        ],
      },
      {
        name: 'ring',
        title: 'Ring',
        joints: [
          { id: 'mcp', name: 'MCP' },
          { id: 'pip', name: 'PIP' },
          { id: 'dip', name: 'DIP' },
        ],
      },
      {
        name: 'pinky',
        title: 'Pinky',
        joints: [
          { id: 'mcp', name: 'MCP' },
          { id: 'pip', name: 'PIP' },
          { id: 'dip', name: 'DIP' },
        ],
      },
    ];

    return (
      <div className="space-y-3">
        {/* Hand Top Meta Header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block uppercase font-sans">Gesture</span>
            <span className="font-bold text-sky-700">{telemetry.gesture}</span>
          </div>
          <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block uppercase font-sans">Confidence</span>
            <span className="font-bold text-slate-800">{Math.round(telemetry.confidence * 100)}%</span>
          </div>
          <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block uppercase font-sans">Palm Size</span>
            <span className="font-bold text-slate-800">
              {(telemetry.palmSize * 100).toFixed(1)} cm
            </span>
          </div>
          <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 block uppercase font-sans">Pinch Dist</span>
            <span
              className={`font-bold ${
                telemetry.isPinching ? 'text-amber-600' : 'text-slate-800'
              }`}
            >
              {telemetry.pinchDistance.toFixed(2)} {telemetry.isPinching ? '(PINCH)' : ''}
            </span>
          </div>
        </div>

        {/* 3-Column Kinematics Table: Raw vs Calibrated vs Robot */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <table className="w-full text-left border-collapse text-[11px] font-mono">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans font-semibold">
                <th className="py-2 px-3">Joint</th>
                <th className="py-2 px-2 text-right text-slate-600">RAW</th>
                <th className="py-2 px-2 text-right text-sky-700">CALIBRATED</th>
                <th className="py-2 px-3 text-right text-slate-900">ROBOT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {fingersList.map(finger => (
                <React.Fragment key={finger.name}>
                  <tr className="bg-slate-50/80 font-sans font-bold text-slate-600 text-[10px]">
                    <td colSpan={4} className="py-1 px-3 uppercase tracking-wider text-slate-500">
                      {finger.title} Finger
                    </td>
                  </tr>
                  {finger.joints.map(joint => {
                    const fData = telemetry.fingers[finger.name];
                    const rawRad = fData?.raw[joint.id] ?? 0;
                    const calRad = fData?.calibrated[joint.id] ?? 0;
                    const rRad = fData?.robot[joint.id] ?? 0;

                    return (
                      <tr key={joint.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-1.5 px-3 font-sans text-slate-800 font-medium">
                          {joint.name}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-600">
                          {toDeg(rawRad)}° <span className="text-[9.5px] text-slate-400">({fmtRad(rawRad)}r)</span>
                        </td>
                        <td className="py-1.5 px-2 text-right text-sky-700 font-semibold">
                          {toDeg(calRad)}° <span className="text-[9.5px] text-sky-600">({fmtRad(calRad)}r)</span>
                        </td>
                        <td className="py-1.5 px-3 text-right text-slate-900 font-bold">
                          {toDeg(rRad)}° <span className="text-[9.5px] text-slate-500">({fmtRad(rRad)}r)</span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 border-l border-slate-200 overflow-y-auto select-none font-sans text-slate-800">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-white/95 sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shadow-2xs">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 leading-tight">
              Hand Kinematics Debug Inspector
            </h3>
            <p className="text-[10px] font-mono text-slate-500 leading-tight">
              Raw 21-Landmark Vector Dot Products vs. Robot Joint Angles
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Latency & FPS Bar */}
      <div className="p-3 border-b border-slate-200 bg-white">
        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[9.5px] text-slate-500 font-medium font-sans">Vision FPS</div>
            <div className="text-xs font-bold text-slate-800 mt-0.5">{metrics.visionFps} FPS</div>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[9.5px] text-slate-500 font-medium font-sans">Render FPS</div>
            <div className="text-xs font-bold text-slate-800 mt-0.5">{metrics.renderFps} FPS</div>
          </div>
          <div className="p-2 rounded-lg bg-sky-50 border border-sky-200">
            <div className="text-[9.5px] text-sky-700 font-medium font-sans">Latency</div>
            <div className="text-xs font-bold text-sky-900 mt-0.5">
              {Math.round(metrics.latencyMs || 15)} ms
            </div>
          </div>
        </div>
      </div>

      {/* Calibration Action Banner */}
      <div className="p-3 border-b border-slate-200 bg-slate-100/50">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-mono">
              <Compass className="w-3.5 h-3.5 text-sky-600" />
              Neutral Stance Calibration
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Hold Open Palm towards camera to set per-finger zero offsets
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onResetCalibration && (
              <button
                onClick={onResetCalibration}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[10.5px] font-mono text-slate-600 font-medium transition-colors cursor-pointer shadow-2xs"
                title="Reset to factory calibration"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
            {onCalibrate && (
              <button
                onClick={() => onCalibrate('both')}
                disabled={isCalibrating}
                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] font-sans flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isCalibrating ? `Calibrating ${Math.round(calibrationProgress)}%` : 'Calibrate Neutral'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hand Side Toggle */}
      <div className="p-2.5 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {(['both', 'left', 'right'] as const).map(side => (
            <button
              key={side}
              onClick={() => setActiveSide(side)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono uppercase transition-all cursor-pointer ${
                activeSide === side
                  ? 'bg-sky-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
              }`}
            >
              {side === 'both' ? 'Both Hands' : `${side} Hand`}
            </button>
          ))}
        </div>
      </div>

      {/* Main Tables Container */}
      <div className="p-3.5 flex flex-col gap-4 flex-1">
        {(activeSide === 'both' || activeSide === 'left') && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                LEFT HAND TRACKING STREAM
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {leftHand.detected ? 'LOCKED' : 'NO TARGET'}
              </span>
            </div>
            {renderFingerTable(leftHand.debugTelemetry, 'Left')}
          </div>
        )}

        {(activeSide === 'both' || activeSide === 'right') && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                RIGHT HAND TRACKING STREAM
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {rightHand.detected ? 'LOCKED' : 'NO TARGET'}
              </span>
            </div>
            {renderFingerTable(rightHand.debugTelemetry, 'Right')}
          </div>
        )}
      </div>
    </div>
  );
};
