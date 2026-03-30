import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  BrainCircuit,
  Database,
  FlaskConical,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  createModelDataset,
  createModelEvaluation,
  createModelTrainingJob,
  getModelDatasets,
  getModelEvaluations,
  getModelsOverview,
  getModelTrainingJobs,
  getModelVersions,
  type CreateModelDatasetPayload,
  type CreateModelEvaluationPayload,
  type CreateModelTrainingJobPayload,
  type ModelDataset,
  type ModelDatasetDomain,
  type ModelEvaluation,
  type ModelEvaluationStatus,
  type ModelDatasetSourceType,
  type ModelDatasetStatus,
  type ModelTargetModule,
  type ModelTrainingJob,
  type ModelTrainingJobStatus,
  type ModelVersion,
  type ModelsOverview,
  updateModelDataset,
  updateModelEvaluation,
  updateModelTrainingJob,
  updateModelVersion,
} from "@/lib/models";

const formatDateTime = (value: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd MMM yyyy, HH:mm");
};

const statusLabelMap: Record<ModelDatasetStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  archived: "Archived",
};

const sourceTypeLabelMap: Record<ModelDatasetSourceType, string> = {
  upload: "Upload",
  camera: "Camera",
  mixed: "Mixed",
};

const moduleLabelMap: Record<ModelTargetModule, string> = {
  "ppe.no-helmet": "PPE • No Helmet",
  "ppe.no-safety-vest": "PPE • No Safety Vest",
  "hse.safety-rules": "HSE • Safety Rules",
};

const trainingJobStatusLabelMap: Record<ModelTrainingJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

const evaluationStatusLabelMap: Record<ModelEvaluationStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved",
  rejected: "Rejected",
};

const modelVersionStatusLabelMap = {
  candidate: "Candidate",
  approved: "Approved",
  active: "Active",
  rejected: "Rejected",
} as const;

const datasetTemplateByModule: Record<
  ModelTargetModule,
  {
    labels: string[];
    description: string;
    notes: string;
    imageSize: number;
  }
> = {
  "ppe.no-helmet": {
    labels: ["person", "hardhat"],
    description:
      "Fokus pada person + hardhat dengan contoh pekerja dekat, jauh, occluded, dan variasi lighting. Label negatif no-hardhat tetap opsional.",
    notes:
      "Fine-tune baseline helmet untuk scene proyek dengan pekerja jauh, alat berat, dan false positive background.",
    imageSize: 1280,
  },
  "ppe.no-safety-vest": {
    labels: ["person", "safety-vest"],
    description:
      "Disarankan mulai dari model positive vest: person + safety-vest. Gunakan contoh pekerja tanpa rompi sebagai hard case evaluasi, bukan keharusan label negatif di tahap awal.",
    notes:
      "Fine-tune model vest khusus dengan fokus pada positive safety-vest, worker kecil/jauh, occlusion, dan variasi warna background proyek.",
    imageSize: 1280,
  },
  "hse.safety-rules": {
    labels: ["person", "vehicle", "hardhat", "safety-vest"],
    description:
      "Dataset HSE dipakai untuk baseline detector policy lintas restricted zone, PPE evidence, dan aktivitas operasional umum.",
    notes:
      "Siapkan baseline detector HSE untuk person, vehicle, hardhat, dan safety-vest sebagai input rule engine.",
    imageSize: 1280,
  },
};

const domainBadgeClassMap: Record<ModelDatasetDomain, string> = {
  PPE: "bg-primary/10 text-primary border-primary/30",
  HSE: "bg-accent/10 text-accent border-accent/30",
};

const emptyOverview: ModelsOverview = {
  totals: {
    datasets: 0,
    readyDatasets: 0,
    draftDatasets: 0,
    trainingJobs: 0,
    runningTrainingJobs: 0,
    modelVersions: 0,
    activeModels: 0,
  },
  domainSplit: {
    PPE: 0,
    HSE: 0,
  },
  activeModelsByModule: [],
  latestDatasetAt: null,
};

const initialDraft: CreateModelDatasetPayload = {
  name: "",
  domain: "PPE",
  labels: ["person", "hardhat"],
  sourceType: "upload",
  imageCount: 0,
  annotationCount: 0,
  status: "draft",
  description: "",
  storagePath: "",
};

const initialTrainingJobDraft: CreateModelTrainingJobPayload = {
  datasetId: "",
  targetModule: "ppe.no-helmet",
  baseModelPath: "",
  epochs: 50,
  imageSize: 1280,
  notes: "",
};

const initialEvaluationDraft: CreateModelEvaluationPayload = {
  modelVersionId: "",
  status: "draft",
  precision: null,
  recall: null,
  map50: null,
  falsePositiveNotes: "",
  falseNegativeNotes: "",
  benchmarkNotes: "",
};

