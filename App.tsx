/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { generateEditedImage, generateFilteredImage, generateAdjustedImage, generateFaceSwapImage, generateRemovedBgImage } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import { UndoIcon, RedoIcon, EyeIcon, UploadIcon, MagicWandIcon, PaletteIcon, SunIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import ExportModal from './components/ExportModal';
import ErrorToast from './components/ErrorToast';
import SuccessToast from './components/SuccessToast';
import RemoveBackgroundPanel from './components/RemoveBackgroundPanel';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type Tab = 'retouch' | 'faceswap' | 'adjust' | 'filters' | 'crop' | 'remove-bg';

const tabDisplayNames: Record<Tab, string> = {
  retouch: 'รีทัช',
  faceswap: 'สลับใบหน้า',
  adjust: 'ปรับแต่ง',
  filters: 'ฟิลเตอร์',
  crop: 'ตัดภาพ',
  'remove-bg': 'ลบพื้นหลัง',
};

// Crop helper function
function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

const App: React.FC = () => {
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [additionalPrompt, setAdditionalPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editHotspot, setEditHotspot] = useState<{ x: number, y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number, y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  const [secondaryImage, setSecondaryImage] = useState<File | null>(null);
  const [retouchScale, setRetouchScale] = useState<number>(100);
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [isTransparent, setIsTransparent] = useState<boolean>(() => {
    const saved = localStorage.getItem('transparentBackground');
    return saved === 'true';
  });
  const imgRef = useRef<HTMLImageElement>(null);

  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | null>(null);


  // Effect to persist transparency setting
  useEffect(() => {
    localStorage.setItem('transparentBackground', String(isTransparent));
  }, [isTransparent]);

  // Effect to create and revoke object URLs safely for the current image
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
  // Effect to create and revoke object URLs safely for the original image
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);

  // Effect to create and revoke object URLs safely for the secondary image
  useEffect(() => {
    if (secondaryImage) {
        const url = URL.createObjectURL(secondaryImage);
        setSecondaryImageUrl(url);
        return () => URL.revokeObjectURL(url);
    }
    setSecondaryImageUrl(null);
  }, [secondaryImage]);


  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const addImageToHistory = useCallback((newImageFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
    setSecondaryImage(null);
    setAdditionalPrompt('');
    setRetouchScale(100);
  }, [history, historyIndex]);

  const handleImageUpload = useCallback((file: File) => {
    setError(null);
    setHistory([file]);
    setHistoryIndex(0);
    setSuccessMessage('อัปโหลดรูปภาพสำเร็จแล้ว!');
    setEditHotspot(null);
    setDisplayHotspot(null);
    setActiveTab('retouch');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setSecondaryImage(null);
    setAdditionalPrompt('');
    setRetouchScale(100);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!currentImage) {
      setError('ยังไม่ได้โหลดรูปภาพเพื่อแก้ไข');
      return;
    }
    
    if (!prompt.trim()) {
        setError('กรุณาใส่คำอธิบายการแก้ไขของคุณ');
        return;
    }

    if (!editHotspot) {
        setError('กรุณาคลิกบนภาพเพื่อเลือกพื้นที่ที่ต้องการแก้ไข');
        return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
        const editedImageUrl = await generateEditedImage(currentImage, prompt, editHotspot, additionalPrompt, isTransparent, retouchScale / 100);
        const newImageFile = dataURLtoFile(editedImageUrl, `edited-${Date.now()}.png`);
        addImageToHistory(newImageFile);
        setPrompt('');
        setEditHotspot(null);
        setDisplayHotspot(null);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`สร้างรูปภาพไม่สำเร็จ ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, editHotspot, addImageToHistory, additionalPrompt, isTransparent, retouchScale]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string, additionalPrompt: string) => {
    if (!currentImage) {
      setError('ยังไม่ได้โหลดรูปภาพเพื่อใช้ฟิลเตอร์');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(currentImage, filterPrompt, additionalPrompt, isTransparent);
        const newImageFile = dataURLtoFile(filteredImageUrl, `filtered-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`ใช้ฟิลเตอร์ไม่สำเร็จ ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, isTransparent]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string, additionalPrompt: string) => {
    if (!currentImage) {
      setError('ยังไม่ได้โหลดรูปภาพเพื่อปรับแต่ง');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateAdjustedImage(currentImage, adjustmentPrompt, secondaryImage, additionalPrompt, isTransparent);
        const newImageFile = dataURLtoFile(adjustedImageUrl, `adjusted-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`ปรับแต่งไม่สำเร็จ ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, secondaryImage, isTransparent]);

  const handleApplyFaceSwap = useCallback(async () => {
    if (!currentImage || !secondaryImage) {
      setError('กรุณาอัปโหลดทั้งภาพต้นฉบับและภาพเป้าหมายเพื่อทำการสลับใบหน้า');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const swappedImageUrl = await generateFaceSwapImage(currentImage, secondaryImage, additionalPrompt, isTransparent);
      const newImageFile = dataURLtoFile(swappedImageUrl, `faceswap-${Date.now()}.png`);
      addImageToHistory(newImageFile);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`สลับใบหน้าไม่สำเร็จ ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [currentImage, secondaryImage, addImageToHistory, additionalPrompt, isTransparent]);
  
  const handleApplyRemoveBackground = useCallback(async (additionalPrompt: string) => {
    if (!currentImage) {
      setError('ยังไม่ได้โหลดรูปภาพเพื่อลบพื้นหลัง');
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const removedBgImageUrl = await generateRemovedBgImage(currentImage, additionalPrompt, isTransparent);
      const newImageFile = dataURLtoFile(removedBgImageUrl, `removed-bg-${Date.now()}.png`);
      addImageToHistory(newImageFile);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`ลบพื้นหลังไม่สำเร็จ ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, isTransparent]);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTab !== 'retouch' || !imgRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If a hotspot exists, check if the click is on the hotspot to remove it.
    if (displayHotspot) {
      const distance = Math.sqrt(Math.pow(x - displayHotspot.x, 2) + Math.pow(y - displayHotspot.y, 2));
      // The hotspot is 24px wide (w-6), so a radius of 12 is the target.
      // Use a slightly larger radius for easier clicking.
      if (distance < 15) {
        setDisplayHotspot(null);
        setEditHotspot(null);
        return; // Exit: hotspot removed
      }
    }

    // If no hotspot, or click was outside the existing one, set/move the hotspot.
    const { naturalWidth, naturalHeight, width, height } = imgRef.current;
    const widthScale = naturalWidth / width;
    const heightScale = naturalHeight / height;
    
    const actualX = Math.round(x * widthScale);
    const actualY = Math.round(y * heightScale);

    setEditHotspot({ x: actualX, y: actualY });
    setDisplayHotspot({ x, y });
    setPrompt(''); // Clear prompt on new hotspot
  };

  const handleTabChange = (newTab: Tab) => {
    // When leaving the retouch tab, clear the hotspot state
    if (activeTab === 'retouch' && newTab !== 'retouch') {
        setEditHotspot(null);
        setDisplayHotspot(null);
    }
    setActiveTab(newTab);
  };

  const handleUndo = useCallback(() => {
    if (canUndo) setHistoryIndex(historyIndex - 1);
  }, [canUndo, historyIndex]);

  const handleRedo = useCallback(() => {
    if (canRedo) setHistoryIndex(historyIndex + 1);
  }, [canRedo, historyIndex]);
  
  const handleSecondaryImageUpload = (file: File) => {
    setSecondaryImage(file);
  };
  
  const handleClearSecondaryImage = () => {
    setSecondaryImage(null);
  }

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current || !currentImage) {
      setError('กรุณาเลือกพื้นที่ที่จะตัดก่อน');
      return;
    }
  
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
  
    const cropX = completedCrop.x * scaleX;
    const cropY = completedCrop.y * scaleY;
    const cropWidth = completedCrop.width * scaleX;
    const cropHeight = completedCrop.height * scaleY;
  
    if (cropWidth === 0 || cropHeight === 0) {
      setError('พื้นที่ที่เลือกตัดมีขนาดเล็กเกินไป');
      return;
    }
  
    canvas.width = cropWidth;
    canvas.height = cropHeight;
  
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError("ไม่สามารถสร้าง canvas สำหรับการตัดภาพได้");
      return;
    }
  
    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );
  
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `cropped-${Date.now()}.png`, { type: 'image/png' });
        addImageToHistory(file);
        setActiveTab('retouch'); // Switch back after cropping
      }
    }, 'image/png');
  
  }, [completedCrop, currentImage, addImageToHistory]);
  
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (aspect) {
      const { width, height } = e.currentTarget
      const newCrop = centerAspectCrop(width, height, aspect);
      setCrop(newCrop);
      setCompletedCrop(newCrop);
    }
  }
  
  const tabIcons: Record<Tab, React.ReactNode> = {
    retouch: <MagicWandIcon className="w-5 h-5 mr-2" />,
    faceswap: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>,
    adjust: <SunIcon className="w-5 h-5 mr-2" />,
    filters: <PaletteIcon className="w-5 h-5 mr-2" />,
    crop: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>,
    'remove-bg': <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4 selection:bg-blue-500/30">
      <Header />
      {error && <ErrorToast message={error} onClose={() => setError(null)} />}
      {successMessage && <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />}
      
      <main className="w-full max-w-7xl flex-1 flex flex-col items-center justify-center">
        {!currentImage ? (
          <StartScreen onFileSelect={(files) => files && files.length > 0 && handleImageUpload(files[0])} />
        ) : (
          <div className="w-full flex flex-col md:flex-row gap-8 animate-fade-in">
            {/* Left Side: Image Viewer */}
            <div className="flex-1 flex flex-col gap-4 items-center justify-center relative">
              {/* Top Toolbar */}
              <div className="w-full flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-lg p-2 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <button onClick={handleUndo} disabled={!canUndo || isLoading} className="p-2 rounded-md hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" aria-label="Undo"><UndoIcon className="w-5 h-5" /></button>
                  <button onClick={handleRedo} disabled={!canRedo || isLoading} className="p-2 rounded-md hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" aria-label="Redo"><RedoIcon className="w-5 h-5" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onMouseDown={() => setIsComparing(true)}
                    onMouseUp={() => setIsComparing(false)}
                    onTouchStart={() => setIsComparing(true)}
                    onTouchEnd={() => setIsComparing(false)}
                    disabled={isLoading || !originalImage || historyIndex === 0}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <EyeIcon className="w-5 h-5" />
                    <span className="text-sm font-medium">เปรียบเทียบ</span>
                  </button>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300">พื้นหลังโปร่งใส</span>
                        <button
                            onClick={() => setIsTransparent(!isTransparent)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${isTransparent ? 'bg-blue-600' : 'bg-gray-600'}`}
                            role="switch"
                            aria-checked={isTransparent}
                        >
                            <span
                            aria-hidden="true"
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isTransparent ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                        </button>
                    </div>
                  <button
                    onClick={() => setShowExportModal(true)}
                    disabled={isLoading}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ส่งออกรูปภาพ
                  </button>
                </div>
              </div>

              {/* Image container */}
              <div className="relative w-full aspect-w-1 aspect-h-1 flex items-center justify-center bg-black/20 rounded-lg overflow-hidden border border-gray-700">
                {currentImageUrl && (
                  <>
                  { activeTab === 'crop' ? (
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={aspect}
                    >
                        <img
                            ref={imgRef}
                            src={isComparing && originalImageUrl ? originalImageUrl : currentImageUrl}
                            alt="Editor Canvas"
                            className="max-w-full max-h-[70vh] object-contain"
                            style={{ opacity: isLoading ? 0.5 : 1 }}
                            onLoad={onImageLoad}
                        />
                    </ReactCrop>
                  ) : (
                      <img
                        ref={imgRef}
                        src={isComparing && originalImageUrl ? originalImageUrl : currentImageUrl}
                        alt="Editor Canvas"
                        className="max-w-full max-h-[70vh] object-contain cursor-crosshair"
                        style={{ opacity: isLoading ? 0.5 : 1 }}
                        onClick={handleImageClick}
                      />
                  )}
                  
                  {displayHotspot && activeTab === 'retouch' && !isLoading && (
                      <div
                          className="absolute w-6 h-6 border-2 border-white rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2 bg-blue-500/50"
                          style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                      >
                        <div className="absolute inset-0 rounded-full border-2 border-blue-400 animate-pulse-ring"></div>
                      </div>
                  )}
                  </>
                )}
                {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Spinner /></div>}
              </div>
            </div>

            {/* Right Side: Control Panel */}
            <div className="w-full md:w-96 flex-shrink-0 flex flex-col gap-4">
              {/* Tab navigation */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-gray-900/60 rounded-lg border border-gray-700">
                  {(Object.keys(tabDisplayNames) as Tab[]).map((tab) => (
                      <button
                          key={tab}
                          onClick={() => handleTabChange(tab)}
                          disabled={isLoading}
                          className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50 ${
                              activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'
                          }`}
                      >
                          {tabIcons[tab]}
                          {tabDisplayNames[tab]}
                      </button>
                  ))}
              </div>
              
              {/* Retouch Panel */}
              {activeTab === 'retouch' && (
                <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-center text-gray-300">รีทัชด้วย AI</h3>
                  <p className="text-sm text-center text-gray-400 -mt-2">
                      {editHotspot ? 'อธิบายสิ่งที่คุณต้องการเปลี่ยนแปลง ณ จุดที่เลือก' : 'คลิกบนภาพเพื่อเลือกพื้นที่ที่ต้องการแก้ไข'}
                  </p>
                  <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={editHotspot ? 'เช่น: ลบรอยขีดข่วน, เพิ่มรอยสักรูปมังกร, เปลี่ยนแว่นตาเป็นแว่นกันแดด' : 'กรุณาเลือกพื้นที่บนภาพก่อน'}
                      className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
                      rows={3}
                      disabled={isLoading || !editHotspot}
                  />
                  <div className="flex gap-2">
                    <div className="flex-grow">
                      <label htmlFor="additional-prompt" className="sr-only">คำสั่งเพิ่มเติม</label>
                      <input
                        id="additional-prompt"
                        type="text"
                        value={additionalPrompt}
                        onChange={(e) => setAdditionalPrompt(e.target.value)}
                        placeholder="คำสั่งเพิ่มเติม (ไม่บังคับ)"
                        className="bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isLoading || !editHotspot}
                      />
                    </div>
                    <div className="relative w-28">
                       <label htmlFor="retouch-scale" className="sr-only">ปรับขนาด (%)</label>
                       <input
                        id="retouch-scale"
                        type="number"
                        value={retouchScale}
                        onChange={(e) => setRetouchScale(Number(e.target.value))}
                        placeholder="ปรับขนาด"
                        className="bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 pr-8"
                        disabled={isLoading || !editHotspot}
                        min="1"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">%</span>
                    </div>
                  </div>
                  <button
                      onClick={handleGenerate}
                      className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                      disabled={isLoading || !prompt.trim() || !editHotspot}
                  >
                      เริ่มแก้ไข
                  </button>
                </div>
              )}

              {/* Face Swap Panel */}
              {activeTab === 'faceswap' && (
                <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-center text-gray-300">สลับใบหน้าด้วย AI</h3>
                    <div className="w-full bg-gray-900/40 border border-gray-700/60 rounded-lg p-3">
                        <h4 className="text-base font-semibold text-center text-gray-300 mb-3">ภาพเป้าหมาย</h4>
                        {secondaryImageUrl ? (
                          <div 
                            className="relative group w-full h-40 flex items-center justify-center bg-white/5 rounded-md"
                          >
                            <img src={secondaryImageUrl} alt="Target Face" className="max-w-full max-h-full object-contain rounded-md" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                              <button
                                onClick={() => setSecondaryImage(null)}
                                disabled={isLoading}
                                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/20 hover:bg-red-500/30 px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                              >
                                ลบรูปภาพ
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label htmlFor="faceswap-upload" className="relative flex flex-col items-center justify-center w-full h-40 px-4 py-4 text-sm font-semibold text-gray-400 bg-white/5 rounded-md cursor-pointer group hover:bg-white/10 transition-colors border-2 border-dashed border-gray-600 hover:border-gray-500">
                              <UploadIcon className="w-8 h-8 mb-2 text-gray-500 group-hover:text-gray-400 transition-colors" />
                              <span>ลากและวาง หรือ คลิกเพื่ออัปโหลด</span>
                              <span className="text-xs text-gray-500">ภาพใบหน้าที่ต้องการนำไปใส่</span>
                              <input id="faceswap-upload" type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && e.target.files.length > 0 && handleSecondaryImageUpload(e.target.files[0])} disabled={isLoading} />
                          </label>
                        )}
                    </div>
                    <input
                      type="text"
                      value={additionalPrompt}
                      onChange={(e) => setAdditionalPrompt(e.target.value)}
                      placeholder="คำสั่งเพิ่มเติม (ไม่บังคับ)"
                      className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isLoading}
                    />
                    <button
                        onClick={handleApplyFaceSwap}
                        className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                        disabled={isLoading || !secondaryImage}
                    >
                        สลับใบหน้า
                    </button>
                </div>
              )}

              {/* Adjustment Panel */}
              {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} isLoading={isLoading} secondaryImage={secondaryImage} onSecondaryImageUpload={handleSecondaryImageUpload} onClearSecondaryImage={handleClearSecondaryImage}/>}
              
              {/* Filter Panel */}
              {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />}
              
              {/* Crop Panel */}
              {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!(completedCrop?.width && completedCrop?.height)} />}

              {/* Remove Background Panel */}
              {activeTab === 'remove-bg' && <RemoveBackgroundPanel onApplyRemoveBackground={handleApplyRemoveBackground} isLoading={isLoading} />}
            </div>
          </div>
        )}
      </main>

      {showExportModal && currentImage && (
        <ExportModal imageFile={currentImage} onClose={() => setShowExportModal(false)} />
      )}
      <a
        href="externalfile:gnnndjlaomemikopnjhhnoombakkkkdg%3A11a4ecae-457b-4553-af0a-21e93d42f01a%3A9cccaccd2d3720c526a63e22bc22a3883af467b5/index.html"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 text-xs text-gray-400 hover:text-gray-200 hover:underline transition-colors z-50"
      >
        เครื่องมือแต่งภาพสำรอง
      </a>
    </div>
  );
};

export default App;