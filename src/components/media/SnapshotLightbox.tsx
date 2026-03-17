import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SnapshotLightboxItem {
  id: string;
  title: string;
  url: string;
}

interface SnapshotLightboxProps {
  items: SnapshotLightboxItem[];
  currentIndex: number | null;
  onClose: () => void;
  onIndexChange: (nextIndex: number) => void;
  description: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function SnapshotLightbox({
  items,
  currentIndex,
  onClose,
  onIndexChange,
  description,
}: SnapshotLightboxProps) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const isOpen = currentIndex !== null && currentIndex >= 0 && currentIndex < items.length;

  const currentItem = useMemo(() => {
    if (!isOpen || currentIndex === null) {
      return null;
    }
    return items[currentIndex] || null;
  }, [currentIndex, isOpen, items]);

  useEffect(() => {
    setZoom(MIN_ZOOM);
  }, [currentIndex, isOpen]);

  const canGoPrevious = isOpen && currentIndex !== null && currentIndex > 0;
  const canGoNext = isOpen && currentIndex !== null && currentIndex < items.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94vh] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{currentItem?.title || "Preview Screenshot"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {currentItem && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {currentIndex! + 1} dari {items.length} screenshot
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => canGoPrevious && onIndexChange(currentIndex! - 1)}
                  disabled={!canGoPrevious}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}
                  disabled={zoom <= MIN_ZOOM}
                >
                  <ZoomOut className="mr-2 h-4 w-4" />
                  Zoom Out
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}
                  disabled={zoom >= MAX_ZOOM}
                >
                  <ZoomIn className="mr-2 h-4 w-4" />
                  Zoom In
                </Button>
                <Button asChild type="button" variant="outline" size="sm">
                  <a href={currentItem.url} download target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => canGoNext && onIndexChange(currentIndex! + 1)}
                  disabled={!canGoNext}
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-auto rounded-xl border border-border/70 bg-black/30">
              <div className="flex min-h-[60vh] items-center justify-center p-4">
                <img
                  src={currentItem.url}
                  alt={currentItem.title}
                  className="max-h-[75vh] w-auto max-w-none object-contain transition-transform duration-150"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
