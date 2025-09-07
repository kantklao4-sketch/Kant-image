/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';

interface StartScreenProps {
  onFileSelect: (files: FileList | null) => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileSelect(e.target.files);
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files);
    }
  }, [onFileSelect]);

  const greetingText = 'พี่กันต์ สวัสดีครับ';

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`w-full max-w-3xl mx-auto flex flex-col items-center justify-center p-8 transition-all duration-300 rounded-2xl ${
        isDragging ? 'bg-blue-500/20 border-blue-400 scale-105' : 'bg-gray-800/50 border-gray-700'
      } border-2 border-dashed`}
    >
      <div className="text-center">
        <h1 className="text-6xl font-extrabold tracking-tight mb-4 animate-fade-in-down bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent pb-2">
          <span className="wave-container">
            {greetingText.split('').map((char, index) => (
              <span
                key={index}
                className="wave-char"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </span>
        </h1>
        <p className="text-lg text-gray-400 mb-8 animate-fade-in-down" style={{ animationDelay: '0.2s' }}>
            รีทัชรูปภาพ, ใส่ฟิลเตอร์สร้างสรรค์, หรือปรับแต่งอย่างมืออาชีพโดยใช้แค่ข้อความ. ไม่ต้องใช้เครื่องมือซับซ้อน.
        </p>
        <div className="animate-fade-in-down" style={{ animationDelay: '0.4s' }}>
          <label htmlFor="file-upload" className="cursor-pointer bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 inline-flex items-center gap-3">
            <UploadIcon className="w-6 h-6" />
            เลือกรูปภาพ หรือลากมาวางที่นี่
          </label>
          <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
