import { useState, useRef, useEffect } from "react";
import { Play, Pause, Square, Maximize2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface Detection {
  id: string;
  type: "Excavator" | "Dump Truck";
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [excavatorCount, setExcavatorCount] = useState(0);
  const [truckCount, setTruckCount] = useState(0);

  // Simulate detections
  useEffect(() => {
    const interval = setInterval(() => {
      const newDetections: Detection[] = [];
      const numDetections = Math.floor(Math.random() * 3) + 2;
      
      let exCount = 0;
      let dtCount = 0;

      for (let i = 0; i < numDetections; i++) {
        const type = Math.random() > 0.4 ? "Excavator" : "Dump Truck";
        if (type === "Excavator") exCount++;
        else dtCount++;

        newDetections.push({
          id: `det-${i}`,
          type,
          x: Math.random() * 60 + 10,
          y: Math.random() * 50 + 20,
          width: 15 + Math.random() * 10,
          height: 10 + Math.random() * 8,
          confidence: 85 + Math.random() * 14,
        });
      }

      setDetections(newDetections);
      setExcavatorCount(exCount);
      setTruckCount(dtCount);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Draw bounding boxes
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((det) => {
      const x = (det.x / 100) * canvas.width;
      const y = (det.y / 100) * canvas.height;
      const w = (det.width / 100) * canvas.width;
      const h = (det.height / 100) * canvas.height;

      const color = det.type === "Excavator" ? "#10B981" : "#3B82F6";

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Label background
      ctx.fillStyle = color;
      const label = `${det.type} ${det.confidence.toFixed(0)}%`;
      const labelWidth = ctx.measureText(label).width + 10;
      ctx.fillRect(x, y - 20, labelWidth, 18);

      // Label text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px Plus Jakarta Sans, sans-serif";
      ctx.fillText(label, x + 5, y - 6);
    });
  }, [detections]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const prog = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(prog);
    }
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          Realtime Object Detection
        </h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="text-muted-foreground">{excavatorCount} Excavator</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-muted-foreground">{truckCount} Dump Truck</span>
          </div>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="relative aspect-video bg-background"
      >
        <video
          ref={videoRef}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full object-cover"
        >
          <source src="https://cdn.pixabay.com/video/2020/08/12/46965-449623346_large.mp4" type="video/mp4" />
        </video>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Detection overlay info */}
        <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 text-sm flex gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="font-medium text-foreground">{excavatorCount}</span>
            <span className="text-muted-foreground">Excavator</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="font-medium text-foreground">{truckCount}</span>
            <span className="text-muted-foreground">Dump Truck</span>
          </div>
        </div>

        {/* Timestamp */}
        <div className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 text-sm font-mono text-foreground">
          {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-border space-y-3">
        {/* Progress bar */}
        <Slider
          value={[progress]}
          max={100}
          step={0.1}
          className="cursor-pointer"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePlayPause}
              className="gap-2"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStop}
              className="gap-2"
            >
              <Square className="w-4 h-4" />
              Stop
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleFullscreen}
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
