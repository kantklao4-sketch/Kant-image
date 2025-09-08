/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef } from 'react';
import type { Layer } from '../App';
import { PlusIcon, TrashIcon, EyeIcon, EyeSlashIcon } from './icons';

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string | null;
  onLayerSelect: (id: string) => void;
  onLayerAdd: (file: File) => void;
  onLayerDelete: (id: string) => void;
  // FIX: Renamed prop from onReorderLayers to onLayerReorder for consistency and to fix type error.
  onLayerReorder: (newLayers: Layer[]) => void;
  onLayerOpacityChange: (id: string, opacity: number) => void;
  onLayerVisibilityChange: (id: string) => void;
  isLoading: boolean;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  activeLayerId,
  onLayerSelect,
  onLayerAdd,
  onLayerDelete,
  // FIX: Renamed prop from onReorderLayers to onLayerReorder for consistency and to fix type error.
  onLayerReorder,
  onLayerOpacityChange,
  onLayerVisibilityChange,
  isLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleAddLayerClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onLayerAdd(e.target.files[0]);
    }
    e.target.value = ''; // Reset file input
  };

  const reversedLayers = [...layers].reverse();

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    dragItem.current = index;
    // Set a lower opacity drag image for better UX
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    e.preventDefault();
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
        const reorderedLayers = [...reversedLayers];
        const [draggedItemContent] = reorderedLayers.splice(dragItem.current, 1);
        reorderedLayers.splice(dragOverItem.current, 0, draggedItemContent);
        // FIX: Renamed prop from onReorderLayers to onLayerReorder for consistency and to fix type error.
        onLayerReorder(reorderedLayers.reverse());
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-300">เลเยอร์</h3>
        <button
          onClick={handleAddLayerClick}
          disabled={isLoading}
          className="flex items-center gap-2 p-2 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          aria-label="Add new layer"
        >
          <PlusIcon className="w-5 h-5" />
          <span>เพิ่มเลเยอร์</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
      </div>

      <ul className="flex flex-col gap-2">
        {reversedLayers.map((layer, index) => (
          <li
            key={layer.id}
            draggable={!isLoading}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => onLayerSelect(layer.id)}
            className={`flex flex-col gap-2 p-2 rounded-lg cursor-pointer transition-all duration-200 ${
              activeLayerId === layer.id
                ? 'bg-blue-600/30 ring-2 ring-blue-500'
                : 'bg-gray-900/40 hover:bg-gray-900/80'
            }`}
          >
            <div className="flex items-center gap-3">
              <img src={layer.objectUrl} alt={layer.name} className="w-12 h-12 object-cover rounded-md flex-shrink-0 bg-white/5" />
              <div className="flex-grow overflow-hidden">
                <p className="text-sm font-semibold text-gray-100 truncate">{layer.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                    onClick={(e) => { e.stopPropagation(); onLayerVisibilityChange(layer.id); }}
                    disabled={isLoading}
                    className="p-2 rounded-md hover:bg-white/10 disabled:opacity-40"
                    aria-label={layer.isVisible ? "Hide layer" : "Show layer"}
                >
                    {layer.isVisible ? <EyeIcon className="w-5 h-5" /> : <EyeSlashIcon className="w-5 h-5 text-gray-400" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onLayerDelete(layer.id); }}
                  disabled={isLoading || layers.length <= 1}
                  className="p-2 rounded-md text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent"
                  aria-label="Delete layer"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Opacity slider */}
            <div className="flex items-center gap-2 px-1">
                <label htmlFor={`opacity-${layer.id}`} className="text-xs text-gray-400">ความทึบ</label>
                <input
                    id={`opacity-${layer.id}`}
                    type="range"
                    min="0"
                    max="100"
                    value={layer.opacity}
                    onChange={(e) => { e.stopPropagation(); onLayerOpacityChange(layer.id, parseInt(e.target.value, 10)); }}
                    disabled={isLoading}
                    className="flex-grow h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer range-sm"
                    onClick={(e) => e.stopPropagation()} // Prevent layer selection when clicking slider
                />
                <span className="text-xs font-mono text-gray-300 w-8 text-right">{layer.opacity}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LayerPanel;