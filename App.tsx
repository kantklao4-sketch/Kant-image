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
import LayerPanel from './components/LayerPanel';
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

export interface Layer {
    id: string;
    file: File;
    objectUrl: string;
    name: string;
    opacity: number;
    isVisible: boolean;
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
  const [history, setHistory] = useState<Layer[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

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
  const [fileToExport, setFileToExport] = useState<File | null>(null);
  const [isTransparent, setIsTransparent] = useState<boolean>(() => {
    const saved = localStorage.getItem('transparentBackground');
    return saved === 'true';
  });
  const [flattenedImageForCropUrl, setFlattenedImageForCropUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const activeLayer = layers.find(l => l.id === activeLayerId);
  const beforeLayers = history[0] || [];
  const currentLayersToDisplay = isComparing ? beforeLayers : layers;

  // Effect to persist transparency setting
  useEffect(() => {
    localStorage.setItem('transparentBackground', String(isTransparent));
  }, [isTransparent]);
  
  // Effect to manage object URLs and prevent memory leaks
  useEffect(() => {
      layers.forEach(layer => {
          if (!layer.objectUrl) {
              layer.objectUrl = URL.createObjectURL(layer.file);
          }
      });

      return () => {
          layers.forEach(layer => {
              // This cleanup logic is tricky with history. A better approach
              // might be to revoke URLs only when they are truly removed from all history states.
              // For simplicity, we might leak some URLs, but it's safer than revoking URLs still in use by the history state.
          });
      };
  }, [layers]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const commitChanges = useCallback((newLayers: Layer[], options: { addToHistory: boolean } = { addToHistory: true }) => {
    // Revoke old URLs that are being replaced
    newLayers.forEach(newLayer => {
      const oldLayer = layers.find(l => l.id === newLayer.id);
      if (oldLayer && oldLayer.file !== newLayer.file) {
        URL.revokeObjectURL(oldLayer.objectUrl);
      }
    });

    setLayers(newLayers);

    if (options.addToHistory) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newLayers);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
    setSecondaryImage(null);
    setAdditionalPrompt('');
    setRetouchScale(100);
  }, [history, historyIndex, layers]);

  const handleImageUpload = useCallback((file: File) => {
    setError(null);
    const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        file,
        objectUrl: URL.createObjectURL(file),
        name: 'Background',
        opacity: 100,
        isVisible: true,
    };
    setLayers([newLayer]);
    setActiveLayerId(newLayer.id);
    setHistory([[newLayer]]);
    setHistoryIndex(0);
    setSuccessMessage('อัปโหลดรูปภาพสำเร็จแล้ว!');
    setEditHotspot(null);
    setDisplayHotspot(null);
    setActiveTab('retouch');
  }, []);
  
  const handleAddLayer = useCallback((file: File) => {
    if (layers.length === 0) {
        handleImageUpload(file);
        return;
    }
    const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        file,
        objectUrl: URL.createObjectURL(file),
        name: `Layer ${layers.length}`,
        opacity: 100,
        isVisible: true,
    };
    const newLayers = [...layers, newLayer];
    commitChanges(newLayers);
    setActiveLayerId(newLayer.id);
  }, [layers, commitChanges, handleImageUpload]);
  
