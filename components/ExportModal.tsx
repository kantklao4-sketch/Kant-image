/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CloseIcon } from './icons';

interface ExportModalProps {
  imageFile: File | null;
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ imageFile, onClose }) => {
  const defaultFileName = `edited-${imageFile?.name.split('.').slice(0, -1).join('.') || 'image'}`;
  const [fileName, setFileName] = useState<string>(defaultFileName);
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [isProcessing, setIsProcessing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(async () => {
    if (!imageFile || !fileName.trim()) return;

    setIsProcessing(true);
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(imageFile);
      img.src = objectUrl;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (err) => reject(err);
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }
      ctx.drawImage(img, 0, 0);
      
      URL.revokeObjectURL(objectUrl);
      
      const mimeType = `image/${format}`;
      const dataUrl = canvas.toDataURL(mimeType, format === 'jpeg' ? 0.9 : undefined);
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${fileName.trim()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onClose();

    } catch (error) {
      console.error("Failed to process image for download:", error);
      // In a real app, you might want to show an error message to the user here.
    } finally {
      setIsProcessing(false);
    }
  }, [imageFile, fileName, format, onClose]);

  // Handle closing modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle closing modal on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div ref={modalRef} className="relative bg-gray-800 border border-gray-700 rounded-xl p-8 w-full max-w-md flex flex-col gap-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="export-title" className="text-2xl font-bold text-white">ส่งออกรูปภาพ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close modal">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div>
          <label htmlFor="filename" className="block text-sm font-medium text-gray-300 mb-2">ชื่อไฟล์</label>
          <input
            type="text"
            id="filename"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-600 text-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            placeholder="เช่น my-edited-photo"
          />
        </div>

        <fieldset>
            <legend className="block text-sm font-medium text-gray-300 mb-2">รูปแบบไฟล์</legend>
            <div className="grid grid-cols-2 gap-2 bg-gray-900/50 p-1 rounded-lg">
                <button
                    onClick={() => setFormat('png')}
                    role="radio"
                    aria-checked={format === 'png'}
                    className={`w-full font-semibold py-2 rounded-md transition-all duration-200 text-base ${format === 'png' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                >
                    PNG
                </button>
                <button
                    onClick={() => setFormat('jpeg')}
                    role="radio"
                    aria-checked={format === 'jpeg'}
                    className={`w-full font-semibold py-2 rounded-md transition-all duration-200 text-base ${format === 'jpeg' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                >
                    JPEG
                </button>
            </div>
        </fieldset>

        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            onClick={onClose}
            className="bg-white/10 text-gray-200 font-semibold py-3 px-6 rounded-lg transition-colors hover:bg-white/20"
            disabled={isProcessing}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleDownload}
            disabled={isProcessing || !fileName.trim()}
            className="bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          >
            {isProcessing ? 'กำลังประมวลผล...' : 'ดาวน์โหลด'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;