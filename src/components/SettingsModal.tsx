/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sliders, X } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm select-none p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 p-6 text-slate-800 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Tracking & System Settings</h2>
              <p className="text-[11px] text-slate-500">Fine-tune motion response and views</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Motion Smoothing & Response Speed */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-slate-700">
              Response Speed & Kinematics
            </label>
            <span className="font-mono text-xs text-cyan-700 font-bold">
              {settings.smoothingTau.toFixed(2)}s τ
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2 font-mono text-xs">
            {[
              { label: 'ULTRA-FAST', preset: 'ultra_fast' as const, tau: 0.02 },
              { label: 'BALANCED', preset: 'balanced' as const, tau: 0.05 },
              { label: 'SMOOTH', preset: 'cinematic' as const, tau: 0.15 },
            ].map(item => (
              <button
                key={item.preset}
                onClick={() =>
                  onUpdateSettings({
                    responsePreset: item.preset,
                    smoothingTau: item.tau,
                  })
                }
                className={`py-1.5 rounded-lg border text-center transition-all ${
                  settings.responsePreset === item.preset
                    ? 'border-cyan-600 bg-cyan-50 text-cyan-800 font-bold shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min="0.01"
            max="0.30"
            step="0.01"
            value={settings.smoothingTau}
            onChange={e => onUpdateSettings({ smoothingTau: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 cursor-pointer"
          />
        </div>

        {/* 2. Motion Gain */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-slate-700">Motion Amplitude Gain</label>
            <span className="font-mono text-xs text-cyan-700 font-bold">
              {settings.motionGain.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.6"
            max="1.5"
            step="0.05"
            value={settings.motionGain}
            onChange={e => onUpdateSettings({ motionGain: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 cursor-pointer"
          />
        </div>

        {/* 2.5 Pose Confidence Threshold for Motion Triggering */}
        <div className="mb-5 pt-3 border-t border-slate-100">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-semibold text-slate-700">
              Pose Confidence Threshold
            </label>
            <span className="font-mono text-xs text-cyan-700 font-bold">
              {((settings.poseConfidenceThreshold ?? 0.25) * 100).toFixed(0)}% ({(settings.poseConfidenceThreshold ?? 0.25).toFixed(2)})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mb-2.5">
            Sensitivity threshold for triggering robot motion. Lower this in dim or non-ideal lighting conditions so arm motion triggers reliably.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-2 font-mono text-xs">
            {[
              { label: 'DIM LIGHT (15%)', val: 0.15 },
              { label: 'BALANCED (25%)', val: 0.25 },
              { label: 'STRICT (40%)', val: 0.40 },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => onUpdateSettings({ poseConfidenceThreshold: item.val })}
                className={`py-1.5 rounded-lg border text-center transition-all ${
                  Math.abs((settings.poseConfidenceThreshold ?? 0.25) - item.val) < 0.03
                    ? 'border-cyan-600 bg-cyan-50 text-cyan-800 font-bold shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min="0.10"
            max="0.80"
            step="0.05"
            value={settings.poseConfidenceThreshold ?? 0.25}
            onChange={e => onUpdateSettings({ poseConfidenceThreshold: parseFloat(e.target.value) })}
            className="w-full accent-cyan-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
            <span>10% (High Sensitivity / Dim Lighting)</span>
            <span>80% (Strict Studio Lighting)</span>
          </div>
        </div>

        {/* 3. Toggles */}
        <div className="space-y-3 pt-2 border-t border-slate-100 mb-5 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Show Pose Skeleton Overlay</span>
              <span className="text-[11px] text-slate-500">Render human bone lines on video</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ showSkeleton: !settings.showSkeleton })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.showSkeleton ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.showSkeleton ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Show 21 Finger Landmarks</span>
              <span className="text-[11px] text-slate-500">Draw individual finger knuckle dots</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ showFingers: !settings.showFingers })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.showFingers ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.showFingers ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Mirror Camera Preview</span>
              <span className="text-[11px] text-slate-500">Simulates physical mirror reflection</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ mirrorView: !settings.mirrorView })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.mirrorView ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.mirrorView ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">3D Hand Motion Trails</span>
              <span className="text-[11px] text-slate-500">Luminous path lines during fast hand movements</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ motionTrailsEnabled: !settings.motionTrailsEnabled })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.motionTrailsEnabled ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.motionTrailsEnabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Gesture Mappings Guide Overlay</span>
              <span className="text-[11px] text-slate-500">Helper cards for WAVE, PINCH, FIST, etc.</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ showGestureGuide: !settings.showGestureGuide })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.showGestureGuide ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.showGestureGuide ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Autonomous Saccade Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Autonomous Eye Saccades</span>
              <span className="text-[11px] text-slate-500">Lifelike ocular scanning & blinks when still</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ enableSaccades: !settings.enableSaccades })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.enableSaccades ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.enableSaccades ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Studio Lighting Key Spotlights Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Dynamic Studio Lighting</span>
              <span className="text-[11px] text-slate-500">Twin spotlights tracking hands with dramatic shell shadows</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ studioLightingEnabled: !settings.studioLightingEnabled })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.studioLightingEnabled ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.studioLightingEnabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Body Anti-Clipping Boundary Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Body Boundary (Anti-Clipping)</span>
              <span className="text-[11px] text-slate-500">Constrains robot hands outside head, torso, and pelvis</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ bodyBoundaryEnabled: !settings.bodyBoundaryEnabled })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.bodyBoundaryEnabled ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.bodyBoundaryEnabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Adaptive One Euro Filter Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold block text-slate-800">Adaptive 1€ Landmark Filter</span>
              <span className="text-[11px] text-slate-500">Stabilize high-speed motion & eliminate limb tremor</span>
            </div>
            <button
              onClick={() => onUpdateSettings({ enableOneEuroFilter: !settings.enableOneEuroFilter })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.enableOneEuroFilter ? 'bg-cyan-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.enableOneEuroFilter ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* 4. Pose Model Quality */}
        <div className="mb-4 pt-2 border-t border-slate-100">
          <label className="text-xs font-semibold text-slate-700 block mb-1.5">
            Pose Model Precision
          </label>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <button
              onClick={() => onUpdateSettings({ poseModelQuality: 'full' })}
              className={`py-2 rounded-xl border text-center transition-all ${
                settings.poseModelQuality === 'full'
                  ? 'border-cyan-600 bg-cyan-50 text-cyan-800 font-semibold'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              FULL (Accurate)
            </button>
            <button
              onClick={() => onUpdateSettings({ poseModelQuality: 'lite' })}
              className={`py-2 rounded-xl border text-center transition-all ${
                settings.poseModelQuality === 'lite'
                  ? 'border-cyan-600 bg-cyan-50 text-cyan-800 font-semibold'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              LITE (High FPS)
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors mt-2"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
};
