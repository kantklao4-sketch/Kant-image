/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface FilterPanelProps {
  onApplyFilter: (prompt: string, additionalPrompt: string) => void;
  isLoading: boolean;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ onApplyFilter, isLoading }) => {
  const [selectedPresetPrompt, setSelectedPresetPrompt] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [additionalPrompt, setAdditionalPrompt] = useState('');

  const presets = [
    { name: 'ซินธ์เวฟ', prompt: 'Transform the image with a retro 80s synthwave aesthetic. Add vibrant neon glows, especially magenta, cyan, and electric blue. Incorporate a subtle grid pattern on the floor or background if appropriate, and finish with a slight CRT scan line effect for that authentic retro-futuristic feel.' },
    { name: 'อนิเมะ', prompt: 'Convert the photo into a vibrant, high-quality Japanese anime style. Emphasize expressive eyes, apply clean, bold outlines, use cel-shading for dramatic lighting, and boost color saturation to create a lively, animated look reminiscent of a modern anime film.' },
    { name: 'โลโม่', prompt: 'Apply a classic Lomography film effect. Create high-contrast, heavily saturated colors with a strong cross-processed look. Introduce a heavy, dark vignette around the edges and a bit of light leak for an authentic, unpredictable, and artistic analog camera feel.' },
    { name: 'กลิตช์', prompt: 'Induce a futuristic digital glitch effect. Introduce artifacts like datamoshing, pixel sorting, and screen tearing. Add prominent chromatic aberration (RGB color separation) and scan lines to make it look like a corrupted digital file or a malfunctioning holographic projection.' },
  ];
  
  const activePrompt = selectedPresetPrompt || customPrompt;

  const handlePresetClick = (prompt: string) => {
    setSelectedPresetPrompt(prompt);
    setCustomPrompt('');
  };
  
  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPrompt(e.target.value);
    setSelectedPresetPrompt(null);
  };

  const handleApply = () => {
    if (activePrompt) {
      onApplyFilter(activePrompt, additionalPrompt);
    }
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-center text-gray-300">เลือกฟิลเตอร์</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {presets.map(preset => (
          <button
            key={preset.name}
            onClick={() => handlePresetClick(preset.prompt)}
            disabled={isLoading}
            className={`w-full text-center bg-white/10 border border-transparent text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/20 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed ${selectedPresetPrompt === preset.prompt ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500' : ''}`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={customPrompt}
        onChange={handleCustomChange}
        placeholder="หรืออธิบายฟิลเตอร์ที่ต้องการ (เช่น 'แสงนีออนสไตล์ยุค 80')"
        className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
        disabled={isLoading}
      />
      <input
        type="text"
        value={additionalPrompt}
        onChange={(e) => setAdditionalPrompt(e.target.value)}
        placeholder="คำสั่งเพิ่มเติม (ไม่บังคับ)"
        className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading}
      />
      
      {activePrompt && (
        <div className="animate-fade-in flex flex-col gap-4 pt-2">
          <button
            onClick={handleApply}
            className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            disabled={isLoading || !activePrompt.trim()}
          >
            ใช้ฟิลเตอร์นี้
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;