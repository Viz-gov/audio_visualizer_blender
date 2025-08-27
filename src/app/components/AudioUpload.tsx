"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type AudioUploadProps = {
  onFilesSelected?: (files: File[]) => void;
};

export default function AudioUpload({ onFilesSelected }: AudioUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);
  const [normalizeMeta, setNormalizeMeta] = useState<any | null>(null);
  const [isComputingFeatures, setIsComputingFeatures] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);
  const [featuresResult, setFeaturesResult] = useState<any | null>(null);
  const [isRenderingGuide, setIsRenderingGuide] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [guideUrl, setGuideUrl] = useState<string | null>(null);
  const [guideReady, setGuideReady] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const renderTimerRef = useRef<NodeJS.Timer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgBlenderRef = useRef<HTMLVideoElement | null>(null);
  const compositedRef = useRef<HTMLVideoElement | null>(null);
  const finalRef = useRef<HTMLVideoElement | null>(null);
  const [isPlayingEverything, setIsPlayingEverything] = useState(false);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [maskReady, setMaskReady] = useState(false);
  const [isRenderingMask, setIsRenderingMask] = useState(false);
  const [maskError, setMaskError] = useState<string | null>(null);
  const [maskResult, setMaskResult] = useState<any>(null);
  const [renderStartTime, setRenderStartTime] = useState<number | 0>(0);
  const [renderQuality, setRenderQuality] = useState<'lightweight' | 'normal'>('lightweight');
  const [isRunningBlender, setIsRunningBlender] = useState(false);
  const [blenderError, setBlenderError] = useState<string | null>(null);
  const [blenderResult, setBlenderResult] = useState<any>(null);
  const [isCompositing, setIsCompositing] = useState(false);
  const [compositeError, setCompositeError] = useState<string | null>(null);
  const [compositeResult, setCompositeResult] = useState<any>(null);
  const [isMuxing, setIsMuxing] = useState(false);
  const [muxError, setMuxError] = useState<string | null>(null);
  const [muxResult, setMuxResult] = useState<any>(null);
  const [bgBlenderUrl, setBgBlenderUrl] = useState<string | null>(null);
  const [compositedUrl, setCompositedUrl] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);

  const handleFiles = useCallback(
    (filesList: FileList | File[]) => {
      const files = Array.from(filesList);
      const mp3Files = files.filter((f) => f.type === "audio/mpeg" || f.name.toLowerCase().endsWith(".mp3"));

      if (mp3Files.length === 0) {
        setErrorMessage("Please upload at least one .mp3 file.");
        return;
      }

      setErrorMessage(null);
      setSelectedFiles(mp3Files);
      onFilesSelected?.(mp3Files);
    },
    [onFilesSelected]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      if (event.dataTransfer?.files?.length) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const onClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      handleFiles(event.target.files);
      event.target.value = "";
    }
  }, [handleFiles]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      setCurrentUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFiles[0]);
    setCurrentUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFiles]);

  // Do not autoplay; user must press play explicitly
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [currentUrl]);

  // Kick off normalization on server when a file is selected
  useEffect(() => {
    const normalize = async () => {
      if (selectedFiles.length === 0) {
        setNormalizeMeta(null);
        setNormalizeError(null);
        setIsNormalizing(false);
        return;
      }
      try {
        setIsNormalizing(true);
        setNormalizeError(null);
        setNormalizeMeta(null);
        const fd = new FormData();
        fd.append("file", selectedFiles[0]);
        const res = await fetch("/api/audio/normalize", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Request failed: ${res.status}`);
        }
        const data = await res.json();
        setNormalizeMeta(data);
      } catch (err: any) {
        setNormalizeError(String(err?.message || err));
      } finally {
        setIsNormalizing(false);
      }
    };
    normalize();
  }, [selectedFiles]);

  // Compute features after successful normalization
  useEffect(() => {
    const compute = async () => {
      if (!normalizeMeta?.dir) {
        setFeaturesResult(null);
        setFeaturesError(null);
        setIsComputingFeatures(false);
        setGuideUrl(null);
        return;
      }
      try {
        setIsComputingFeatures(true);
        setFeaturesError(null);
        setFeaturesResult(null);
        const res = await fetch("/api/audio/features", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dir: normalizeMeta.dir, fps: 30 }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Request failed: ${res.status}`);
        }
        const data = await res.json();
        setFeaturesResult(data);
      } catch (err: any) {
        setFeaturesError(String(err?.message || err));
      } finally {
        setIsComputingFeatures(false);
      }
    };
    compute();
  }, [normalizeMeta]);

  // Rendering timer
  useEffect(() => {
    if (isRenderingGuide) {
      const start = Date.now();
      setElapsedMs(0);
      renderTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 200);
    } else if (renderTimerRef.current) {
      clearInterval(renderTimerRef.current as any);
      renderTimerRef.current = null;
    }
    return () => {
      if (renderTimerRef.current) {
        clearInterval(renderTimerRef.current as any);
        renderTimerRef.current = null;
      }
    };
  }, [isRenderingGuide]);

  const startRender = useCallback(async (quality: "light" | "normal") => {
    if (!featuresResult?.path || !normalizeMeta?.dir) return;
    try {
      setIsRenderingGuide(true);
      setGuideError(null);
      setGuideUrl(null);
      setGuideReady(false);
      const params =
        quality === "normal"
          ? { width: 1920, height: 1080, crf: 18, preset: "medium" }
          : { width: 1280, height: 720, crf: 30, preset: "veryfast" };
      const res = await fetch("/api/audio/guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dir: normalizeMeta.dir, fps: 30, ...params }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      const url = data.url || null;
      setGuideUrl(url);
      if (url) {
        // Poll until the file is readable (HEAD request)
        const maxWaitMs = 30000;
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
          const head = await fetch(url, { method: "HEAD", cache: "no-store" });
          if (head.ok) {
            setGuideReady(true);
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      // Kick off mask render with same sizing
      try {
        setIsRenderingMask(true);
        setMaskError(null);
        setMaskUrl(null);
        setMaskReady(false);
        const res2 = await fetch("/api/audio/mask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dir: normalizeMeta.dir, width: quality === "normal" ? 1920 : 1280, height: quality === "normal" ? 1080 : 720, fps: 30, windowSec: 8, inflatePx: 20 }),
        });
        if (res2.ok) {
          const data2 = await res2.json();
          const url2 = data2.url || null;
          setMaskUrl(url2);
          setMaskResult(data2); // Set the mask result so the button appears
          if (url2) {
            const maxWaitMs2 = 30000;
            const start2 = Date.now();
            while (Date.now() - start2 < maxWaitMs2) {
              const head2 = await fetch(url2, { method: "HEAD", cache: "no-store" });
              if (head2.ok) { setMaskReady(true); break; }
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        } else {
          const err2 = await res2.json().catch(() => ({}));
          setMaskError(err2.error || `Mask request failed: ${res2.status}`);
        }
      } finally {
        setIsRenderingMask(false);
      }
    } catch (err: any) {
      setGuideError(String(err?.message || err));
    } finally {
      setIsRenderingGuide(false);
    }
  }, [featuresResult, normalizeMeta]);

  const onPlayEverything = useCallback(async () => {
    try {
      const a = audioRef.current;
      const bg = bgBlenderRef.current;
      const comp = compositedRef.current;
      const final = finalRef.current;
      
      if (!a || !bg || !comp || !final) return;
      
      if (isPlayingEverything) {
        // Pause everything
        a.pause();
        bg.pause();
        comp.pause();
        final.pause();
        setIsPlayingEverything(false);
      } else {
        // Play everything synchronized
        const currentTime = a.currentTime || 0;
        
        // Align all videos to the same time
        try { bg.currentTime = currentTime; } catch {}
        try { comp.currentTime = currentTime; } catch {}
        try { final.currentTime = currentTime; } catch {}
        
        // Play all simultaneously
        await Promise.all([
          a.play(),
          bg.play(),
          comp.play(),
          final.play()
        ]);
        
        setIsPlayingEverything(true);
      }
    } catch (error) {
      console.error('Error playing everything:', error);
    }
  }, [isPlayingEverything]);

  // Run Blender automation
  const runBlenderAutomation = async () => {
    if (!normalizeMeta?.dir) return;
    
    setIsRunningBlender(true);
    setBlenderError(null);
    setRenderStartTime(Date.now());
    
    try {
      // Step 1: Run Blender background generation
      const blenderResponse = await fetch('/api/blender/background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dir: normalizeMeta.dir,
          style: 'neon',
          fps: 30,
          width: 1920,
          height: 1080
        })
      });
      
      if (!blenderResponse.ok) {
        const error = await blenderResponse.json();
        throw new Error(error.error || 'Blender automation failed');
      }
      
      const blenderData = await blenderResponse.json();
      setBlenderResult(blenderData);
      
      // Step 2: Composite waveform with background
      setIsCompositing(true);
      const compositeResponse = await fetch('/api/video/composite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dir: normalizeMeta.dir,
          bgVideo: 'bg_blender.mp4',
          guideVideo: 'guide.mp4',
          maskVideo: 'mask.mp4',
          outputName: 'composited.mp4'
        })
      });
      
      if (!compositeResponse.ok) {
        const error = await compositeResponse.json();
        throw new Error(error.error || 'Compositing failed');
      }
      
      const compositeData = await compositeResponse.json();
      setCompositeResult(compositeData);
      
      // Step 3: Mux audio back in
      setIsMuxing(true);
      const muxResponse = await fetch('/api/video/mux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dir: normalizeMeta.dir,
          stylizedPath: 'composited.mp4',
          outName: 'final.mp4'
        })
      });
      
      if (!muxResponse.ok) {
        const error = await muxResponse.json();
        throw new Error(error.error || 'Audio muxing failed');
      }
      
      const muxData = await muxResponse.json();
      setMuxResult(muxData);
      
      // Set video URLs for display
      const guidepackId = normalizeMeta.id;
      setBgBlenderUrl(`/api/guidepacks/${guidepackId}/bg_blender.mp4`);
      setCompositedUrl(`/api/guidepacks/${guidepackId}/composited.mp4`);
      setFinalUrl(`/api/guidepacks/${guidepackId}/final.mp4`);
      
    } catch (error: any) {
      if (isCompositing) {
        setCompositeError(error.message);
      } else if (isMuxing) {
        setMuxError(error.message);
      } else {
        setBlenderError(error.message);
      }
    } finally {
      setIsRunningBlender(false);
      setIsCompositing(false);
      setIsMuxing(false);
    }
  };

  return (
    <div className="w-full">
      <div
        className={`flex items-center justify-center w-full h-64 sm:h-72 border-2 border-dashed rounded-2xl transition-colors cursor-pointer select-none ${
          isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-zinc-300/70 dark:border-zinc-700"
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onClick}
        role="button"
        aria-label="Upload MP3 files"
      >
        <div className="text-center p-8">
          <p className="text-base sm:text-lg font-medium">Drag and drop MP3 files here</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">or click to choose files</p>
          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-3">{errorMessage}</p>
          )}
        </div>
      </div>
      {currentUrl && (
        <div className="mt-4 sm:mt-6 flex flex-col items-center gap-3 w-full max-w-xl mx-auto">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 truncate w-full text-center">
            {selectedFiles[0]?.name}
          </p>
          <audio ref={audioRef} controls src={currentUrl} className="w-full" />
          <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center w-full">
            {isNormalizing && <span>Normalizing...</span>}
            {!isNormalizing && normalizeError && <span className="text-red-600 dark:text-red-400">{normalizeError}</span>}
            {!isNormalizing && !normalizeError && normalizeMeta && (
              <span>
                Ready • {normalizeMeta?.meta?.duration_s ? `${normalizeMeta.meta.duration_s.toFixed(3)}s` : "?s"} • {normalizeMeta?.meta?.sample_rate || 48000} Hz • {normalizeMeta?.meta?.channels || 2} ch
              </span>
            )}
            {!isNormalizing && normalizeMeta && (
              <div className="mt-1">
                {isComputingFeatures && <span>Computing features…</span>}
                {!isComputingFeatures && featuresError && (
                  <span className="text-red-600 dark:text-red-400">{featuresError}</span>
                )}
                {!isComputingFeatures && !featuresError && featuresResult && (
                  <span>
                    Features ready • fps {featuresResult.fps} • frames {featuresResult.n_frames}
                  </span>
                )}
                {!isComputingFeatures && featuresResult && !isRenderingGuide && !guideReady && (
                  <div className="mt-2 flex items-center gap-2 justify-center">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      onClick={() => startRender("light")}
                    >
                      Render (Light)
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700"
                      onClick={() => startRender("normal")}
                    >
                      Render (Normal)
                    </button>
                  </div>
                )}
                {!isComputingFeatures && featuresResult && (
                  <div className="mt-1">
                    {isRenderingGuide && (
                      <span>Rendering guide… {(elapsedMs / 1000).toFixed(1)}s</span>
                    )}
                    {!isRenderingGuide && guideError && (
                      <span className="text-red-600 dark:text-red-400">{guideError}</span>
                    )}
                    {!isRenderingGuide && !guideError && guideUrl && (
                      <span>{guideReady ? `Guide ready • ${(elapsedMs / 1000).toFixed(1)}s` : "Finalizing guide…"}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFiles([]);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Choose another file
          </button>
          {guideUrl && (
            <div className="mt-3 w-full">
              <video ref={videoRef} controls src={guideUrl} className="w-full rounded-lg" />
            </div>
          )}
          {maskUrl && (
            <div className="mt-3 w-full">
              <video controls src={maskUrl} className="w-full rounded-lg" />
              <div className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
                {isRenderingMask && <span>Rendering mask…</span>}
                {!isRenderingMask && maskError && <span className="text-red-600 dark:text-red-400">{maskError}</span>}
                {!isRenderingMask && !maskError && maskReady && <span>Mask ready</span>}
              </div>
            </div>
          )}
          {maskResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-lg font-semibold text-green-800 mb-2">Mask Video Generated</h3>
              <p className="text-green-700 mb-4">Mask video has been created successfully.</p>
              
              <button
                onClick={runBlenderAutomation}
                disabled={isRunningBlender || isCompositing || isMuxing}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunningBlender ? 'Running Blender...' : 
                 isCompositing ? 'Compositing...' : 
                 isMuxing ? 'Muxing Audio...' : 
                 '🎬 Run Blender Automation'}
              </button>
              
              {(isRunningBlender || isCompositing || isMuxing) && (
                <div className="mt-2 text-sm text-gray-600">
                  {renderStartTime > 0 && (
                    <p>Time elapsed: {Math.round((Date.now() - renderStartTime) / 1000)}s</p>
                  )}
                </div>
              )}
              
              {blenderError && (
                <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-red-700">
                  Blender Error: {blenderError}
                </div>
              )}
              
              {compositeError && (
                <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-red-700">
                  Compositing Error: {compositeError}
                </div>
              )}
              
              {muxError && (
                <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-red-700">
                  Muxing Error: {muxError}
                </div>
              )}
            </div>
          )}

          {/* Display all generated videos */}
          {(bgBlenderUrl || compositedUrl || finalUrl) && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-800 mb-4">Generated Videos</h3>
              
              <div className="space-y-4">
                {bgBlenderUrl && (
                  <div>
                    <h4 className="font-medium text-blue-700 mb-2">🎨 Background Video (Blender)</h4>
                    <video
                      ref={bgBlenderRef}
                      controls
                      className="w-full max-w-2xl rounded border"
                      src={bgBlenderUrl}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                )}
                
                {compositedUrl && (
                  <div>
                    <h4 className="font-medium text-blue-700 mb-2">🎭 Composited Video (Waveform + Background)</h4>
                    <video
                      ref={compositedRef}
                      controls
                      className="w-full max-w-2xl rounded border"
                      src={compositedUrl}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                )}
                
                {finalUrl && (
                  <div>
                    <h4 className="font-medium text-blue-700 mb-2">🎵 Final Video (With Audio)</h4>
                    <video
                      ref={finalRef}
                      controls
                      className="w-full max-w-2xl rounded border"
                      src={finalUrl}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                )}
              </div>
              
              {/* Play Everything Button */}
              {finalUrl && (
                <div className="mt-6 text-center">
                  <button
                    onClick={onPlayEverything}
                    className="px-6 py-3 text-lg font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
                  >
                    {isPlayingEverything ? "⏸️ Pause Everything" : "🎬 Play Everything"}
                  </button>
                  <p className="mt-2 text-sm text-blue-600">
                    Plays all videos and audio simultaneously
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,.mp3"
        multiple
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}


