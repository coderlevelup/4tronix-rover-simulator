'use client';

import { useEffect, useRef, useState } from 'react';
import { Mission } from '@/core/domain/entities/Mission';

interface SimulatorVisualizationProps {
  mission: Mission;
}

// Extended pose that includes actual heading in degrees
interface ExtendedRoverPose {
  x: number;
  y: number;
  headingDegrees: number;
}

export function SimulatorVisualization({ mission }: SimulatorVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [poses, setPoses] = useState<ExtendedRoverPose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const terrainImageRef = useRef<HTMLImageElement | null>(null);
  const [terrainLoaded, setTerrainLoaded] = useState(false);

  // Load the terrain background image
  useEffect(() => {
    console.log('🚀 NEW SIMULATOR CODE IS RUNNING - VERSION 2.0');
    const terrainImg = new Image();
    terrainImg.src = '/terrain.jpg';
    terrainImg.onload = () => {
      console.log('✅ Terrain image loaded successfully');
      terrainImageRef.current = terrainImg;
      setTerrainLoaded(true);
    };
    terrainImg.onerror = () => {
      console.error('❌ Failed to load terrain.jpg');
      setTerrainLoaded(false);
    };
  }, []);

  // Initialize simulation by executing the actual mission code
  useEffect(() => {
    const executeCode = async () => {
      setLoading(true);
      setError(null);

      try {
        // Call our Next.js API proxy to execute the Python code
        // This avoids CORS issues when calling the simulator service directly
        const response = await fetch('/api/simulator/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: mission.code,
          }),
        });

        const data = await response.json();

        if (data.success && data.trajectory && data.trajectory.length > 0) {
          // Convert the trajectory to ExtendedRoverPose format
          const simulationPoses: ExtendedRoverPose[] = data.trajectory.map((state: { x: number; y: number; heading: number }) => ({
            x: state.x + 300, // Offset to center on canvas
            y: -state.y + 300, // Flip Y axis and center on canvas
            headingDegrees: state.heading, // Keep actual heading in degrees
          }));

          setPoses(simulationPoses);
          setCurrentFrame(0);
          setLoading(false);
          setIsPlaying(true);
        } else {
          const errorMsg = data.error || 'Code execution failed - no trajectory returned';
          console.error('Failed to execute code:', errorMsg);
          setError(errorMsg);
          setLoading(false);
          // Set a single pose at origin
          const initialPose: ExtendedRoverPose = { x: 300, y: 300, headingDegrees: 0 };
          setPoses([initialPose]);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to connect to simulator';
        console.error('Error executing code:', err);
        setError(errorMsg);
        setLoading(false);
        // Set a single pose at origin
        const initialPose: ExtendedRoverPose = { x: 300, y: 300, headingDegrees: 0 };
        setPoses([initialPose]);
      }
    };

    executeCode();
  }, [mission.code]);

  // Draw the simulation
  const draw = (frame: number) => {
    const canvas = canvasRef.current;
    if (!canvas || poses.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw terrain background directly on canvas
    if (terrainImageRef.current && terrainLoaded) {
      ctx.drawImage(terrainImageRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      // Fallback: dark background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw grid overlay (semi-transparent over background)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw path trail
    ctx.strokeStyle = '#3b82f6'; // blue-500
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    
    const maxIndex = Math.min(Math.floor(frame), poses.length - 1);
    for (let i = 0; i <= maxIndex; i++) {
      const pose = poses[i];
      if (i === 0) {
        ctx.moveTo(pose.x, pose.y);
      } else {
        ctx.lineTo(pose.x, pose.y);
      }
    }
    
    // Interpolate the last segment for the path
    if (frame < poses.length - 1 && poses.length > 1) {
      const p1 = poses[Math.floor(frame)];
      const p2 = poses[Math.ceil(frame)];
      const t = frame - Math.floor(frame);
      const interpX = p1.x + (p2.x - p1.x) * t;
      const interpY = p1.y + (p2.y - p1.y) * t;
      if (Math.floor(frame) === 0) {
        ctx.moveTo(p1.x, p1.y);
      }
      ctx.lineTo(interpX, interpY);
    }
    ctx.stroke();

    // Draw start position
    if (poses.length > 0) {
      const startPose = poses[0];
      ctx.fillStyle = '#22c55e'; // green-500
      ctx.beginPath();
      ctx.arc(startPose.x, startPose.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Interpolate current rover pose
    let currentX, currentY, currentHeading;
    if (frame >= poses.length - 1) {
      const lastPose = poses[poses.length - 1];
      currentX = lastPose.x;
      currentY = lastPose.y;
      currentHeading = lastPose.headingDegrees;
    } else {
      const p1 = poses[Math.floor(frame)];
      const p2 = poses[Math.ceil(frame)];
      const t = frame - Math.floor(frame);
      currentX = p1.x + (p2.x - p1.x) * t;
      currentY = p1.y + (p2.y - p1.y) * t;
      
      let diff = p2.headingDegrees - p1.headingDegrees;
      while (diff < -180) diff += 360;
      while (diff > 180) diff -= 360;
      currentHeading = p1.headingDegrees + diff * t;
    }

    if (poses.length > 0) {
      ctx.save();
      ctx.translate(currentX, currentY);

      // Rotate based on actual heading in degrees
      const headingRadians = (currentHeading * Math.PI) / 180;
      ctx.rotate(headingRadians);

      // Draw a detailed rover with body, wheels, solar panel, and antenna
      const roverSize = 30;

      console.log('🤖 Drawing NEW detailed rover at', currentX, currentY);

      // Main body (rectangular chassis)
      ctx.fillStyle = '#94a3b8'; // slate-400
      ctx.fillRect(-roverSize/2, -roverSize/2, roverSize, roverSize);
      ctx.strokeStyle = '#475569'; // slate-600
      ctx.lineWidth = 2;
      ctx.strokeRect(-roverSize/2, -roverSize/2, roverSize, roverSize);

      // Solar panel (blue rectangle on top)
      ctx.fillStyle = '#3b82f6'; // blue-500
      ctx.fillRect(-roverSize/2 + 5, -roverSize/2 + 5, roverSize - 10, roverSize/2 - 5);
      ctx.strokeStyle = '#1d4ed8'; // blue-700
      ctx.lineWidth = 1;
      ctx.strokeRect(-roverSize/2 + 5, -roverSize/2 + 5, roverSize - 10, roverSize/2 - 5);

      // Wheels (6 small circles)
      ctx.fillStyle = '#1e293b'; // slate-900
      const wheelSize = 6;
      const wheelPositions = [
        [-roverSize/2 - 3, -roverSize/2 + 5],
        [-roverSize/2 - 3, 0],
        [-roverSize/2 - 3, roverSize/2 - 5],
        [roverSize/2 + 3, -roverSize/2 + 5],
        [roverSize/2 + 3, 0],
        [roverSize/2 + 3, roverSize/2 - 5],
      ];
      wheelPositions.forEach(([wx, wy]) => {
        ctx.beginPath();
        ctx.arc(wx, wy, wheelSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Camera/antenna (small circle at front)
      ctx.fillStyle = '#ef4444'; // red-500
      ctx.beginPath();
      ctx.arc(roverSize/2 + 5, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      // Direction indicator (small line pointing forward)
      ctx.strokeStyle = '#fbbf24'; // amber-400
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(roverSize/2, 0);
      ctx.lineTo(roverSize/2 + 12, 0);
      ctx.stroke();

      ctx.restore();
    }

    // Draw frame counter
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(5, 5, 140, 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px monospace';
    ctx.fillText(`Frame: ${Math.floor(frame) + 1} / ${poses.length}`, 15, 25);
  };

  // Stop animation when reaching the end
  useEffect(() => {
    if (poses.length > 0 && currentFrame >= poses.length - 1 && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentFrame, poses.length, isPlaying]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || poses.length === 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      draw(currentFrame);
      return;
    }

    let lastTimestamp = performance.now();
    
    const animate = (timestamp: number) => {
      const elapsed = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      
      const framesPerMs = 15 / 1000;
      
      setCurrentFrame((prev) => {
        const next = prev + elapsed * framesPerMs;
        if (next >= poses.length - 1) {
          return poses.length - 1;
        }
        return next;
      });
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, poses.length]);

  // Draw current frame
  useEffect(() => {
    draw(currentFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame, poses, terrainLoaded]);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentFrame >= poses.length - 1) {
        setCurrentFrame(0);
      }
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Canvas Container */}
      <div className="flex-1 flex items-center justify-center bg-slate-900/30 p-6 relative min-h-[400px]">
        <div className="rounded-2xl border border-slate-800/50 shadow-2xl overflow-hidden bg-slate-950">
          <canvas
            ref={canvasRef}
            width={600}
            height={600}
            className="block"
          />
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div className="text-center space-y-4">
              <div className="relative mx-auto h-16 w-16">
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500"></div>
                <div className="absolute inset-2 animate-pulse rounded-full bg-orange-500/10"></div>
              </div>
              <p className="text-slate-300 font-medium">Executing mission code...</p>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && !loading && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 max-w-md w-full mx-4">
            <div className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/20 to-rose-500/10 backdrop-blur-xl p-4 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="font-semibold text-red-400 text-sm">Execution Error</p>
                  <p className="text-xs text-red-300/70 mt-1">{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-none border-t border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-950/50 backdrop-blur-xl p-6">
        <div className="flex items-center justify-center gap-6">
          {/* Pause/Play Button */}
          <button
            onClick={handlePlayPause}
            className={`group relative overflow-hidden rounded-lg px-12 py-4 text-lg font-bold text-white shadow-xl transition-all duration-200 hover:shadow-2xl hover:-translate-y-1 active:scale-95 min-w-[200px] ${
              isPlaying
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              {isPlaying ? (
                <>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Play</span>
                </>
              )}
            </span>
          </button>

          {/* Execute Mission Button */}
          <button
            onClick={() => alert('Execute mission functionality will be implemented')}
            className="group relative overflow-hidden rounded-lg bg-blue-600 px-12 py-4 text-lg font-bold text-white shadow-xl transition-all duration-200 hover:bg-blue-700 hover:shadow-2xl hover:-translate-y-1 active:scale-95 min-w-[200px]"
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Execute Mission</span>
            </span>
          </button>
        </div>

        {/* Status Bar */}
        <div className="mt-6 flex items-center justify-between text-sm text-slate-400 px-4">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className="font-medium">{isPlaying ? 'Playing' : 'Paused'}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono">
              Frame {Math.floor(currentFrame) + 1} / {poses.length}
            </span>
            <button
              onClick={() => {
                setIsPlaying(false);
                if (animationFrameRef.current) {
                  cancelAnimationFrame(animationFrameRef.current);
                  animationFrameRef.current = null;
                }
              }}
              className="rounded-lg bg-red-900/50 border border-red-800 px-4 py-2 text-xs font-medium text-red-300 shadow-md transition-all duration-200 hover:bg-red-800 hover:text-red-100 hover:-translate-y-0.5 active:scale-95"
            >
              <span className="flex items-center gap-2">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
                Stop
              </span>
            </button>
            <button
              onClick={() => {
                setCurrentFrame(0);
                setIsPlaying(false);
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 shadow-md transition-all duration-200 hover:bg-slate-700 hover:text-slate-100 hover:-translate-y-0.5 active:scale-95"
            >
              <span className="flex items-center gap-2">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