const overviewSections = [
  {
    title: "Dataset Registry",
    description: "Daftar dataset lapangan untuk PPE/HSE, lengkap dengan domain, label, dan status kesiapan anotasi.",
    icon: Database,
  },
  {
    title: "Training Jobs",
    description: "Tahap berikutnya untuk queue fine-tuning, monitoring training, dan pencatatan output model hasil job.",
    icon: BrainCircuit,
  },
  {
    title: "Evaluation",
    description: "Perbandingan precision/recall, benchmark per kamera, dan catatan false positive sebelum model diset active.",
    icon: FlaskConical,
  },
  {
    title: "Deployment Gate",
    description: "Persetujuan model kandidat agar modul analisis operasional memakai versi yang benar-benar lolos review lapangan.",
    icon: ShieldCheck,
  },
] as const;

export default function Models() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<ModelsOverview>(emptyOverview);
  const [datasets, setDatasets] = useState<ModelDataset[]>([]);
  const [trainingJobs, setTrainingJobs] = useState<ModelTrainingJob[]>([]);
  const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
  const [evaluations, setEvaluations] = useState<ModelEvaluation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTrainingJobSubmitting, setIsTrainingJobSubmitting] = useState(false);
  const [isEvaluationSubmitting, setIsEvaluationSubmitting] = useState(false);
  const [isDeploymentSubmittingId, setIsDeploymentSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [datasetDraft, setDatasetDraft] = useState<CreateModelDatasetPayload>(initialDraft);
  const [trainingJobDraft, setTrainingJobDraft] = useState<CreateModelTrainingJobPayload>(initialTrainingJobDraft);
  const [evaluationDraft, setEvaluationDraft] = useState<CreateModelEvaluationPayload>(initialEvaluationDraft);
  const [trainingJobEdits, setTrainingJobEdits] = useState<
    Record<string, { status: ModelTrainingJobStatus; outputModelPath: string; notes: string }>
  >({});
  const [evaluationEdits, setEvaluationEdits] = useState<
    Record<string, { status: ModelEvaluationStatus; benchmarkNotes: string }>
  >({});

  const sortedDatasets = useMemo(
    () =>
      [...datasets].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [datasets]
  );

  const sortedTrainingJobs = useMemo(
    () =>
      [...trainingJobs].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [trainingJobs]
  );

  const sortedModelVersions = useMemo(
    () =>
      [...modelVersions].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [modelVersions]
  );

  const sortedEvaluations = useMemo(
    () =>
      [...evaluations].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [evaluations]
  );

  const readyDatasets = useMemo(
    () => sortedDatasets.filter((item) => item.status === "ready"),
    [sortedDatasets]
  );

  const selectedTrainingDataset =
    readyDatasets.find((item) => item.id === trainingJobDraft.datasetId) || null;

  const selectableModules: ModelTargetModule[] = useMemo(() => {
    if (!selectedTrainingDataset) {
      return [];
    }
    return selectedTrainingDataset.domain === "PPE"
      ? ["ppe.no-helmet", "ppe.no-safety-vest"]
      : ["hse.safety-rules"];
  }, [selectedTrainingDataset]);

  const loadModelsState = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, datasetItems, trainingJobItems, modelVersionItems, evaluationItems] = await Promise.all([
        getModelsOverview(),
        getModelDatasets(),
        getModelTrainingJobs(),
        getModelVersions(),
        getModelEvaluations(),
      ]);
      setOverview(overviewData);
      setDatasets(datasetItems);
      setTrainingJobs(trainingJobItems);
      setModelVersions(modelVersionItems);
      setEvaluations(evaluationItems);
      setTrainingJobEdits(
        Object.fromEntries(
          trainingJobItems.map((item) => [
            item.id,
            {
              status: item.status,
              outputModelPath: item.outputModelPath || "",
              notes: item.notes,
            },
          ])
        )
      );
      setEvaluationEdits(
        Object.fromEntries(
          evaluationItems.map((item) => [
            item.id,
            {
              status: item.status,
              benchmarkNotes: item.benchmarkNotes,
            },
          ])
        )
      );
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Gagal memuat lifecycle models.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadModelsState();
  }, []);

  useEffect(() => {
    if (readyDatasets.length === 0) {
      setTrainingJobDraft((current) => ({
        ...current,
        datasetId: "",
      }));
      return;
    }

    setTrainingJobDraft((current) => {
      const nextDatasetId = readyDatasets.some((item) => item.id === current.datasetId)
        ? current.datasetId
        : readyDatasets[0].id;
      const nextDataset = readyDatasets.find((item) => item.id === nextDatasetId) || readyDatasets[0];
      const nextTargetModule =
        nextDataset.domain === "PPE"
          ? current.targetModule === "hse.safety-rules"
            ? "ppe.no-helmet"
            : current.targetModule
          : "hse.safety-rules";
      const preferredActiveModel = overview.activeModelsByModule.find(
        (item) => item.moduleKey === nextTargetModule
      );
      const moduleTemplate = datasetTemplateByModule[nextTargetModule];

      return {
        ...current,
        datasetId: nextDatasetId,
        targetModule: nextTargetModule,
        baseModelPath: current.baseModelPath || preferredActiveModel?.modelPath || defaultBaseModelPath(nextTargetModule, overview),
        imageSize: current.imageSize || moduleTemplate.imageSize,
        notes: current.notes || moduleTemplate.notes,
      };
    });
  }, [overview, readyDatasets]);

  useEffect(() => {
    if (sortedModelVersions.length === 0) {
      setEvaluationDraft((current) => ({
        ...current,
        modelVersionId: "",
      }));
      return;
    }

    setEvaluationDraft((current) => ({
      ...current,
      modelVersionId:
        sortedModelVersions.some((item) => item.id === current.modelVersionId)
          ? current.modelVersionId
          : sortedModelVersions[0].id,
    }));
  }, [sortedModelVersions]);

  const handleDatasetDraftChange = <K extends keyof CreateModelDatasetPayload>(
    key: K,
    value: CreateModelDatasetPayload[K]
  ) => {
    setDatasetDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleLabelsChange = (rawValue: string) => {
    const labels = rawValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    handleDatasetDraftChange("labels", labels);
  };

  const handleTrainingJobDraftChange = <K extends keyof CreateModelTrainingJobPayload>(
    key: K,
    value: CreateModelTrainingJobPayload[K]
  ) => {
    setTrainingJobDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleEvaluationDraftChange = <K extends keyof CreateModelEvaluationPayload>(
    key: K,
    value: CreateModelEvaluationPayload[K]
  ) => {
    setEvaluationDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleTrainingDatasetChange = (datasetId: string) => {
    const dataset = readyDatasets.find((item) => item.id === datasetId);
    if (!dataset) {
      return;
    }

    const nextTargetModule =
      dataset.domain === "PPE"
        ? "ppe.no-helmet"
        : "hse.safety-rules";
    const preferredActiveModel = overview.activeModelsByModule.find(
      (item) => item.moduleKey === nextTargetModule
    );
    const moduleTemplate = datasetTemplateByModule[nextTargetModule];

    setTrainingJobDraft((current) => ({
      ...current,
      datasetId,
      targetModule: nextTargetModule,
      baseModelPath: preferredActiveModel?.modelPath || defaultBaseModelPath(nextTargetModule, overview),
      imageSize: moduleTemplate.imageSize,
      notes: current.notes || moduleTemplate.notes,
    }));
  };

  const handleTrainingModuleChange = (targetModule: ModelTargetModule) => {
    const preferredActiveModel = overview.activeModelsByModule.find(
      (item) => item.moduleKey === targetModule
    );
    const moduleTemplate = datasetTemplateByModule[targetModule];
    setTrainingJobDraft((current) => ({
      ...current,
      targetModule,
      baseModelPath: preferredActiveModel?.modelPath || current.baseModelPath || defaultBaseModelPath(targetModule, overview),
      imageSize: moduleTemplate.imageSize,
      notes: current.notes || moduleTemplate.notes,
    }));
  };

  const applyDatasetTemplate = (targetModule: ModelTargetModule) => {
    const template = datasetTemplateByModule[targetModule];
    setDatasetDraft((current) => ({
      ...current,
      domain: targetModule === "hse.safety-rules" ? "HSE" : "PPE",
      labels: template.labels,
      description: current.description || template.description,
    }));
    toast({
      title: "Template dataset diterapkan",
      description: `Draft dataset sekarang mengikuti rekomendasi awal untuk ${moduleLabelMap[targetModule]}.`,
    });
  };

  const handleCreateDataset = async () => {
    const name = datasetDraft.name.trim();
    const storagePath = datasetDraft.storagePath.trim();

    if (!name || !storagePath || datasetDraft.labels.length === 0) {
      toast({
        title: "Dataset belum lengkap",
        description: "Isi nama, storage path, dan minimal satu label sebelum menyimpan dataset.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...datasetDraft,
        name,
        storagePath,
        description: datasetDraft.description.trim(),
      };
      const response = await createModelDataset(payload);
      setDatasets((current) =>
        [...current, response.item].sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        )
      );
      setOverview(response.overview);
      setDatasetDraft(initialDraft);
      toast({
        title: "Dataset tersimpan",
        description: `${response.item.name} masuk ke registry dan siap dilanjutkan ke tahap anotasi/training.`,
      });
    } catch (submitError) {
      toast({
        title: "Gagal membuat dataset",
        description:
          submitError instanceof Error ? submitError.message : "Terjadi error saat menyimpan dataset.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateDatasetStatus = async (datasetId: string, status: ModelDatasetStatus) => {
    try {
      const response = await updateModelDataset(datasetId, { status });
      setDatasets((current) =>
        current.map((item) => (item.id === datasetId ? response.item : item))
      );
      setOverview(response.overview);
      toast({
        title: "Status dataset diperbarui",
        description: `${response.item.name} sekarang berstatus ${statusLabelMap[status]}.`,
      });
    } catch (updateError) {
      toast({
        title: "Gagal memperbarui dataset",
        description:
          updateError instanceof Error ? updateError.message : "Terjadi error saat memperbarui status dataset.",
        variant: "destructive",
      });
    }
  };

  const handleCreateTrainingJob = async () => {
    if (!trainingJobDraft.datasetId || !trainingJobDraft.baseModelPath.trim()) {
      toast({
        title: "Training job belum lengkap",
        description: "Pilih dataset ready dan isi base model path sebelum membuat job training.",
        variant: "destructive",
      });
      return;
    }

    setIsTrainingJobSubmitting(true);
    try {
      const payload = {
        ...trainingJobDraft,
        baseModelPath: trainingJobDraft.baseModelPath.trim(),
        notes: trainingJobDraft.notes.trim(),
      };
      const response = await createModelTrainingJob(payload);
      setTrainingJobs((current) => [response.item, ...current]);
      setTrainingJobEdits((current) => ({
        ...current,
        [response.item.id]: {
          status: response.item.status,
          outputModelPath: response.item.outputModelPath || "",
          notes: response.item.notes,
        },
      }));
      setOverview(response.overview);
      toast({
        title: "Training job dibuat",
        description: `${response.item.datasetName} masuk queue untuk modul ${moduleLabelMap[response.item.targetModule]}.`,
      });
    } catch (submitError) {
      toast({
        title: "Gagal membuat training job",
        description:
          submitError instanceof Error ? submitError.message : "Terjadi error saat membuat training job.",
        variant: "destructive",
      });
    } finally {
      setIsTrainingJobSubmitting(false);
    }
  };

  const handleTrainingJobEditChange = (
    jobId: string,
    patch: Partial<{ status: ModelTrainingJobStatus; outputModelPath: string; notes: string }>
  ) => {
    setTrainingJobEdits((current) => ({
      ...current,
      [jobId]: {
        status: current[jobId]?.status || "queued",
        outputModelPath: current[jobId]?.outputModelPath || "",
        notes: current[jobId]?.notes || "",
        ...patch,
      },
    }));
  };

  const handleSaveTrainingJob = async (jobId: string) => {
    const draft = trainingJobEdits[jobId];
    if (!draft) {
      return;
    }

    try {
      const response = await updateModelTrainingJob(jobId, {
        status: draft.status,
        outputModelPath: draft.outputModelPath.trim() ? draft.outputModelPath.trim() : null,
        notes: draft.notes,
      });
      setTrainingJobs((current) =>
        current.map((item) => (item.id === jobId ? response.item : item))
      );
      setOverview(response.overview);
      setTrainingJobEdits((current) => ({
        ...current,
        [jobId]: {
          status: response.item.status,
          outputModelPath: response.item.outputModelPath || "",
          notes: response.item.notes,
        },
      }));
      toast({
        title: "Training job diperbarui",
        description: `${response.item.datasetName} sekarang berstatus ${trainingJobStatusLabelMap[response.item.status]}.`,
      });
    } catch (updateError) {
      toast({
        title: "Gagal memperbarui training job",
        description:
          updateError instanceof Error ? updateError.message : "Terjadi error saat memperbarui training job.",
        variant: "destructive",
      });
    }
  };

  const handleCreateEvaluation = async () => {
    if (!evaluationDraft.modelVersionId) {
      toast({
        title: "Evaluation belum lengkap",
        description: "Pilih model version yang ingin dievaluasi.",
        variant: "destructive",
      });
      return;
    }

    setIsEvaluationSubmitting(true);
    try {
      const response = await createModelEvaluation({
        ...evaluationDraft,
        falsePositiveNotes: evaluationDraft.falsePositiveNotes.trim(),
        falseNegativeNotes: evaluationDraft.falseNegativeNotes.trim(),
        benchmarkNotes: evaluationDraft.benchmarkNotes.trim(),
      });
      setEvaluations((current) => [response.item, ...current]);
      setEvaluationEdits((current) => ({
        ...current,
        [response.item.id]: {
          status: response.item.status,
          benchmarkNotes: response.item.benchmarkNotes,
        },
      }));
      setOverview(response.overview);
      setModelVersions(await getModelVersions());
      setEvaluationDraft((current) => ({
        ...initialEvaluationDraft,
        modelVersionId: current.modelVersionId,
      }));
      toast({
        title: "Evaluation record dibuat",
        description: `${response.item.modelName} sekarang punya baseline evaluasi untuk review model.`,
      });
    } catch (submitError) {
      toast({
        title: "Gagal membuat evaluation",
        description:
          submitError instanceof Error ? submitError.message : "Terjadi error saat membuat evaluation.",
        variant: "destructive",
      });
    } finally {
      setIsEvaluationSubmitting(false);
    }
  };

  const handleEvaluationEditChange = (
    evaluationId: string,
    patch: Partial<{ status: ModelEvaluationStatus; benchmarkNotes: string }>
  ) => {
    setEvaluationEdits((current) => ({
      ...current,
      [evaluationId]: {
        status: current[evaluationId]?.status || "draft",
        benchmarkNotes: current[evaluationId]?.benchmarkNotes || "",
        ...patch,
      },
    }));
  };

  const handleSaveEvaluation = async (evaluationId: string) => {
    const draft = evaluationEdits[evaluationId];
    if (!draft) {
      return;
    }

    try {
      const response = await updateModelEvaluation(evaluationId, {
        status: draft.status,
        benchmarkNotes: draft.benchmarkNotes,
      });
      setEvaluations((current) =>
        current.map((item) => (item.id === evaluationId ? response.item : item))
      );
      setOverview(response.overview);
      setModelVersions(await getModelVersions());
      setEvaluationEdits((current) => ({
        ...current,
        [evaluationId]: {
          status: response.item.status,
          benchmarkNotes: response.item.benchmarkNotes,
        },
      }));
      toast({
        title: "Evaluation diperbarui",
        description: `${response.item.modelName} sekarang berstatus ${evaluationStatusLabelMap[response.item.status]}.`,
      });
    } catch (updateError) {
      toast({
        title: "Gagal memperbarui evaluation",
        description:
          updateError instanceof Error ? updateError.message : "Terjadi error saat memperbarui evaluation.",
        variant: "destructive",
      });
    }
  };

  const refreshModelVersionsOnly = async () => {
    const [modelVersionItems, evaluationItems] = await Promise.all([
      getModelVersions(),
      getModelEvaluations(),
    ]);
    setModelVersions(modelVersionItems);
    setEvaluations(evaluationItems);
  };

  const handleModelVersionStatus = async (
    modelVersionId: string,
    status: "approved" | "rejected" | "active"
  ) => {
    setIsDeploymentSubmittingId(modelVersionId);
    try {
      const response = await updateModelVersion(modelVersionId, { status });
      setOverview(response.overview);
      await refreshModelVersionsOnly();
      toast({
        title: "Deployment gate diperbarui",
        description: `${response.item.name} sekarang berstatus ${modelVersionStatusLabelMap[response.item.status]}.`,
      });
    } catch (updateError) {
      toast({
        title: "Gagal memperbarui deployment gate",
        description:
          updateError instanceof Error ? updateError.message : "Terjadi error saat memperbarui status model version.",
        variant: "destructive",
      });
    } finally {
      setIsDeploymentSubmittingId(null);
    }
  };

  return (
    <DashboardLayout>
      <Header
        title="Models"
        subtitle="Lifecycle model dipisahkan dari Analysis Modules agar dataset, training, evaluasi, dan deployment gate tetap rapi dan bisa di-review lintas tim."
      />

      {error && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="flex items-center gap-3 p-5 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>Total Dataset</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "..." : overview.totals.datasets}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoading ? "Memuat registry dataset..." : `${overview.totals.readyDatasets} dataset siap training, ${overview.totals.draftDatasets} masih draft.`}
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>Training Jobs</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "..." : overview.totals.trainingJobs}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoading ? "Memuat job training..." : `${overview.totals.runningTrainingJobs} job sedang berjalan. Tahap ini siap diaktifkan berikutnya.`}
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>Model Versions</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "..." : overview.totals.modelVersions}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoading ? "Memuat registry model..." : `${overview.totals.activeModels} model aktif saat ini siap dipakai modul operasional.`}
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>Domain Split</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? "..." : `${overview.domainSplit.PPE}/${overview.domainSplit.HSE}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoading ? "Menghitung distribusi domain..." : `PPE ${overview.domainSplit.PPE} dataset • HSE ${overview.domainSplit.HSE} dataset.`}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
                <Boxes className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Model Registry Snapshot</CardTitle>
                <CardDescription>
                  Model aktif per modul untuk inference operasional. Tahap 1 fokus pada visibility, belum pada approval gate penuh.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat active models...
              </div>
            ) : overview.activeModelsByModule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Belum ada model aktif yang tercatat di registry.
              </div>
            ) : (
              overview.activeModelsByModule.map((model) => (
                <div key={model.id} className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{model.name}</p>
                    <Badge className={domainBadgeClassMap[model.domain]}>{model.domain}</Badge>
                    <Badge variant="outline">{model.moduleKey}</Badge>
                  </div>
                  <p className="mb-2 text-sm text-muted-foreground">{model.modelPath}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Labels: {model.labels.join(", ") || "--"}</span>
                    <span>Updated: {formatDateTime(model.updatedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Roadmap Stage 1</CardTitle>
            <CardDescription>
              Tahap pertama `Models` fokus menyiapkan dataset registry dan visibilitas lifecycle model sebelum training jobs diaktifkan penuh.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overviewSections.map((section) => (
              <div key={section.title} className="rounded-2xl border border-border/70 bg-secondary/15 p-4">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/70">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{section.title}</p>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
              Dataset yang masuk status `Ready` akan menjadi kandidat langsung untuk tahap berikutnya: `Training Jobs`, evaluasi, dan deployment gate.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Buat Dataset Baru</CardTitle>
            <CardDescription>
              Pakai registry ini untuk mencatat dataset lapangan, label target, dan path storage sebelum masuk tahap anotasi/training.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-secondary/10 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Template Dataset Cepat</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => applyDatasetTemplate("ppe.no-helmet")}>
                  PPE • No Helmet
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyDatasetTemplate("ppe.no-safety-vest")}>
                  PPE • No Safety Vest
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyDatasetTemplate("hse.safety-rules")}>
                  HSE • Safety Rules
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Untuk vest, arah yang disarankan adalah dataset <code>person, safety-vest</code> agar model fokus pada positive vest lebih dulu sebelum rule engine menghitung missing vest.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nama Dataset</label>
              <Input
                value={datasetDraft.name}
                onChange={(event) => handleDatasetDraftChange("name", event.target.value)}
                placeholder="PPE Outdoor Area Batch 01"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Domain</label>
                <Select
                  value={datasetDraft.domain}
                  onValueChange={(value: ModelDatasetDomain) => handleDatasetDraftChange("domain", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PPE">PPE</SelectItem>
                    <SelectItem value="HSE">HSE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Source Type</label>
                <Select
                  value={datasetDraft.sourceType}
                  onValueChange={(value: ModelDatasetSourceType) => handleDatasetDraftChange("sourceType", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upload">Upload</SelectItem>
                    <SelectItem value="camera">Camera</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Labels</label>
              <Input
                value={datasetDraft.labels.join(", ")}
                onChange={(event) => handleLabelsChange(event.target.value)}
                placeholder="person, hardhat"
              />
              <p className="text-xs text-muted-foreground">
                Pisahkan label dengan koma. Untuk vest, mulailah dari <code>person, safety-vest</code> agar model tidak terlalu bergantung pada label negatif langsung.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Jumlah Image</label>
                <Input
                  type="number"
                  min={0}
                  value={datasetDraft.imageCount}
                  onChange={(event) => handleDatasetDraftChange("imageCount", Number(event.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Jumlah Annotation</label>
                <Input
                  type="number"
                  min={0}
                  value={datasetDraft.annotationCount}
                  onChange={(event) =>
                    handleDatasetDraftChange("annotationCount", Number(event.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Storage Path</label>
              <Input
                value={datasetDraft.storagePath}
                onChange={(event) => handleDatasetDraftChange("storagePath", event.target.value)}
                placeholder="/datasets/ppe/outdoor-batch-01"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Deskripsi</label>
              <Textarea
                value={datasetDraft.description}
                onChange={(event) => handleDatasetDraftChange("description", event.target.value)}
                placeholder="Kumpulan frame pekerja proyek dengan variasi jarak, occlusion, dan background alat berat."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Status</label>
              <Select
                value={datasetDraft.status}
                onValueChange={(value: ModelDatasetStatus) => handleDatasetDraftChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateDataset} disabled={isSubmitting} className="w-full gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan Dataset...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Tambah Dataset ke Registry
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Dataset Registry</CardTitle>
                <CardDescription>
                  Dataset lapangan yang sudah masuk registry. Tahap awal ini cukup untuk mendata source training dan status kesiapan anotasi.
                </CardDescription>
              </div>
              <Badge variant="outline">
                Latest update: {formatDateTime(overview.latestDatasetAt)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Labels</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Annotation</TableHead>
                  <TableHead>Source Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat dataset registry...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedDatasets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Belum ada dataset di registry. Tambahkan dataset pertama dari panel kiri.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedDatasets.map((dataset) => (
                    <TableRow key={dataset.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{dataset.name}</p>
                          <p className="max-w-[340px] truncate text-xs text-muted-foreground">
                            {dataset.storagePath}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={domainBadgeClassMap[dataset.domain]}>{dataset.domain}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {dataset.labels.join(", ")}
                        </p>
                      </TableCell>
                      <TableCell>{dataset.imageCount}</TableCell>
                      <TableCell>{dataset.annotationCount}</TableCell>
                      <TableCell>{sourceTypeLabelMap[dataset.sourceType]}</TableCell>
                      <TableCell>
                        <Select
                          value={dataset.status}
                          onValueChange={(value: ModelDatasetStatus) =>
                            void handleUpdateDatasetStatus(dataset.id, value)
                          }
                        >
                          <SelectTrigger className="h-9 w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="ready">Ready</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{formatDateTime(dataset.updatedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Buat Training Job</CardTitle>
            <CardDescription>
              Tahap 1 ini mencatat job fine-tuning dari dataset `ready`. Saat job selesai dan output model diisi, kandidat model otomatis masuk ke registry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Playbook per Modul</p>
              <p className="text-xs text-muted-foreground">
                {datasetTemplateByModule[trainingJobDraft.targetModule].description}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Dataset Ready</label>
              <Select
                value={trainingJobDraft.datasetId}
                onValueChange={handleTrainingDatasetChange}
                disabled={readyDatasets.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih dataset ready" />
                </SelectTrigger>
                <SelectContent>
                  {readyDatasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.name} • {dataset.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {readyDatasets.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada dataset `ready`. Ubah status dataset di registry sebelum membuat training job.
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Target Module</label>
                <Select
                  value={trainingJobDraft.targetModule}
                  onValueChange={(value: ModelTargetModule) => handleTrainingModuleChange(value)}
                  disabled={selectableModules.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableModules.map((moduleKey) => (
                      <SelectItem key={moduleKey} value={moduleKey}>
                        {moduleLabelMap[moduleKey]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Epochs</label>
                <Input
                  type="number"
                  min={1}
                  value={trainingJobDraft.epochs}
                  onChange={(event) =>
                    handleTrainingJobDraftChange("epochs", Number(event.target.value) || 1)
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Image Size</label>
                <Input
                  type="number"
                  min={1}
                  value={trainingJobDraft.imageSize}
                  onChange={(event) =>
                    handleTrainingJobDraftChange("imageSize", Number(event.target.value) || 1280)
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Domain</label>
                <Input
                  value={selectedTrainingDataset?.domain || "--"}
                  readOnly
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Base Model Path</label>
              <Input
                value={trainingJobDraft.baseModelPath}
                onChange={(event) => handleTrainingJobDraftChange("baseModelPath", event.target.value)}
                placeholder="/models/base-model.pt"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Catatan Job</label>
              <Textarea
                value={trainingJobDraft.notes}
                onChange={(event) => handleTrainingJobDraftChange("notes", event.target.value)}
                placeholder="Contoh: fine-tune PPE outdoor area untuk pekerja jauh dan scene alat berat."
                rows={4}
              />
            </div>
            <Button
              onClick={handleCreateTrainingJob}
              disabled={isTrainingJobSubmitting || readyDatasets.length === 0}
              className="w-full gap-2"
            >
              {isTrainingJobSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Membuat Training Job...
                </>
              ) : (
                <>
                  <BrainCircuit className="h-4 w-4" />
                  Tambah Training Job
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Training Jobs</CardTitle>
            <CardDescription>
              Registry job fine-tuning. Update status job di sini untuk mensimulasikan lifecycle training sebelum worker training penuh diaktifkan.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset / Module</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Base Model</TableHead>
                  <TableHead>Output Model</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat training jobs...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedTrainingJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Belum ada training job. Gunakan panel kiri untuk menambahkan job pertama dari dataset `ready`.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedTrainingJobs.map((job) => {
                    const draft = trainingJobEdits[job.id] || {
                      status: job.status,
                      outputModelPath: job.outputModelPath || "",
                      notes: job.notes,
                    };

                    return (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{job.datasetName}</p>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <Badge className={domainBadgeClassMap[job.domain]}>{job.domain}</Badge>
                              <span>{moduleLabelMap[job.targetModule]}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          <Select
                            value={draft.status}
                            onValueChange={(value: ModelTrainingJobStatus) =>
                              handleTrainingJobEditChange(job.id, { status: value })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="queued">Queued</SelectItem>
                              <SelectItem value="running">Running</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="failed">Failed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="truncate text-sm text-muted-foreground">{job.baseModelPath}</p>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <Input
                            value={draft.outputModelPath}
                            onChange={(event) =>
                              handleTrainingJobEditChange(job.id, {
                                outputModelPath: event.target.value,
                              })
                            }
                            placeholder="/models/output-candidate.pt"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p>{job.epochs} epoch</p>
                            <p>img {job.imageSize}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p>{formatDateTime(job.updatedAt)}</p>
                            <p>{job.startedAt ? `Start ${formatDateTime(job.startedAt)}` : "Belum start"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void handleSaveTrainingJob(job.id)}
                          >
                            <Save className="h-4 w-4" />
                            Simpan
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Buat Evaluation Record</CardTitle>
            <CardDescription>
              Tahap 1 `Evaluation` dipakai untuk mencatat precision/recall/mAP dan catatan benchmark lapangan sebelum model kandidat lanjut ke deployment gate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Model Version</label>
              <Select
                value={evaluationDraft.modelVersionId}
                onValueChange={(value) => handleEvaluationDraftChange("modelVersionId", value)}
                disabled={sortedModelVersions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih model version" />
                </SelectTrigger>
                <SelectContent>
                  {sortedModelVersions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.name} • {version.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Precision</label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  value={evaluationDraft.precision ?? ""}
                  onChange={(event) =>
                    handleEvaluationDraftChange(
                      "precision",
                      event.target.value === "" ? null : Number(event.target.value)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Recall</label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  value={evaluationDraft.recall ?? ""}
                  onChange={(event) =>
                    handleEvaluationDraftChange(
                      "recall",
                      event.target.value === "" ? null : Number(event.target.value)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">mAP50</label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  value={evaluationDraft.map50 ?? ""}
                  onChange={(event) =>
                    handleEvaluationDraftChange(
                      "map50",
                      event.target.value === "" ? null : Number(event.target.value)
                    )
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">False Positive Notes</label>
              <Textarea
                value={evaluationDraft.falsePositiveNotes}
                onChange={(event) => handleEvaluationDraftChange("falsePositiveNotes", event.target.value)}
                rows={3}
                placeholder="Contoh: masih salah membaca pekerja jauh di tepi frame sebagai no helmet."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">False Negative Notes</label>
              <Textarea
                value={evaluationDraft.falseNegativeNotes}
                onChange={(event) => handleEvaluationDraftChange("falseNegativeNotes", event.target.value)}
                rows={3}
                placeholder="Contoh: helm warna putih di area terang kadang tidak terdeteksi."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Benchmark Notes</label>
              <Textarea
                value={evaluationDraft.benchmarkNotes}
                onChange={(event) => handleEvaluationDraftChange("benchmarkNotes", event.target.value)}
                rows={4}
                placeholder="Ringkasan uji lapangan, kamera pembanding, dan catatan scene sulit."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Status Evaluasi</label>
              <Select
                value={evaluationDraft.status}
                onValueChange={(value: ModelEvaluationStatus) => handleEvaluationDraftChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreateEvaluation}
              disabled={isEvaluationSubmitting || sortedModelVersions.length === 0}
              className="w-full gap-2"
            >
              {isEvaluationSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan Evaluation...
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4" />
                  Tambah Evaluation Record
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Evaluation Registry</CardTitle>
            <CardDescription>
              Hasil evaluasi kandidat model. Ubah status menjadi `approved` atau `rejected` untuk memperbarui decision awal sebelum deployment gate formal.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Metrics</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Benchmark</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat evaluations...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedEvaluations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Belum ada evaluation record. Tambahkan evaluation pertama dari panel kiri.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedEvaluations.map((evaluation) => {
                    const draft = evaluationEdits[evaluation.id] || {
                      status: evaluation.status,
                      benchmarkNotes: evaluation.benchmarkNotes,
                    };

                    return (
                      <TableRow key={evaluation.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{evaluation.modelName}</p>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <Badge className={domainBadgeClassMap[evaluation.domain]}>{evaluation.domain}</Badge>
                              <span>{moduleLabelMap[evaluation.moduleKey]}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p>P {typeof evaluation.precision === "number" ? evaluation.precision.toFixed(2) : "--"}</p>
                            <p>R {typeof evaluation.recall === "number" ? evaluation.recall.toFixed(2) : "--"}</p>
                            <p>mAP50 {typeof evaluation.map50 === "number" ? evaluation.map50.toFixed(2) : "--"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[150px]">
                          <Select
                            value={draft.status}
                            onValueChange={(value: ModelEvaluationStatus) =>
                              handleEvaluationEditChange(evaluation.id, { status: value })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="reviewed">Reviewed</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="min-w-[240px]">
                          <Textarea
                            value={draft.benchmarkNotes}
                            onChange={(event) =>
                              handleEvaluationEditChange(evaluation.id, {
                                benchmarkNotes: event.target.value,
                              })
                            }
                            rows={3}
                          />
                        </TableCell>
                        <TableCell>{formatDateTime(evaluation.updatedAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void handleSaveEvaluation(evaluation.id)}
                          >
                            <Save className="h-4 w-4" />
                            Simpan
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Deployment Gate Guidance</CardTitle>
            <CardDescription>
              Tahap 1 `Deployment Gate` dipakai untuk keputusan sederhana sebelum model kandidat dipakai operasional: approve, reject, atau promote ke active.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-secondary/15 p-4">
              <p className="font-medium text-foreground">Aturan stage 1</p>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li>Model `candidate` berasal dari training job yang selesai dan punya output model.</li>
                <li>Evaluation dipakai untuk memberi justifikasi sebelum model di-approve.</li>
                <li>`Set Active` akan menurunkan model aktif lama pada modul yang sama menjadi `approved`.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
              Gunakan gate ini hanya untuk model yang sudah melewati benchmark lapangan minimal dan catatan false positive/false negative sudah terdokumentasi di `Evaluation`.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Deployment Gate</CardTitle>
            <CardDescription>
              Daftar semua model version. Dari sini kandidat bisa di-approve, di-reject, atau dipromosikan menjadi model aktif per modul.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat deployment gate...
              </div>
            ) : sortedModelVersions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Belum ada model version di registry.
              </div>
            ) : (
              sortedModelVersions.map((version) => (
                <div key={version.id} className="rounded-2xl border border-border/70 bg-secondary/15 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{version.name}</p>
                    <Badge className={domainBadgeClassMap[version.domain]}>{version.domain}</Badge>
                    <Badge variant="outline">{moduleLabelMap[version.moduleKey]}</Badge>
                    <Badge variant={version.status === "active" ? "default" : "secondary"}>
                      {modelVersionStatusLabelMap[version.status]}
                    </Badge>
                  </div>
                  <p className="mb-2 text-sm text-muted-foreground">{version.modelPath}</p>
                  <p className="mb-3 text-sm text-muted-foreground">{version.evaluationSummary}</p>
                  <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Labels: {version.labels.join(", ") || "--"}</span>
                    <span>Updated: {formatDateTime(version.updatedAt)}</span>
                    <span>Source Job: {version.sourceJobId || "--"}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isDeploymentSubmittingId === version.id || version.status === "approved"}
                      onClick={() => void handleModelVersionStatus(version.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isDeploymentSubmittingId === version.id || version.status === "rejected"}
                      onClick={() => void handleModelVersionStatus(version.id, "rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={isDeploymentSubmittingId === version.id || version.status === "active"}
                      onClick={() => void handleModelVersionStatus(version.id, "active")}
                    >
                      {isDeploymentSubmittingId === version.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Set Active"
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function defaultBaseModelPath(targetModule: ModelTargetModule, overview: ModelsOverview) {
  return (
    overview.activeModelsByModule.find((item) => item.moduleKey === targetModule)?.modelPath || ""
  );
}
