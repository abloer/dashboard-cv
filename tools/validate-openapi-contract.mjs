import fs from "node:fs";
import path from "node:path";

const contractPath = path.resolve("docs/openapi.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

const requiredPaths = [
  "/auth/session",
  "/media-sources",
  "/media-sources/{id}",
  "/media-sources/{id}/status",
  "/media-sources/{id}/monitoring",
  "/module-configs/{moduleKey}",
  "/models/overview",
  "/models/datasets",
  "/models/datasets/{id}",
  "/models/training-jobs",
  "/models/training-jobs/{id}",
  "/models/versions",
  "/models/versions/{id}",
  "/models/evaluations",
  "/models/evaluations/{id}",
  "/models/benchmarks",
  "/models/benchmarks/{id}",
  "/analysis/{moduleKey}",
  "/analysis/{moduleKey}/jobs/{id}",
  "/analysis-output/{artifactPath}",
];

const requiredSecuritySchemes = ["cookieAuth", "bearerAuth"];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(contract.openapi?.startsWith("3."), "OpenAPI version must be 3.x.");
assert(contract.info?.title, "OpenAPI info.title is required.");
assert(contract.paths && typeof contract.paths === "object", "OpenAPI paths object is required.");

for (const pathName of requiredPaths) {
  assert(contract.paths[pathName], `Missing required API path: ${pathName}`);
}

for (const schemeName of requiredSecuritySchemes) {
  assert(
    contract.components?.securitySchemes?.[schemeName],
    `Missing security scheme: ${schemeName}`
  );
}

for (const [pathName, pathItem] of Object.entries(contract.paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) {
      continue;
    }

    const operationName = `${method.toUpperCase()} ${pathName}`;
    assert(operation.summary, `${operationName} must have a summary.`);
    assert(operation.responses && Object.keys(operation.responses).length > 0, `${operationName} must declare responses.`);
    assert(operation["x-required-roles"], `${operationName} must document x-required-roles.`);
  }
}

console.log(`OpenAPI contract validation passed for ${requiredPaths.length} required paths.`);
