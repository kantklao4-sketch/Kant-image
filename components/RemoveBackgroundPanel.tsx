/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface RemoveBackgroundPanelProps {
  onApplyRemoveBackground: (additionalPrompt: string) => void;
  isLoading: boolean;
}

const RemoveBackgroundPanel: React.FC<RemoveBackgroundPanelProps> = ({ onApplyRemoveBackground, isLoading }) => {
  const [additionalPrompt, setAdditionalPrompt] = useState('');

  const handleApply = () => {
    onApplyRemoveBackground(additionalPrompt);
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-center text-gray-300">ลบพื้นหลัง</h3>
      <p className="text-sm text-center text-gray-400 -mt-2">AI จะทำการลบพื้นหลังออกจากรูปภาพของคุณโดยอัตโนมัติ</p>
      
      <input
        type="text"
        value={additionalPrompt}
        onChange={(e) => setAdditionalPrompt(e.target.value)}
        placeholder="คำสั่งเพิ่มเติม (เช่น 'เก็บเงาไว้ด้วย')"
        className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
        disabled={isLoading}
      />

      <button
        onClick={handleApply}
        className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
        disabled={isLoading}
      >
        ลบพื้นหลัง
      </button>
    </div>
  );
};

export default RemoveBackgroundPanel;