  const handleGenerate = useCallback(async () => {
    if (!activeLayer) {
      setError('ยังไม่ได้เลือกเลเยอร์เพื่อแก้ไข');
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
        const editedImageUrl = await generateEditedImage(activeLayer.file, prompt, editHotspot, additionalPrompt, isTransparent, retouchScale / 100);
        const newImageFile = dataURLtoFile(editedImageUrl, `edited-${Date.now()}.png`);
        
        const updatedLayers = layers.map(l => 
            l.id === activeLayerId 
                ? { ...l, file: newImageFile, objectUrl: URL.createObjectURL(newImageFile) } 
                : l
        );
        commitChanges(updatedLayers);

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
  }, [activeLayer, prompt, editHotspot, additionalPrompt, isTransparent, retouchScale, layers, activeLayerId, commitChanges]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string, additionalPrompt: string) => {
    if (!activeLayer) {
      setError('ยังไม่ได้เลือกเลเยอร์เพื่อใช้ฟิลเตอร์');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(activeLayer.file, filterPrompt, additionalPrompt, isTransparent);
        const newImageFile = dataURLtoFile(filteredImageUrl, `filtered-${Date.now()}.png`);
        const updatedLayers = layers.map(l => 
            l.id === activeLayerId 
                ? { ...l, file: newImageFile, objectUrl: URL.createObjectURL(newImageFile) } 
                : l
        );
        commitChanges(updatedLayers);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`ใช้ฟิลเตอร์ไม่สำเร็จ ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [activeLayer, activeLayerId, layers, commitChanges, isTransparent]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string, additionalPrompt: string) => {
    if (!activeLayer) {
      setError('ยังไม่ได้เลือกเลเยอร์เพื่อปรับแต่ง');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateAdjustedImage(activeLayer.file, adjustmentPrompt, secondaryImage, additionalPrompt, isTransparent);
        const newImageFile = dataURLtoFile(adjustedImageUrl, `adjusted-${Date.now()}.png`);
        const updatedLayers = layers.map(l => 
            l.id === activeLayerId 
                ? { ...l, file: newImageFile, objectUrl: URL.createObjectURL(newImageFile) } 
                : l
        );
        commitChanges(updatedLayers);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`ปรับแต่งไม่สำเร็จ ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [activeLayer, activeLayerId, layers, commitChanges, secondaryImage, isTransparent]);

  const handleApplyFaceSwap = useCallback(async () => {
    if (!activeLayer || !secondaryImage) {
      setError('กรุณาเลือกเลเยอร์และอัปโหลดภาพเป้าหมายเพื่อทำการสลับใบหน้า');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const swappedImageUrl = await generateFaceSwapImage(activeLayer.file, secondaryImage, additionalPrompt, isTransparent);
      const newImageFile = dataURLtoFile(swappedImageUrl, `faceswap-${Date.now()}.png`);
      const updatedLayers = layers.map(l => 
          l.id === activeLayerId 
                ? { ...l, file: newImageFile, objectUrl: URL.createObjectURL(newImageFile) } 
                : l
      );
      commitChanges(updatedLayers);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`สลับใบหน้าไม่สำเร็จ: ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [activeLayer, activeLayerId, secondaryImage, additionalPrompt, isTransparent, layers, commitChanges]);
  
  const handleRemoveBackground = useCallback(async (additionalPrompt: string) => {
    if (!activeLayer) {
        setError('ยังไม่ได้เลือกเลเยอร์เพื่อลบพื้นหลัง');
        return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const removedBgImageUrl = await generateRemovedBgImage(activeLayer.file, additionalPrompt, isTransparent);
        const newImageFile = dataURLtoFile(removedBgImageUrl, `removed-bg-${Date.now()}.png`);
        const updatedLayers = layers.map(l => 
            l.id === activeLayerId 
                ? { ...l, file: newImageFile, objectUrl: URL.createObjectURL(newImageFile) } 
                : l
        );
        commitChanges(updatedLayers);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`ลบพื้นหลังไม่สำเร็จ: ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [activeLayer, activeLayerId, isTransparent, layers, commitChanges]);
  
  const flattenLayersForCrop = useCallback(async (): Promise<string | null> => {
    if (layers.length === 0) return null;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const firstVisibleLayer = layers.find(l => l.isVisible);
    if (!firstVisibleLayer) return null;

    // Load the first image to get dimensions
    const baseImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = firstVisibleLayer.objectUrl;
    });

    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;

    for (const layer of layers) {
      if (layer.isVisible) {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            ctx.globalAlpha = layer.opacity / 100;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve();
          };
          img.onerror = reject;
          img.src = layer.objectUrl;
        });
      }
    }
    return canvas.toDataURL();
  }, [layers]);

  const handleApplyCrop = useCallback(async () => {
      if (!completedCrop || !flattenedImageForCropUrl || !activeLayer) {
        setError('กรุณาเลือกพื้นที่ก่อนทำการตัดภาพ');
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const image = new Image();
        image.src = flattenedImageForCropUrl;
        await new Promise(resolve => { image.onload = resolve; });
        
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        
        canvas.width = completedCrop.width * scaleX;
        canvas.height = completedCrop.height * scaleY;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');
        
        ctx.drawImage(
            image,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );
        
        const croppedDataUrl = canvas.toDataURL('image/png');
        const newImageFile = dataURLtoFile(croppedDataUrl, `cropped-${Date.now()}.png`);
        
        // Replace active layer with the cropped version, delete others
        const newLayer: Layer = {
            ...activeLayer,
            file: newImageFile,
            objectUrl: URL.createObjectURL(newImageFile),
            name: 'Cropped Image',
        };
        
        commitChanges([newLayer]);
        setActiveTab('retouch'); // Switch back to a default tab
      } catch(err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`ตัดภาพไม่สำเร็จ: ${errorMessage}`);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
  }, [completedCrop, flattenedImageForCropUrl, activeLayer, commitChanges]);
  
  const handleUndo = useCallback(() => {
    if (canUndo) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setLayers(history[newIndex]);
    }
  }, [canUndo, historyIndex, history]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setLayers(history[newIndex]);
    }
  }, [canRedo, historyIndex, history]);

  const handleDeleteLayer = useCallback((id: string) => {
    const newLayers = layers.filter(l => l.id !== id);
    if (newLayers.length > 0) {
      if (activeLayerId === id) {
        setActiveLayerId(newLayers[newLayers.length - 1].id);
      }
      commitChanges(newLayers);
    } else {
      // If last layer is deleted, reset the app state
      setLayers([]);
      setHistory([]);
      setHistoryIndex(-1);
      setActiveLayerId(null);
    }
  }, [layers, activeLayerId, commitChanges]);

  const handleReorderLayers = useCallback((reordered: Layer[]) => {
    commitChanges(reordered);
  }, [commitChanges]);

  const handleLayerOpacityChange = useCallback((id: string, opacity: number) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, opacity } : l);
    // Don't add to history for simple slider adjustments for better UX
    commitChanges(newLayers, { addToHistory: false });
    // But we need a way to commit the final state, maybe on drag end, but this is simpler for now.
  }, [layers, commitChanges]);
  
  const commitOpacityChange = useCallback(() => {
    // This function can be called on mouse up from the slider to commit to history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(layers);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex, layers]);

  const handleLayerVisibilityChange = useCallback((id: string) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, isVisible: !l.isVisible } : l);
    commitChanges(newLayers);
  }, [layers, commitChanges]);
  
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (files && files[0]) {
      handleImageUpload(files[0]);
    }
  }, [handleImageUpload]);
  
  // Prepare for cropping when switching to the crop tab
  useEffect(() => {
    if (activeTab === 'crop') {
      flattenLayersForCrop().then(url => {
        setFlattenedImageForCropUrl(url);
      });
    } else {
      setFlattenedImageForCropUrl(null);
    }
  }, [activeTab, flattenLayersForCrop]);
  
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (aspect) {
        setCrop(centerAspectCrop(width, height, aspect));
    }
  };
  
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTab !== 'retouch') return;
    
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    
    setEditHotspot({ x, y });
    setDisplayHotspot({ x, y });
  };
  
  const handleExport = useCallback(() => {
    setIsLoading(true);
    flattenLayersForCrop()
      .then(dataUrl => {
        if(dataUrl) {
            const file = dataURLtoFile(dataUrl, `export-${Date.now()}.png`);
            setFileToExport(file);
            setShowExportModal(true);
        } else {
            setError("Could not prepare image for export.");
        }
      })
      .catch(err => {
        console.error("Export failed:", err);
        setError("Could not prepare image for export.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [flattenLayersForCrop]);


  if (layers.length === 0) {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4">
            <main className="w-full flex-grow flex items-center justify-center">
                <StartScreen onFileSelect={handleFileSelect} />
            </main>
        </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4">
      <Header />
      {error && <ErrorToast message={error} onClose={() => setError(null)} />}
      {successMessage && <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />}
      {showExportModal && <ExportModal imageFile={fileToExport} onClose={() => setShowExportModal(false)} />}
      
      <main className="w-full max-w-7xl flex-grow flex flex-col md:flex-row gap-4">
        {/* Left Panel */}
        <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
            <LayerPanel
                layers={layers}
                activeLayerId={activeLayerId}
                onLayerSelect={setActiveLayerId}
                onLayerAdd={handleAddLayer}
                onLayerDelete={handleDeleteLayer}
                onLayerReorder={handleReorderLayers}
                onLayerOpacityChange={handleLayerOpacityChange}
                onLayerVisibilityChange={handleLayerVisibilityChange}
                isLoading={isLoading}
            />
            <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-2 animate-fade-in backdrop-blur-sm">
                <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-base font-semibold text-gray-300">พื้นหลังโปร่งใส</span>
                    <div className="relative">
                        <input type="checkbox" checked={isTransparent} onChange={() => setIsTransparent(!isTransparent)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                </label>
                <p className="text-xs text-gray-400">เมื่อเปิดใช้งาน, AI จะพยายามสร้างผลลัพธ์ที่มีพื้นหลังโปร่งใส (เหมาะสำหรับ 'ลบพื้นหลัง')</p>
            </div>
        </div>

        {/* Center Panel: Image and Toolbar */}
        <div className="flex-grow flex flex-col gap-4 items-center">
          <div className="w-full flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-lg p-2 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo || isLoading}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Undo"
                >
                    <UndoIcon className="w-6 h-6" />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo || isLoading}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Redo"
                >
                    <RedoIcon className="w-6 h-6" />
                </button>
                <div className="h-6 w-px bg-gray-600"></div>
                <button
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={isLoading || layers.length === 0}
                  aria-label="Hold to compare with original"
                >
                  <EyeIcon className="w-6 h-6" />
                </button>
              </div>
              <button
                onClick={handleExport}
                disabled={isLoading}
                className="bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
              >
                ส่งออก
              </button>
          </div>
          
          <div className="w-full h-[60vh] bg-black/30 rounded-lg flex items-center justify-center overflow-hidden relative border border-gray-700">
            {isLoading && (
              <div className="absolute inset-0 bg-black/70 z-20 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
                <Spinner />
                <p className="text-lg font-semibold text-gray-300 animate-pulse">AI กำลังทำงาน...</p>
              </div>
            )}
            
            {activeTab === 'crop' && flattenedImageForCropUrl ? (
                <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={aspect}
                    className="max-w-full max-h-full"
                >
                    <img
                        ref={imgRef}
                        src={flattenedImageForCropUrl}
                        alt="Image for cropping"
                        onLoad={onImageLoad}
                        style={{ maxHeight: '60vh', objectFit: 'contain' }}
                    />
                </ReactCrop>
            ) : (
                <div ref={imageContainerRef} className="relative w-full h-full" onClick={handleImageClick}>
                    {currentLayersToDisplay.map(layer => (
                        layer.isVisible && (
                            <img
                                key={layer.id}
                                src={layer.objectUrl}
                                alt={layer.name}
                                style={{ opacity: layer.opacity / 100 }}
                                className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
                            />
                        )
                    ))}
                    {displayHotspot && activeTab === 'retouch' && (
                      <div
                        className="absolute z-10 pointer-events-none"
                        style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px`, transform: 'translate(-50%, -50%)' }}
                      >
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-blue-500/50"></div>
                        <div className="w-8 h-8 rounded-full border-2 border-white absolute top-0 left-0 animate-pulse-ring"></div>
                      </div>
                    )}
                </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-full md:w-96 flex-shrink-0 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-1 bg-gray-800/50 border border-gray-700 rounded-lg p-1 backdrop-blur-sm">
                {(Object.keys(tabDisplayNames) as Tab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        disabled={isLoading}
                        className={`w-full font-semibold py-2 rounded-md transition-all duration-200 text-sm ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                    >
                        {tabDisplayNames[tab]}
                    </button>
                ))}
            </div>
            
            {activeTab === 'retouch' && (
                <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-center text-gray-300">รีทัชด้วย AI</h3>
                  <p className="text-sm text-center text-gray-400 -mt-2">คลิกบนภาพเพื่อเลือกพื้นที่ แล้วอธิบายการแก้ไขของคุณ</p>
                  <div className="flex items-center gap-2">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="เช่น 'ลบคนนี้ออก' หรือ 'เพิ่มหมวกให้หน่อย'"
                      className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full h-24 resize-none disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isLoading}
                    />
                  </div>
                  <input
                      type="text"
                      value={additionalPrompt}
                      onChange={(e) => setAdditionalPrompt(e.target.value)}
                      placeholder="คำสั่งเพิ่มเติม (ไม่บังคับ)"
                      className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isLoading}
                  />
                  <div className="flex items-center gap-3">
                      <label htmlFor="retouch-scale" className="text-sm font-medium text-gray-400">ขนาด:</label>
                      <input id="retouch-scale" type="range" min="50" max="150" value={retouchScale} onChange={(e) => setRetouchScale(parseInt(e.target.value))} className="flex-grow" disabled={isLoading}/>
                      <span className="text-sm font-mono text-gray-300">{retouchScale}%</span>
                  </div>
                  <button
                    onClick={handleGenerate}
                    className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                    disabled={isLoading || !prompt.trim() || !editHotspot}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <MagicWandIcon className="w-5 h-5"/>
                      <span>สร้างภาพ</span>
                    </div>
                  </button>
                </div>
            )}

            {activeTab === 'faceswap' && (
              <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-center text-gray-300">สลับใบหน้า</h3>
                <p className="text-sm text-center text-gray-400 -mt-2">อัปโหลดภาพที่มีใบหน้าที่คุณต้องการใช้ (ภาพต้นฉบับ)</p>
                <label htmlFor="faceswap-upload" className="relative flex items-center justify-center w-full px-4 py-4 text-sm font-semibold text-gray-300 bg-white/5 rounded-md cursor-pointer group hover:bg-white/10 transition-colors border-2 border-dashed border-gray-600 hover:border-gray-500">
                    <UploadIcon className="w-5 h-5 mr-2" />
                    {secondaryImage ? 'เปลี่ยนภาพต้นฉบับ' : 'อัปโหลดภาพต้นฉบับ'}
                    <input id="faceswap-upload" type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && setSecondaryImage(e.target.files[0])} disabled={isLoading} />
                </label>
                {secondaryImage && (
                    <div className="flex items-center gap-3 p-2 bg-white/5 rounded-md">
                        <img src={URL.createObjectURL(secondaryImage)} alt="Source face" className="w-14 h-14 object-cover rounded-md flex-shrink-0" />
                        <div className="flex-grow overflow-hidden">
                            <p className="text-sm font-medium text-gray-200 truncate">{secondaryImage.name}</p>
                            <p className="text-xs text-gray-400">{`${(secondaryImage.size / 1024).toFixed(1)} KB`}</p>
                        </div>
                    </div>
                )}
                <input
                      type="text"
                      value={additionalPrompt}
                      onChange={(e) => setAdditionalPrompt(e.target.value)}
                      placeholder="คำสั่งเพิ่มเติม (ไม่บังคับ)"
                      className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isLoading}
                  />
                <button onClick={handleApplyFaceSwap} disabled={isLoading || !secondaryImage || !activeLayer} className="w-full bg-gradient-to-br from-purple-600 to-purple-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-purple-800 disabled:to-purple-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none">
                  สลับใบหน้า
                </button>
              </div>
            )}

            {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />}
            {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} isLoading={isLoading} secondaryImage={secondaryImage} onSecondaryImageUpload={setSecondaryImage} onClearSecondaryImage={() => setSecondaryImage(null)} />}
            {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop} />}
            {activeTab === 'remove-bg' && <RemoveBackgroundPanel onApplyRemoveBackground={handleRemoveBackground} isLoading={isLoading} />}
        </div>
      </main>
    </div>
  );
};

export default App;
