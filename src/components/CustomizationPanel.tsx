/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Camera,
  Check,
  Eye,
  Layers,
  Palette,
  Shield,
  Sliders,
  Sparkles,
  SunMedium,
  Wind,
  Zap,
} from 'lucide-react';
import { AppSettings } from '../types';

export type AccentColorTheme = 'cyan' | 'indigo' | 'emerald' | 'amber';

interface CustomizationPanelProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  accentColor: AccentColorTheme;
  onSetAccentColor: (color: AccentColorTheme) => void;
  onClose?: () => void;
}

export const CustomizationPanel: React.FC<CustomizationPanelProps> = ({
  settings,
  onUpdateSettings,
  accentColor,
  onSetAccentColor,
  onClose,
}) => {
  const accentOptions: { id: AccentColorTheme; label: string; hex: string; desc: string }[] = [
    { id: 'cyan', label: 'Cyber Cyan', hex: '#0284c7', desc: 'Sleek futuristic robotics default' },
    { id: 'indigo', label: 'Royal Indigo', hex: '#4f46e5', desc: 'Deep high-contrast studio theme' },
    { id: 'emerald', label: 'Precision Emerald', hex: '#059669', desc: 'Calm ergonomic telemetry green' },
    { id: 'amber', label: 'Industrial Amber', hex: '#d97706', desc: 'Heavy automation & industrial palette' },
  ];

  const cameraPresets: { id: 'front' | '3q' | 'side' | 'top' | 'close'; label: string; desc: string }[] = [
    { id: 'front', label: 'Frontal', desc: 'Direct mirror eye-level' },
    { id: '3q', label: 'Perspective', desc: 'Three-quarter isometric view' },
    { id: 'side', label: 'Side Profile', desc: 'Arm reach & spine depth' },
    { id: 'top', label: 'Top-Down', desc: 'Orthographic workbench view' },
    { id: 'close', label: 'Arm Close-up', desc: 'Finger dexterity inspection' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 border-l border-slate-200 overflow-y-auto select-none font-sans text-slate-800">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-white/95 sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shadow-2xs">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 leading-tight">Studio & Customization</h3>
            <p className="text-[10px] text-slate-500 leading-tight font-mono">
              Personalize visual themes, lighting, and overlays
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      <div className="p-3.5 flex flex-col gap-4 flex-1">
        {/* 1. Theme Accent Color */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-2 font-mono">
            PRIMARY ACCENT THEME
          </label>
          <div className="grid grid-cols-2 gap-2">
            {accentOptions.map(opt => {
              const isSelected = accentColor === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onSetAccentColor(opt.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all duration-150 relative cursor-pointer ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50/80 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shadow-2xs shrink-0"
                        style={{ backgroundColor: opt.hex }}
                      />
                      <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-sky-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight font-mono">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. 3D Camera Angles */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-2 font-mono">
            3D VIEWPORT CAMERA ANGLES
          </label>
          <div className="grid grid-cols-3 gap-2">
            {cameraPresets.map(preset => {
              const isSelected = settings.cameraView === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => onUpdateSettings({ cameraView: preset.id })}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 text-sky-800 border-sky-400 font-semibold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                  }`}
                >
                  <div className="text-xs font-bold">{preset.label}</div>
                  <div
                    className={`text-[9.5px] truncate mt-0.5 font-mono ${
                      isSelected ? 'text-sky-700' : 'text-slate-400'
                    }`}
                  >
                    {preset.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Visual Aids & Graphics Toggles */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-2 font-mono">
            VISUAL FEEDBACK & OVERLAYS
          </label>
          <div className="flex flex-col gap-2">
            {/* 3D Motion Trails */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Wind className="w-4 h-4 text-sky-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">3D Motion Trajectory Trails</div>
                  <div className="text-[10px] text-slate-500 font-mono">Smooth motion ribbon behind robot hands</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.motionTrailsEnabled}
                onChange={e => onUpdateSettings({ motionTrailsEnabled: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded cursor-pointer accent-sky-600"
              />
            </div>

            {/* Studio High-Key Lighting */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2.5">
                <SunMedium className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">Studio Key Lighting & Shadows</div>
                  <div className="text-[10px] text-slate-500 font-mono">Directional key lighting with soft contact shadows</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.studioLightingEnabled}
                onChange={e => onUpdateSettings({ studioLightingEnabled: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded cursor-pointer accent-sky-600"
              />
            </div>

            {/* Collision Envelope Shield */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">Show Collision Boundary Shield</div>
                  <div className="text-[10px] text-slate-500 font-mono">Render 3D wireframe around robot torso capsule</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.showBodyBoundaryShield}
                onChange={e => onUpdateSettings({ showBodyBoundaryShield: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded cursor-pointer accent-sky-600"
              />
            </div>

            {/* Futuristic Holographic Mode */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">Futuristic Hologram Atmosphere</div>
                  <div className="text-[10px] text-slate-500 font-mono">Deep cyan-tinted robotic shell and ambient floor glow</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.futuristicMode}
                onChange={e => onUpdateSettings({ futuristicMode: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded cursor-pointer accent-sky-600"
              />
            </div>

            {/* Camera Vision Skeleton */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Eye className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">Pose Skeleton Overlay</div>
                  <div className="text-[10px] text-slate-500 font-mono">Draw 33-point skeletal bones on webcam video</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.showSkeleton}
                onChange={e => onUpdateSettings({ showSkeleton: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded cursor-pointer accent-sky-600"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
