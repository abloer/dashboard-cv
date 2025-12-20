import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { VideoPlayer } from "@/components/dashboard/VideoPlayer";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shovel, Truck, Timer, Target, Ruler, Mountain, TrendingUp, Zap, Play, Square, FileVideo } from "lucide-react";

type AnalysisType = "object" | "cycle" | "volume" | "front-loading" | null;

interface AnalysisResult {
  type: AnalysisType;
  content: React.ReactNode;
}

const Index = () => {
  const [analysisType, setAnalysisType] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const handleStartAnalysis = () => {
    if (!analysisType) return;
    
    setIsAnalyzing(true);
    
    // Simulate analysis
    setTimeout(() => {
      let result: AnalysisResult;
      
      switch (analysisType) {
        case "object":
          result = {
            type: "object",
            content: (
              <div className="space-y-2">
                <p className="text-foreground">📊 Terdeteksi <strong>3 Unit Excavator</strong> dan <strong>2 Unit Dump Truck</strong>.</p>
                <p className="text-muted-foreground text-sm">Confidence rate: 94.5%</p>
              </div>
            )
          };
          break;
        case "cycle":
          result = {
            type: "cycle",
            content: (
              <div className="space-y-2">
                <p className="text-foreground">⏱️ Rata-rata waktu siklus:</p>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div className="bg-secondary/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary">35s</p>
                    <p className="text-xs text-muted-foreground">Digging</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-accent">20s</p>
                    <p className="text-xs text-muted-foreground">Swinging</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-warning">25s</p>
                    <p className="text-xs text-muted-foreground">Dumping</p>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm mt-2">Total: 80 detik per cycle</p>
              </div>
            )
          };
          break;
        case "volume":
          result = {
            type: "volume",
            content: (
              <div className="space-y-2">
                <p className="text-foreground">📦 Estimasi volume material:</p>
                <p className="text-3xl font-bold text-primary">~12.5 BCM</p>
                <p className="text-muted-foreground text-sm">Waktu pengisian: 15m 25s</p>
              </div>
            )
          };
          break;
        case "front-loading":
          result = {
            type: "front-loading",
            content: (
              <div className="space-y-2">
                <p className="text-foreground">📐 Front Loading Area Analysis:</p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-primary">20m</p>
                    <p className="text-xs text-muted-foreground">Lebar Area</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-success">100%</p>
                    <p className="text-xs text-muted-foreground">Efektifitas</p>
                  </div>
                </div>
              </div>
            )
          };
          break;
        default:
          result = { type: null, content: null };
      }
      
      setAnalysisResult(result);
    }, 1500);
  };

  const handleStopAnalysis = () => {
    setIsAnalyzing(false);
    setAnalysisResult(null);
  };

  return (
    <DashboardLayout>
      <Header 
        title="AI Computer Vision" 
        subtitle="Real-time object detection & analysis powered by Dig Vision"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Excavator Terdeteksi"
          value="8 Unit"
          icon={Shovel}
          variant="primary"
          trend={{ value: 12, isPositive: true }}
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Dump Truck Terdeteksi"
          value="5 Unit"
          icon={Truck}
          variant="accent"
          trend={{ value: 8, isPositive: true }}
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Avg. Cycle Time"
          value="78 detik"
          icon={Timer}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Efisiensi Operasional"
          value="92%"
          icon={TrendingUp}
          variant="success"
          trend={{ value: 5, isPositive: true }}
          className="animate-fade-in stagger-4"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Front Loading Area"
          value="20 meter"
          icon={Ruler}
          className="animate-fade-in stagger-5"
        />
        <MetricCard
          title="Bench Height"
          value="4 meter"
          icon={Mountain}
          className="animate-fade-in stagger-6"
        />
        <MetricCard
          title="Efektifitas FLA"
          value="100%"
          icon={Target}
          variant="success"
          className="animate-fade-in stagger-7"
        />
        <MetricCard
          title="Active Analysis"
          value={isAnalyzing ? "Running" : "Standby"}
          icon={Zap}
          variant={isAnalyzing ? "primary" : "default"}
          className="animate-fade-in stagger-8"
        />
      </div>

      {/* Video Player */}
      <div className="mb-6 animate-fade-in">
        <VideoPlayer />
      </div>

      {/* Analysis Controls */}
      <div className="bg-card rounded-xl border border-border p-4 mb-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg cursor-pointer transition-colors">
              <FileVideo className="w-4 h-4" />
              <span className="text-sm font-medium">Import Video</span>
              <input type="file" accept="video/*" className="hidden" />
            </label>
          </div>

          <Select value={analysisType} onValueChange={setAnalysisType}>
            <SelectTrigger className="w-64 bg-secondary border-border">
              <SelectValue placeholder="Pilih Jenis Analisis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="object">Analisis Deteksi Obyek</SelectItem>
              <SelectItem value="cycle">Analisis Excavator Cycle Time</SelectItem>
              <SelectItem value="volume">Analisis Volume Material</SelectItem>
              <SelectItem value="front-loading">Analisis Front Loading Area</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            onClick={handleStartAnalysis} 
            disabled={!analysisType || isAnalyzing}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          >
            <Play className="w-4 h-4" />
            Mulai Analisis
          </Button>

          <Button 
            onClick={handleStopAnalysis} 
            variant="destructive"
            disabled={!isAnalyzing}
            className="gap-2"
          >
            <Square className="w-4 h-4" />
            Stop Analisis
          </Button>

          {isAnalyzing && (
            <Badge className="bg-primary/20 text-primary border border-primary/30 animate-pulse">
              Analyzing...
            </Badge>
          )}
        </div>
      </div>

      {/* Analysis Result */}
      {analysisResult && (
        <div className="bg-card rounded-xl border border-border p-4 animate-scale-in">
          <h3 className="text-lg font-semibold text-foreground mb-3">📈 Hasil Analisis</h3>
          {analysisResult.content}
        </div>
      )}
    </DashboardLayout>
  );
};

export default Index;
