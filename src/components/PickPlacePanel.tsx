/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, CheckCircle2, Package, RefreshCw, X } from 'lucide-react';
import { PickableObject } from '../types';

interface PickPlacePanelProps {
  isOpen: boolean;
  objects: PickableObject[];
  activeObjectId: string;
  pickPlaceStatus: string;
  placedCount: number;
  onSelectObject: (id: string) => void;
  onResetObjects: () => void;
  onClose: () => void;
}

export const PickPlacePanel: React.FC<PickPlacePanelProps> = ({
  isOpen,
  objects,
  activeObjectId,
  pickPlaceStatus,
  placedCount,
  onSelectObject,
  onResetObjects,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-16 right-4 w-80 bg-white/95 border border-slate-200/90 rounded-2xl shadow-xl backdrop-blur-md z-40 p-4 font-sans select-none text-slate-800 animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900">Pick & Place Station</h3>
            <p className="text-[10px] text-slate-500 font-mono">Virtual Industrial Workbench</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Target Object Selection */}
      <div className="mb-4">
        <label className="text-[11px] font-semibold text-slate-700 block mb-2">
          Select Active Target Object
        </label>
        <div className="grid grid-cols-2 gap-2">
          {objects.map(obj => (
            <button
              key={obj.id}
              onClick={() => onSelectObject(obj.id)}
              className={`p-2 rounded-xl border text-left flex items-center gap-2.5 transition-all text-xs ${
                activeObjectId === obj.id
                  ? 'border-cyan-500 bg-cyan-50/50 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <span
                className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                style={{ backgroundColor: obj.color }}
              />
              <div className="min-w-0 flex-1">
                <span className="font-semibold block truncate text-[11px] text-slate-800">
                  {obj.name.split(' ')[0]}
                </span>
                <span className="text-[9.5px] text-slate-500 font-mono uppercase">
                  {obj.type}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Status & Instructions */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 mb-3 font-mono text-[11px]">
        <div className="flex justify-between items-center mb-1">
          <span className="text-slate-500 text-[10px]">CURRENT STATE:</span>
          <span className="font-bold text-cyan-700">{pickPlaceStatus}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500 text-[10px]">ITEMS PLACED:</span>
          <span className="font-bold text-emerald-600">{placedCount}</span>
        </div>
      </div>

      {/* Step by step guide */}
      <div className="text-[11px] text-slate-600 space-y-1.5 mb-4 font-mono bg-cyan-50/40 p-2.5 rounded-xl border border-cyan-100">
        <div className="flex items-start gap-1.5">
          <span className="text-cyan-600 font-bold">1.</span>
          <span>Reach robot hand toward the object on the table.</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="text-cyan-600 font-bold">2.</span>
          <span>Close your human hand (fist) to grip the object.</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="text-cyan-600 font-bold">3.</span>
          <span>Move arm to the green Place Zone on the right.</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="text-cyan-600 font-bold">4.</span>
          <span>Open hand to release and confirm placement!</span>
        </div>
      </div>

      {/* Reset button */}
      <button
        onClick={onResetObjects}
        className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Reset Station Positions</span>
      </button>
    </div>
  );
};
