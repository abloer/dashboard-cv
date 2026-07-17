const { z } = require("zod");

const noHelmetPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  modelVersionId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1).optional(),
  modelPath: z.string().trim().min(1).optional(),
  roiConfigPath: z.string().trim().min(1).optional(),
  roiId: z.string().trim().min(1).optional(),
  roiNormalized: z.boolean().optional(),
  roiPolygon: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(3)
    .optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  topRatio: z.number().min(0).max(1).optional(),
  helmetOverlapThreshold: z.number().min(0).max(1).optional(),
  violationOnFrames: z.number().int().positive().optional(),
  cleanOffFrames: z.number().int().positive().optional(),
  frameStep: z.number().int().positive().optional(),
  imageSize: z.number().int().positive().optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  helmetLabels: z.array(z.string().trim().min(1)).optional(),
  violationLabels: z.array(z.string().trim().min(1)).optional(),
});

const noSafetyVestPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  modelVersionId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1).optional(),
  modelPath: z.string().trim().min(1).optional(),
  roiConfigPath: z.string().trim().min(1).optional(),
  roiId: z.string().trim().min(1).optional(),
  roiNormalized: z.boolean().optional(),
  roiPolygon: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(3)
    .optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  violationOnFrames: z.number().int().positive().optional(),
  cleanOffFrames: z.number().int().positive().optional(),
  frameStep: z.number().int().positive().optional(),
  imageSize: z.number().int().positive().optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  vestLabels: z.array(z.string().trim().min(1)).optional(),
  violationLabels: z.array(z.string().trim().min(1)).optional(),
});

const noLifeVestPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  modelVersionId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1).optional(),
  modelPath: z.string().trim().min(1).optional(),
  roiConfigPath: z.string().trim().min(1).optional(),
  roiId: z.string().trim().min(1).optional(),
  roiNormalized: z.boolean().optional(),
  roiPolygon: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(3)
    .optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  violationOnFrames: z.number().int().positive().optional(),
  cleanOffFrames: z.number().int().positive().optional(),
  frameStep: z.number().int().positive().optional(),
  imageSize: z.number().int().positive().optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  vestLabels: z.array(z.string().trim().min(1)).optional(),
  violationLabels: z.array(z.string().trim().min(1)).optional(),
});

const workingAtHeightPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  modelVersionId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1).optional(),
  modelPath: z.string().trim().min(1).optional(),
  zoneConfigPath: z.string().trim().min(1).optional(),
  zoneId: z.string().trim().min(1).optional(),
  zoneNormalized: z.boolean().optional(),
  zonePolygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  frameStep: z.number().int().min(1).optional(),
  imageSize: z.number().int().min(64).optional(),
  personLabels: z.array(z.string().trim().min(1)).optional(),
  minimumPresenceSeconds: z.number().min(0).optional(),
});

const redLightViolationPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  modelVersionId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1).optional(),
  vehicleModelPath: z.string().trim().min(1).optional(),
  trafficLightModelPath: z.string().trim().min(1).optional(),
  stopLineConfigPath: z.string().trim().min(1).optional(),
  intersectionId: z.string().trim().min(1).optional(),
  stopLineNormalized: z.boolean().optional(),
  stopLinePolygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  frameStep: z.number().int().min(1).optional(),
  imageSize: z.number().int().min(64).optional(),
  vehicleLabels: z.array(z.string().trim().min(1)).optional(),
  redLightLabels: z.array(z.string().trim().min(1)).optional(),
  greenLightLabels: z.array(z.string().trim().min(1)).optional(),
  crossingWindowSeconds: z.number().min(0).optional(),
});

const dumpTruckBedOpenPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1).optional(),
  modelVersionId: z.string().trim().min(1).optional(),
  videoPath: z.string().trim().min(1).optional(),
  modelPath: z.string().trim().min(1).optional(),
  roiConfigPath: z.string().trim().min(1).optional(),
  roiId: z.string().trim().min(1).optional(),
  roiNormalized: z.boolean().optional(),
  roiPolygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  iouThreshold: z.number().min(0).max(1).optional(),
  frameStep: z.number().int().min(1).optional(),
  imageSize: z.number().int().min(64).optional(),
  truckLabels: z.array(z.string().trim().min(1)).optional(),
  bedOpenLabels: z.array(z.string().trim().min(1)).optional(),
  bedClosedLabels: z.array(z.string().trim().min(1)).optional(),
  movementThreshold: z.number().min(0).optional(),
  minimumMovingSeconds: z.number().min(0).optional(),
});

const hseSafetyRulesPayloadSchema = z.object({
  mediaSourceId: z.string().trim().min(1),
});

const ppeAnalysisConfigKeyByType = {
  no_helmet: "no-helmet",
  no_safety_vest: "no-safety-vest",
  no_life_vest: "no-life-vest",
};

module.exports = {
  dumpTruckBedOpenPayloadSchema,
  hseSafetyRulesPayloadSchema,
  noHelmetPayloadSchema,
  noLifeVestPayloadSchema,
  noSafetyVestPayloadSchema,
  ppeAnalysisConfigKeyByType,
  redLightViolationPayloadSchema,
  workingAtHeightPayloadSchema,
};
