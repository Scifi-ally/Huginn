import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crop, ArrowsOut, ArrowClockwise, MagnifyingGlassPlus } from '@phosphor-icons/react';
import getCroppedImg from '../utils/cropImage';

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onSave: (croppedImageBase64: string) => void;
}

export default function ImageEditorModal({
  isOpen,
  onClose,
  imageSrc,
  onSave,
}: ImageEditorModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined); // Free crop by default

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      if (croppedImage) {
        onSave(croppedImage);
      }
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-3xl bg-white dark:bg-[#18181B] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-black/10 dark:border-white/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 text-black dark:text-white font-bold font-sans">
                <Crop size={20} weight="duotone" />
                <span>Edit Image</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[#71717A] dark:text-[#A1A1AA] hover:text-black dark:hover:text-white transition-colors"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Cropper Area */}
            <div className="relative w-full h-[50vh] min-h-[300px] bg-black/5 dark:bg-black/40">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                classes={{ containerClassName: 'bg-transparent' }}
              />
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-5 p-6 bg-white dark:bg-[#18181B]">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[12px] font-sans font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                    <div className="flex items-center gap-1.5">
                      <MagnifyingGlassPlus size={14} weight="bold" /> Zoom
                    </div>
                    <span>{Math.round(zoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#E4E4E7] dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#3B82F6]"
                  />
                </div>

                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[12px] font-sans font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                    <div className="flex items-center gap-1.5">
                      <ArrowClockwise size={14} weight="bold" /> Rotation
                    </div>
                    <span>{rotation}°</span>
                  </div>
                  <input
                    type="range"
                    value={rotation}
                    min={0}
                    max={360}
                    step={1}
                    aria-labelledby="Rotation"
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#E4E4E7] dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#3B82F6]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 pt-5 border-t border-black/5 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-sans font-semibold text-[#71717A] dark:text-[#A1A1AA] mr-2">
                    Aspect:
                  </span>
                  {[
                    { label: 'Free', value: undefined },
                    { label: 'Square', value: 1 },
                    { label: '16:9', value: 16 / 9 },
                    { label: '4:3', value: 4 / 3 },
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={() => setAspect(a.value)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                        aspect === a.value
                          ? 'bg-[#3B82F6] text-white shadow-sm'
                          : 'bg-[#F4F4F5] dark:bg-white/5 text-[#71717A] dark:text-[#A1A1AA] hover:bg-[#E4E4E7] dark:hover:bg-white/10'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#71717A] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-bold bg-black dark:bg-white text-white dark:text-black hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
                  >
                    <Crop size={16} weight="bold" />
                    Crop & Save
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
