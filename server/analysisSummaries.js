const fs = require("fs");
const path = require("path");

const createAnalysisSummaryHelpers = ({
  dumpTruckBedOpenDefinition,
  fileExists,
  ppeAnalysisDefinitions,
  publicSnapshotUrl,
  readAnalysisHistory,
  redLightViolationDefinition,
  workingAtHeightDefinition,
}) => {
  const severityToRiskScore = (severity) => {
    if (severity === "high") return 90;
    if (severity === "medium") return 65;
    return 30;
  };

  const getPpeAnalysisDefinition = (analysisType) => {
    if (analysisType === "working_at_height") {
      return workingAtHeightDefinition;
    }
    if (analysisType === "red_light_violation") {
      return redLightViolationDefinition;
    }
    if (analysisType === "dump_truck_bed_open") {
      return dumpTruckBedOpenDefinition;
    }
    if (!analysisType) {
      return ppeAnalysisDefinitions.no_helmet;
    }

    return (
      Object.values(ppeAnalysisDefinitions).find((item) => item.analysisType === analysisType) ||
      ppeAnalysisDefinitions.no_helmet
    );
  };

  const buildPpeAnalysisFindings = (summary, context = {}) => {
    const events = Array.isArray(summary.events) ? summary.events : [];
    const detectedAnalysisType =
      context.analysisType ||
      events.find((event) => typeof event?.event_type === "string")?.event_type ||
      "no_helmet";
    const definition = getPpeAnalysisDefinition(detectedAnalysisType);
    const runId = context.runId || `run-${Date.now()}`;
    const createdAt = context.createdAt || new Date().toISOString();
    const sourceId = context.sourceId || "";
    const sourceName = context.sourceName || "Unknown Source";
    const sourceLocation = context.sourceLocation || "";
    const sourceType = context.sourceType || "upload";
    const outputDir = context.outputDir || null;
    const configSnapshot = context.configSnapshot || {};

    return events.map((event) => {
      const durationSeconds = Math.max(0, Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0));
      const riskScore = Math.max(30, Math.min(95, Math.round(Number(event.max_confidence || 0) * 100)));
      const snapshotUrl = event.snapshotUrl || null;
      const isUncertain = event.status === "uncertain";
      return {
        id: `finding-${event.event_id}`,
        runId,
        sourceId,
        sourceName,
        sourceLocation,
        sourceType,
        category: "PPE",
        moduleKey: definition.moduleKey,
        findingType: definition.findingType,
        title: isUncertain
          ? `Indikasi ${definition.detailLabel} perlu verifikasi`
          : definition.title,
        detail: isUncertain
          ? `Detector menemukan indikasi ${definition.detailLabel} pada track ${event.track_id} di ROI ${event.roi_id}, tetapi confidence positif PPE pada track ini belum cukup konsisten untuk dijadikan violation final.`
          : `Detector menemukan event ${definition.detailLabel} pada track ${event.track_id} di ROI ${event.roi_id}.`,
        recommendation: definition.recommendation,
        severity: isUncertain ? "low" : riskScore >= 80 ? "high" : "medium",
        status: isUncertain ? "uncertain" : "open",
        riskScore,
        metric: `${durationSeconds.toFixed(1)} s • conf ${Number(event.max_confidence || 0).toFixed(2)}`,
        eventCount: isUncertain ? 0 : 1,
        violatorCount: isUncertain ? 0 : 1,
        startsAtSeconds: Number(event.start_time_seconds || 0),
        endsAtSeconds: Number(event.end_time_seconds || 0),
        durationSeconds,
        roiId: event.roi_id || null,
        zoneIds: [],
        requiredPpe: definition.requiredPpe,
        trackIds: Number.isFinite(Number(event.track_id)) ? [Number(event.track_id)] : [],
        labels: definition.labels,
        snapshotUrl,
        evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
        detectorEvidence: {
          analysisType: definition.analysisType,
          outputDir,
          createdAt,
        },
        configSnapshot,
        metadata: {
          eventId: event.event_id,
          maxConfidence: Number(event.max_confidence || 0),
          eventStatus: event.status || "violation",
          detectionMode: event.detection_mode || "direct",
        },
        createdAt,
        updatedAt: createdAt,
      };
    });
  };

  const buildRedLightViolationAnalysisFindings = (summary, context = {}) => {
    const events = Array.isArray(summary.events) ? summary.events : [];
    const definition = redLightViolationDefinition;
    const runId = context.runId || `run-${Date.now()}`;
    const createdAt = context.createdAt || new Date().toISOString();
    const sourceId = context.sourceId || "";
    const sourceName = context.sourceName || "Unknown Source";
    const sourceLocation = context.sourceLocation || "";
    const sourceType = context.sourceType || "upload";
    const outputDir = context.outputDir || null;
    const configSnapshot = context.configSnapshot || {};

    return events.map((event) => {
      const durationSeconds = Math.max(
        0,
        Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0)
      );
      const maxConfidence = Number(event.max_confidence || 0);
      const riskScore = Math.max(55, Math.min(95, Math.round(maxConfidence * 100)));
      const snapshotUrl = event.snapshotUrl || null;
      const intersectionId = event.roi_id || configSnapshot.intersectionId || "mine-intersection";
      const trackId = Number(event.track_id);
      return {
        id: `finding-${event.event_id}`,
        runId,
        sourceId,
        sourceName,
        sourceLocation,
        sourceType,
        category: "Operations",
        moduleKey: definition.moduleKey,
        findingType: definition.findingType,
        title: definition.title,
        detail: `Detector menemukan kendaraan pada track ${trackId} melintasi stop line di area ${intersectionId} saat lampu merah aktif.`,
        recommendation: definition.recommendation,
        severity: riskScore >= 85 ? "high" : "medium",
        status: "open",
        riskScore,
        metric: `${durationSeconds.toFixed(1)} s • conf ${maxConfidence.toFixed(2)}`,
        eventCount: 1,
        violatorCount: 1,
        startsAtSeconds: Number(event.start_time_seconds || 0),
        endsAtSeconds: Number(event.end_time_seconds || 0),
        durationSeconds,
        roiId: event.roi_id || null,
        zoneIds: event.roi_id ? [event.roi_id] : [],
        requiredPpe: [],
        trackIds: Number.isFinite(trackId) ? [trackId] : [],
        labels: definition.labels,
        snapshotUrl,
        evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
        detectorEvidence: {
          analysisType: definition.analysisType,
          outputDir,
          createdAt,
        },
        configSnapshot,
        metadata: {
          eventId: event.event_id,
          maxConfidence,
          eventStatus: event.status || "violation",
          detectionMode: event.detection_mode || "red-light",
        },
        createdAt,
        updatedAt: createdAt,
      };
    });
  };

  const buildDumpTruckBedOpenAnalysisFindings = (summary, context = {}) => {
    const events = Array.isArray(summary.events) ? summary.events : [];
    const definition = dumpTruckBedOpenDefinition;
    const runId = context.runId || `run-${Date.now()}`;
    const createdAt = context.createdAt || new Date().toISOString();
    const sourceId = context.sourceId || "";
    const sourceName = context.sourceName || "Unknown Source";
    const sourceLocation = context.sourceLocation || "";
    const sourceType = context.sourceType || "upload";
    const outputDir = context.outputDir || null;
    const configSnapshot = context.configSnapshot || {};

    return events.map((event) => {
      const durationSeconds = Math.max(
        0,
        Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0)
      );
      const maxConfidence = Number(event.max_confidence || 0);
      const riskScore = Math.max(60, Math.min(95, Math.round(maxConfidence * 100)));
      const snapshotUrl = event.snapshotUrl || null;
      const roiId = event.roi_id || configSnapshot.roiId || "hauling-road-dump-truck";
      const trackId = Number(event.track_id);
      return {
        id: `finding-${event.event_id}`,
        runId,
        sourceId,
        sourceName,
        sourceLocation,
        sourceType,
        category: "Operations",
        moduleKey: definition.moduleKey,
        findingType: definition.findingType,
        title: definition.title,
        detail: `Detector menemukan dump truck pada track ${trackId} bergerak di area ${roiId} saat status bak terindikasi terbuka.`,
        recommendation: definition.recommendation,
        severity: riskScore >= 85 ? "high" : "medium",
        status: "open",
        riskScore,
        metric: `${durationSeconds.toFixed(1)} s • conf ${maxConfidence.toFixed(2)}`,
        eventCount: 1,
        violatorCount: 1,
        startsAtSeconds: Number(event.start_time_seconds || 0),
        endsAtSeconds: Number(event.end_time_seconds || 0),
        durationSeconds,
        roiId: event.roi_id || null,
        zoneIds: event.roi_id ? [event.roi_id] : [],
        requiredPpe: [],
        trackIds: Number.isFinite(trackId) ? [trackId] : [],
        labels: definition.labels,
        snapshotUrl,
        evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
        detectorEvidence: {
          analysisType: definition.analysisType,
          outputDir,
          createdAt,
        },
        configSnapshot,
        metadata: {
          eventId: event.event_id,
          maxConfidence,
          eventStatus: event.status || "violation",
          detectionMode: event.detection_mode || "bed-open-moving",
        },
        createdAt,
        updatedAt: createdAt,
      };
    });
  };

  const buildWorkingAtHeightAnalysisFindings = (summary, context = {}) => {
    const events = Array.isArray(summary.events) ? summary.events : [];
    const definition = workingAtHeightDefinition;
    const runId = context.runId || `run-${Date.now()}`;
    const createdAt = context.createdAt || new Date().toISOString();
    const sourceId = context.sourceId || "";
    const sourceName = context.sourceName || "Unknown Source";
    const sourceLocation = context.sourceLocation || "";
    const sourceType = context.sourceType || "upload";
    const outputDir = context.outputDir || null;
    const configSnapshot = context.configSnapshot || {};

    return events.map((event) => {
      const durationSeconds = Math.max(
        0,
        Number(event.end_time_seconds || 0) - Number(event.start_time_seconds || 0)
      );
      const riskScore = Math.max(45, Math.min(95, Math.round(Number(event.max_confidence || 0) * 100)));
      const snapshotUrl = event.snapshotUrl || null;
      return {
        id: `finding-${event.event_id}`,
        runId,
        sourceId,
        sourceName,
        sourceLocation,
        sourceType,
        category: "HSE",
        moduleKey: definition.moduleKey,
        findingType: definition.findingType,
        title: definition.title,
        detail: `Detector menemukan person berada pada zone ${event.roi_id} selama ${durationSeconds.toFixed(1)} detik.`,
        recommendation: definition.recommendation,
        severity: riskScore >= 80 ? "high" : "medium",
        status: "open",
        riskScore,
        metric: `${durationSeconds.toFixed(1)} s • conf ${Number(event.max_confidence || 0).toFixed(2)}`,
        eventCount: 1,
        violatorCount: 1,
        startsAtSeconds: Number(event.start_time_seconds || 0),
        endsAtSeconds: Number(event.end_time_seconds || 0),
        durationSeconds,
        roiId: event.roi_id || null,
        zoneIds: event.roi_id ? [event.roi_id] : [],
        requiredPpe: definition.requiredPpe,
        trackIds: Number.isFinite(Number(event.track_id)) ? [Number(event.track_id)] : [],
        labels: definition.labels,
        snapshotUrl,
        evidenceUrls: snapshotUrl ? [snapshotUrl] : [],
        detectorEvidence: {
          analysisType: definition.analysisType,
          outputDir,
          createdAt,
        },
        configSnapshot,
        metadata: {
          eventId: event.event_id,
          maxConfidence: Number(event.max_confidence || 0),
          eventStatus: event.status || "violation",
          detectionMode: event.detection_mode || "zone-presence",
        },
        createdAt,
        updatedAt: createdAt,
      };
    });
  };

  const buildHseAnalysisFindings = (source, config, findings, context = {}) => {
    const runId = context.runId || `hse-run-${Date.now()}`;
    const createdAt = context.createdAt || new Date().toISOString();
    const outputDir = context.outputDir || null;
    const zoneIds = splitCommaSeparated(config.restrictedZones).map((item) =>
      String(item).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    );
    const requiredPpe = splitCommaSeparated(config.requiredPpe);

    return findings.map((finding) => ({
      id: `finding-${finding.id}`,
      runId,
      sourceId: source.id,
      sourceName: source.name,
      sourceLocation: source.location || "",
      sourceType: source.type,
      category: "HSE",
      moduleKey: "hse.safety-rules",
      findingType: finding.id,
      title: finding.title,
      detail: finding.detail,
      recommendation: finding.recommendation,
      severity: finding.severity,
      status: finding.status === "resolved" ? "resolved" : "open",
      riskScore: severityToRiskScore(finding.severity),
      metric: finding.metric || null,
      eventCount: finding.metric ? 1 : 0,
      violatorCount: finding.severity === "high" ? 1 : 0,
      startsAtSeconds: null,
      endsAtSeconds: null,
      durationSeconds: null,
      roiId: null,
      zoneIds,
      requiredPpe,
      trackIds: [],
      labels: [],
      snapshotUrl: null,
      evidenceUrls: [],
      detectorEvidence: {
        analysisType: context.latestEvidenceAnalysisType || null,
        outputDir,
        createdAt,
      },
      configSnapshot: config,
      metadata: {
        sourceStatus: source.status,
        monitoringStatus: source.monitoringStatus,
      },
      createdAt,
      updatedAt: createdAt,
    }));
  };

  const enrichSummary = (req, summary, context = {}) => {
    const events = Array.isArray(summary.events)
      ? summary.events.map((event) => ({
          ...event,
          snapshotUrl: event.snapshot_path
            ? publicSnapshotUrl(req, event.snapshot_path)
            : null,
        }))
      : [];

    return {
      ...summary,
      events,
      analysisFindings:
        context.analysisType === "working_at_height"
          ? buildWorkingAtHeightAnalysisFindings({ ...summary, events }, context)
          : context.analysisType === "red_light_violation"
            ? buildRedLightViolationAnalysisFindings({ ...summary, events }, context)
            : context.analysisType === "dump_truck_bed_open"
              ? buildDumpTruckBedOpenAnalysisFindings({ ...summary, events }, context)
            : buildPpeAnalysisFindings({ ...summary, events }, context),
    };
  };

  const readRunSummary = (req, outputDir, context = {}) => {
    if (!outputDir || !fileExists(outputDir)) {
      return null;
    }

    const summaryPath = path.join(outputDir, "summary.json");
    if (!fileExists(summaryPath)) {
      return null;
    }

    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      return enrichSummary(req, summary, context);
    } catch (_error) {
      return null;
    }
  };

  const buildLatestAnalysisSummary = (req, run) => {
    if (!run) {
      return null;
    }

    const latestRunSummary = readRunSummary(req, run.outputDir, {
      analysisType: run.analysisType,
      runId: run.id,
      outputDir: run.outputDir,
      createdAt: run.createdAt,
      sourceId: run.mediaSourceId || "",
      sourceName: run.sourceName || "",
      sourceLocation: run.location || "",
    });
    const latestGlobalSummary = latestRunSummary?.global_summary || null;
    const definition = getPpeAnalysisDefinition(run.analysisType);

    return {
      id: run.id,
      analysisType: run.analysisType,
      mediaSourceId: run.mediaSourceId,
      sourceName: run.sourceName,
      location: run.location,
      createdAt: run.createdAt,
      outputDir: run.outputDir,
      eventCount: Number(run.eventCount || 0),
      violatorCount: Number(run.violatorCount || 0),
      stableDetectedTrackCount: Number(run.stableDetectedTrackCount || 0),
      rawDetectedTrackCount: Number(run.rawDetectedTrackCount || 0),
      durationSeconds: Number(latestRunSummary?.duration_seconds || 0),
      analyzedFrameCount: Number(latestRunSummary?.analyzed_frame_count || 0),
      fps: Number(latestRunSummary?.fps || 0),
      snapshotCount: Number(latestGlobalSummary?.snapshot_count || 0),
      firstEventSeconds: latestGlobalSummary?.first_event_seconds ?? null,
      lastEventSeconds: latestGlobalSummary?.last_event_seconds ?? null,
      totalViolationDurationSeconds: Number(
        latestGlobalSummary?.total_violation_duration_seconds || 0
      ),
      narrative:
        latestGlobalSummary?.narrative ||
        (Number(run.eventCount || 0) > 0
          ? `Run terakhir menemukan ${run.eventCount} event ${definition.findingLabel} pada source ${run.sourceName}.`
          : `Run terakhir pada source ${run.sourceName} tidak menemukan event ${definition.findingLabel}.`),
      analysisFindings: Array.isArray(latestRunSummary?.analysisFindings)
        ? latestRunSummary.analysisFindings
        : [],
      events: Array.isArray(latestRunSummary?.events)
        ? latestRunSummary.events.slice(0, 6)
        : [],
    };
  };

  const splitCommaSeparated = (value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const getLatestRunForSource = (analysisType, mediaSource) => {
    const analysisHistory = readAnalysisHistory();
    const typedHistory = analysisHistory.filter((item) => item.analysisType === analysisType);
    return (
      typedHistory.find((run) => run.mediaSourceId === mediaSource.id) ||
      typedHistory.find((run) => run.videoPath === mediaSource.source) ||
      null
    );
  };

  const severityRank = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const buildHseSafetyRulesReport = (req, source, config, context = {}) => {
    const latestNoHelmetRun = getLatestRunForSource("no_helmet", source);
    const latestNoHelmetSummary = latestNoHelmetRun
      ? buildLatestAnalysisSummary(req, latestNoHelmetRun)
      : null;
    const latestNoSafetyVestRun = getLatestRunForSource("no_safety_vest", source);
    const latestNoSafetyVestSummary = latestNoSafetyVestRun
      ? buildLatestAnalysisSummary(req, latestNoSafetyVestRun)
      : null;
    const latestNoLifeVestRun = getLatestRunForSource("no_life_vest", source);
    const latestNoLifeVestSummary = latestNoLifeVestRun
      ? buildLatestAnalysisSummary(req, latestNoLifeVestRun)
      : null;
    const latestWorkingAtHeightRun = getLatestRunForSource("working_at_height", source);
    const latestWorkingAtHeightSummary = latestWorkingAtHeightRun
      ? buildLatestAnalysisSummary(req, latestWorkingAtHeightRun)
      : null;
    const requiredPpe = splitCommaSeparated(config.requiredPpe);
    const restrictedZones = splitCommaSeparated(config.restrictedZones);
    const findings = [];
    const readiness = [];
    const requiresHelmet = requiredPpe.some((item) => /helmet/i.test(item));
    const requiresSafetyVest = requiredPpe.some((item) => {
      const normalized = String(item || "").toLowerCase();
      return (normalized.includes("safety vest") || normalized === "vest" || normalized.includes("rompi")) &&
        !normalized.includes("life");
    });
    const requiresLifeVest = requiredPpe.some((item) => /life\s*vest|pelampung/i.test(item));

    const modelReady = fileExists(config.modelPath);
    readiness.push({
      id: "model",
      label: "Model HSE",
      status: modelReady ? "ready" : "missing",
      detail: modelReady
        ? `Model tersedia di ${config.modelPath}`
        : `Model path ${config.modelPath} belum tersedia di server.`,
    });

    readiness.push({
      id: "zones",
      label: "Restricted Zones",
      status: restrictedZones.length > 0 ? "ready" : "missing",
      detail:
        restrictedZones.length > 0
          ? `${restrictedZones.length} zona tercatat untuk pengawasan.`
          : "Belum ada restricted zone yang didefinisikan.",
    });

    readiness.push({
      id: "required-ppe",
      label: "Required PPE",
      status: requiredPpe.length > 0 ? "ready" : "missing",
      detail:
        requiredPpe.length > 0
          ? requiredPpe.join(", ")
          : "Checklist PPE wajib belum ditentukan.",
    });

    readiness.push({
      id: "source-context",
      label: "Source Context",
      status: source.status === "active" ? "ready" : "warning",
      detail: `${source.name} • ${source.location} • ${source.type === "camera" ? "Camera" : "Upload"}`,
    });

    if (!source.analytics.includes("HSE")) {
      findings.push({
        id: "missing-hse-category",
        title: "Source belum ditandai untuk kategori HSE",
        severity: "medium",
        status: "open",
        detail:
          "Source ini belum memasukkan kategori output HSE di Media Sources sehingga rule keselamatan umum berisiko tidak masuk workflow operator.",
        recommendation: "Tambahkan kategori HSE pada source agar dashboard dan operator memakai workflow yang konsisten.",
      });
    }

    if (!modelReady) {
      findings.push({
        id: "missing-model",
        title: "Model HSE belum tersedia",
        severity: "high",
        status: "open",
        detail: `Model path ${config.modelPath} tidak ditemukan di server.`,
        recommendation: "Sinkronkan model HSE ke server atau gunakan model PPE/HSE yang valid sebelum assessment rutin dijalankan.",
      });
    }

    if (source.type === "camera" && source.executionMode !== "manual" && source.monitoringStatus !== "running") {
      findings.push({
        id: "monitoring-inactive",
        title: "Monitoring source camera belum aktif",
        severity: "medium",
        status: "open",
        detail: `Source camera berada pada mode ${source.executionMode} tetapi status monitoring masih ${source.monitoringStatus}.`,
        recommendation: "Aktifkan monitoring dari Live Monitoring agar rule HSE dievaluasi secara berkala.",
      });
    }

    if (source.status !== "active") {
      findings.push({
        id: "source-status",
        title: "Status source belum aktif",
        severity: source.status === "maintenance" ? "medium" : "high",
        status: "open",
        detail: `Status source saat ini ${source.status}.`,
        recommendation: "Kembalikan source ke status active sebelum dijadikan baseline HSE operasional.",
      });
    }

    if (latestNoHelmetSummary) {
      if (requiresHelmet && latestNoHelmetSummary.violatorCount > 0) {
        findings.push({
          id: "helmet-violation",
          title: "Pelanggaran helm terdeteksi pada baseline HSE",
          severity: latestNoHelmetSummary.violatorCount >= 2 ? "high" : "medium",
          status: "open",
          detail: `Run terakhir menemukan ${latestNoHelmetSummary.eventCount} event dan ${latestNoHelmetSummary.violatorCount} track pelanggar untuk aturan helm.`,
          recommendation: "Lakukan inspeksi lapangan, pastikan area wajib helm dipatuhi, dan tindak lanjuti pelanggaran berulang.",
          metric: `${latestNoHelmetSummary.eventCount} event / ${latestNoHelmetSummary.violatorCount} violator`,
        });
      }
    } else if (requiresHelmet) {
      findings.push({
        id: "missing-helmet-evidence",
        title: "Belum ada evidence helmet untuk source ini",
        severity: "medium",
        status: "open",
        detail: "Belum ada run PPE • No Helmet yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
        recommendation: "Jalankan analisis PPE • No Helmet terlebih dulu atau aktifkan monitoring camera agar baseline HSE punya evidence visual.",
      });
    }

    if (latestNoSafetyVestSummary) {
      if (requiresSafetyVest && latestNoSafetyVestSummary.violatorCount > 0) {
        findings.push({
          id: "safety-vest-violation",
          title: "Pelanggaran rompi keselamatan terdeteksi pada baseline HSE",
          severity: latestNoSafetyVestSummary.violatorCount >= 2 ? "high" : "medium",
          status: "open",
          detail: `Run terakhir menemukan ${latestNoSafetyVestSummary.eventCount} event dan ${latestNoSafetyVestSummary.violatorCount} track pelanggar untuk aturan rompi keselamatan.`,
          recommendation: "Lakukan inspeksi lapangan, pastikan area wajib rompi dipatuhi, dan tindak lanjuti pelanggaran berulang.",
          metric: `${latestNoSafetyVestSummary.eventCount} event / ${latestNoSafetyVestSummary.violatorCount} violator`,
        });
      }
    } else if (requiresSafetyVest) {
      findings.push({
        id: "missing-safety-vest-evidence",
        title: "Belum ada evidence rompi keselamatan untuk source ini",
        severity: "medium",
        status: "open",
        detail: "Belum ada run PPE • No Safety Vest yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
        recommendation: "Jalankan analisis PPE • No Safety Vest terlebih dulu agar HSE punya evidence visual rompi keselamatan.",
      });
    }

    if (latestNoLifeVestSummary) {
      if (requiresLifeVest && latestNoLifeVestSummary.violatorCount > 0) {
        findings.push({
          id: "life-vest-violation",
          title: "Pelanggaran pelampung terdeteksi pada baseline HSE",
          severity: latestNoLifeVestSummary.violatorCount >= 2 ? "high" : "medium",
          status: "open",
          detail: `Run terakhir menemukan ${latestNoLifeVestSummary.eventCount} event dan ${latestNoLifeVestSummary.violatorCount} track pelanggar untuk aturan pelampung.`,
          recommendation: "Verifikasi area kerja dekat air, pastikan life vest wajib dipakai, dan tindak lanjuti pelanggaran berulang.",
          metric: `${latestNoLifeVestSummary.eventCount} event / ${latestNoLifeVestSummary.violatorCount} violator`,
        });
      }
    } else if (requiresLifeVest) {
      findings.push({
        id: "missing-life-vest-evidence",
        title: "Belum ada evidence pelampung untuk source ini",
        severity: "medium",
        status: "open",
        detail: "Belum ada run PPE • No Life Vest yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
        recommendation: "Jalankan analisis PPE • No Life Vest terlebih dulu agar HSE punya evidence visual pelampung.",
      });
    }

    if (latestWorkingAtHeightSummary && latestWorkingAtHeightSummary.eventCount > 0) {
      findings.push({
        id: "working-at-height-activity",
        title: "Aktivitas bekerja di ketinggian terdeteksi",
        severity: latestWorkingAtHeightSummary.violatorCount >= 2 ? "high" : "medium",
        status: "open",
        detail: `Run working at height terakhir menemukan ${latestWorkingAtHeightSummary.eventCount} event dan ${latestWorkingAtHeightSummary.violatorCount} track pada zone elevasi.`,
        recommendation:
          "Verifikasi visual aktivitas di area ketinggian, pastikan akses zona elevasi sah, dan cek APD wajib untuk pekerjaan di ketinggian.",
        metric: `${latestWorkingAtHeightSummary.eventCount} event / ${latestWorkingAtHeightSummary.violatorCount} track`,
      });
    }

    if (
      requiresHelmet &&
      requiresSafetyVest &&
      latestNoHelmetSummary &&
      latestNoSafetyVestSummary &&
      (latestNoHelmetSummary.violatorCount > 0 || latestNoSafetyVestSummary.violatorCount > 0)
    ) {
      findings.push({
        id: "ppe-compliance-pattern",
        title: "Baseline PPE menunjukkan pola kepatuhan yang perlu ditinjau",
        severity:
          latestNoHelmetSummary.violatorCount + latestNoSafetyVestSummary.violatorCount >= 3
            ? "high"
            : "medium",
        status: "open",
        detail: `Evidence PPE terbaru menunjukkan ${latestNoHelmetSummary.violatorCount} track pelanggar helm dan ${latestNoSafetyVestSummary.violatorCount} track pelanggar rompi keselamatan.`,
        recommendation: "Audit area kerja, evaluasi briefing keselamatan, dan pastikan PPE wajib dipenuhi secara konsisten pada source ini.",
        metric: `${latestNoHelmetSummary.violatorCount} helmet / ${latestNoSafetyVestSummary.violatorCount} vest`,
      });
    }

    if (
      requiresLifeVest &&
      latestNoLifeVestSummary &&
      latestNoLifeVestSummary.violatorCount > 0
    ) {
      findings.push({
        id: "life-vest-compliance-pattern",
        title: "Baseline PPE menunjukkan risiko kepatuhan pelampung",
        severity: latestNoLifeVestSummary.violatorCount >= 2 ? "high" : "medium",
        status: "open",
        detail: `Evidence PPE terbaru menunjukkan ${latestNoLifeVestSummary.violatorCount} track pelanggar pelampung pada source ini.`,
        recommendation: "Audit area perairan, evaluasi briefing keselamatan kerja dekat air, dan pastikan pelampung wajib dipakai secara konsisten.",
        metric: `${latestNoLifeVestSummary.violatorCount} life vest`,
      });
    }

    if (!latestNoHelmetSummary && !latestNoSafetyVestSummary) {
      findings.push({
        id: "missing-evidence",
        title: "Belum ada evidence analitik untuk source ini",
        severity: "medium",
        status: "open",
        detail: "Belum ada run PPE yang bisa dipakai sebagai baseline evidence HSE untuk source ini.",
        recommendation: "Jalankan analisis PPE terlebih dulu atau aktifkan monitoring camera agar baseline HSE punya evidence visual.",
      });
    }

    const highestSeverity = findings.reduce((current, item) => {
      return severityRank[item.severity] > severityRank[current] ? item.severity : current;
    }, "low");

    const outputRiskLevel =
      findings.length === 0 ? "low" : highestSeverity === "high" ? "high" : highestSeverity === "medium" ? "medium" : "low";

    const readyCount = readiness.filter((item) => item.status === "ready").length;
    const latestSnapshotUrl =
      latestNoHelmetSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
      latestNoSafetyVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
      latestNoLifeVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
      latestWorkingAtHeightSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
      null;
    const analysisFindings = buildHseAnalysisFindings(source, config, findings, {
      runId: context.runId,
      createdAt: context.createdAt,
      outputDir: context.outputDir,
      latestEvidenceAnalysisType: latestNoHelmetSummary?.analysisType || null,
      latestSnapshotUrl,
    });

    return {
      source: {
        id: source.id,
        name: source.name,
        location: source.location,
        type: source.type,
        status: source.status,
        analytics: source.analytics,
        executionMode: source.executionMode,
        monitoringStatus: source.monitoringStatus,
        monitoringIntervalSeconds: source.monitoringIntervalSeconds,
      },
      configSnapshot: config,
      readiness: {
        readyCount,
        totalCount: readiness.length,
        items: readiness,
      },
      latestEvidence: latestNoHelmetSummary
        ? {
            analysisType: latestNoHelmetSummary.analysisType,
            createdAt: latestNoHelmetSummary.createdAt,
            eventCount: latestNoHelmetSummary.eventCount,
            violatorCount: latestNoHelmetSummary.violatorCount,
            snapshotCount: latestNoHelmetSummary.snapshotCount,
            narrative: latestNoHelmetSummary.narrative,
            outputDir: latestNoHelmetSummary.outputDir,
            latestSnapshotUrl,
          }
        : null,
      latestEvidenceByModule: {
        noHelmet: latestNoHelmetSummary
          ? {
              analysisType: latestNoHelmetSummary.analysisType,
              createdAt: latestNoHelmetSummary.createdAt,
              eventCount: latestNoHelmetSummary.eventCount,
              violatorCount: latestNoHelmetSummary.violatorCount,
              snapshotCount: latestNoHelmetSummary.snapshotCount,
              narrative: latestNoHelmetSummary.narrative,
              outputDir: latestNoHelmetSummary.outputDir,
              latestSnapshotUrl,
            }
          : null,
        noSafetyVest: latestNoSafetyVestSummary
          ? {
              analysisType: latestNoSafetyVestSummary.analysisType,
              createdAt: latestNoSafetyVestSummary.createdAt,
              eventCount: latestNoSafetyVestSummary.eventCount,
              violatorCount: latestNoSafetyVestSummary.violatorCount,
              snapshotCount: latestNoSafetyVestSummary.snapshotCount,
              narrative: latestNoSafetyVestSummary.narrative,
              outputDir: latestNoSafetyVestSummary.outputDir,
              latestSnapshotUrl:
                latestNoSafetyVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
                null,
            }
          : null,
        noLifeVest: latestNoLifeVestSummary
          ? {
              analysisType: latestNoLifeVestSummary.analysisType,
              createdAt: latestNoLifeVestSummary.createdAt,
              eventCount: latestNoLifeVestSummary.eventCount,
              violatorCount: latestNoLifeVestSummary.violatorCount,
              snapshotCount: latestNoLifeVestSummary.snapshotCount,
              narrative: latestNoLifeVestSummary.narrative,
              outputDir: latestNoLifeVestSummary.outputDir,
              latestSnapshotUrl:
                latestNoLifeVestSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
                null,
            }
          : null,
        workingAtHeight: latestWorkingAtHeightSummary
          ? {
              analysisType: latestWorkingAtHeightSummary.analysisType,
              createdAt: latestWorkingAtHeightSummary.createdAt,
              eventCount: latestWorkingAtHeightSummary.eventCount,
              violatorCount: latestWorkingAtHeightSummary.violatorCount,
              snapshotCount: latestWorkingAtHeightSummary.snapshotCount,
              narrative: latestWorkingAtHeightSummary.narrative,
              outputDir: latestWorkingAtHeightSummary.outputDir,
              latestSnapshotUrl:
                latestWorkingAtHeightSummary?.events.find((event) => event.snapshotUrl)?.snapshotUrl ||
                null,
            }
          : null,
      },
      findings,
      analysisFindings,
      summary: {
        riskLevel: outputRiskLevel,
        openFindingCount: findings.length,
        highSeverityCount: findings.filter((item) => item.severity === "high").length,
        mediumSeverityCount: findings.filter((item) => item.severity === "medium").length,
        lowSeverityCount: findings.filter((item) => item.severity === "low").length,
        latestNoHelmetEventCount: latestNoHelmetSummary?.eventCount || 0,
        latestNoHelmetViolatorCount: latestNoHelmetSummary?.violatorCount || 0,
        latestNoSafetyVestEventCount: latestNoSafetyVestSummary?.eventCount || 0,
        latestNoSafetyVestViolatorCount: latestNoSafetyVestSummary?.violatorCount || 0,
        latestNoLifeVestEventCount: latestNoLifeVestSummary?.eventCount || 0,
        latestNoLifeVestViolatorCount: latestNoLifeVestSummary?.violatorCount || 0,
        latestWorkingAtHeightEventCount: latestWorkingAtHeightSummary?.eventCount || 0,
        latestWorkingAtHeightViolatorCount: latestWorkingAtHeightSummary?.violatorCount || 0,
        requiredPpe,
        restrictedZones,
        generatedAt: new Date().toISOString(),
        narrative:
          findings.length === 0
            ? `Baseline HSE untuk ${source.name} terlihat sehat. Semua komponen inti tersedia dan belum ada temuan kritis dari evidence terbaru.`
            : `Assessment HSE untuk ${source.name} menghasilkan ${findings.length} temuan aktif dengan level risiko ${outputRiskLevel}. Fokus utama ada pada kesiapan monitoring, baseline PPE, dan restricted zone.`,
      },
    };
  };

  const readHseSafetyRulesReport = (outputDir) => {
    if (!outputDir || !fileExists(outputDir)) {
      return null;
    }

    const reportPath = path.join(outputDir, "report.json");
    if (!fileExists(reportPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(reportPath, "utf8"));
    } catch (_error) {
      return null;
    }
  };


  return {
    buildDumpTruckBedOpenAnalysisFindings,
    buildHseAnalysisFindings,
    buildHseSafetyRulesReport,
    buildLatestAnalysisSummary,
    buildPpeAnalysisFindings,
    buildRedLightViolationAnalysisFindings,
    buildWorkingAtHeightAnalysisFindings,
    enrichSummary,
    getPpeAnalysisDefinition,
    getLatestRunForSource,
    readHseSafetyRulesReport,
    readRunSummary,
    severityToRiskScore,
    splitCommaSeparated,
  };
};

module.exports = {
  createAnalysisSummaryHelpers,
};
