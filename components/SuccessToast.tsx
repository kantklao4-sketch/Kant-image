/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect } from 'react';
import { CloseIcon, SuccessIcon } from './icons';

interface SuccessToastProps {
  message: string;
  onClose: () => void;
}

const SuccessToast: React.FC<SuccessToastProps> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-dismiss after 5 seconds

    return () => {
      clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div
      className="fixed top-24 left-1/2 -translate-x-1/2 w-full max-w-lg p-4 bg-green-600/95 border border-green-500/50 text-white rounded-xl shadow-2xl z-[100] animate-fade-in backdrop-blur-sm flex items-start gap-4"
      role="alert"
    >
      <div className="flex-shrink-0 pt-0.5">
        <SuccessIcon className="w-6 h-6" />
      </div>
      <div className="flex-grow">
        <p className="font-bold text-lg">สำเร็จ</p>
        <p className="text-sm text-green-100">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="p-1 -mr-1 -mt-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0"
        aria-label="ปิดการแจ้งเตือน"
      >
        <CloseIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default SuccessToast;