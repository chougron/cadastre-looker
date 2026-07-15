import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(repoRoot, "public");

// Build the Lambda bundle before wiring up resources, so `pulumi up` alone is enough.
execSync("npm run build:lambda", { cwd: repoRoot, stdio: "inherit" });

const dataFiles = fs
  .readdirSync(repoRoot)
  .filter((name) => /^cadastre-.+-parcelles\.json$/.test(name));

if (dataFiles.length === 0) {
  throw new Error("No cadastre-*-parcelles.json data files found in the repo root.");
}

// --- Lambda: API ---

const lambdaRole = new aws.iam.Role("api-lambda-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
      },
    ],
  }),
});

new aws.iam.RolePolicyAttachment("api-lambda-logs", {
  role: lambdaRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

const lambdaArchive = new pulumi.asset.AssetArchive({
  "dist-lambda/lambda.cjs": new pulumi.asset.FileAsset(
    path.join(repoRoot, "dist-lambda", "lambda.cjs"),
  ),
  ...Object.fromEntries(
    dataFiles.map((name) => [name, new pulumi.asset.FileAsset(path.join(repoRoot, name))]),
  ),
});

const apiLambda = new aws.lambda.Function("api", {
  runtime: "nodejs20.x",
  handler: "dist-lambda/lambda.handler",
  role: lambdaRole.arn,
  code: lambdaArchive,
  memorySize: 256,
  timeout: 10,
  environment: {
    variables: { CADASTRE_DATA_DIR: "/var/task" },
  },
});

const httpApi = new aws.apigatewayv2.Api("api-gateway", {
  protocolType: "HTTP",
  corsConfiguration: {
    allowOrigins: ["*"],
    allowMethods: ["GET"],
    allowHeaders: ["*"],
    maxAge: 86400,
  },
});

const lambdaIntegration = new aws.apigatewayv2.Integration("api-integration", {
  apiId: httpApi.id,
  integrationType: "AWS_PROXY",
  integrationUri: apiLambda.invokeArn,
  payloadFormatVersion: "2.0",
});

new aws.apigatewayv2.Route("api-route", {
  apiId: httpApi.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${lambdaIntegration.id}`,
});

new aws.apigatewayv2.Stage("api-stage", {
  apiId: httpApi.id,
  name: "$default",
  autoDeploy: true,
});

new aws.lambda.Permission("api-gateway-invoke", {
  action: "lambda:InvokeFunction",
  function: apiLambda.name,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${httpApi.executionArn}/*/*`,
});

// --- S3: static frontend ---

const siteBucket = new aws.s3.Bucket("frontend", {
  website: { indexDocument: "index.html" },
});

const publicAccessBlock = new aws.s3.BucketPublicAccessBlock("frontend-public-access", {
  bucket: siteBucket.id,
  blockPublicAcls: false,
  blockPublicPolicy: false,
  ignorePublicAcls: false,
  restrictPublicBuckets: false,
});

new aws.s3.BucketPolicy(
  "frontend-policy",
  {
    bucket: siteBucket.id,
    policy: siteBucket.arn.apply((arn) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `${arn}/*`,
          },
        ],
      }),
    ),
  },
  { dependsOn: [publicAccessBlock] },
);

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
};

for (const fileName of fs.readdirSync(publicDir)) {
  if (fileName === "config.js") continue; // managed separately below
  const ext = path.extname(fileName);
  new aws.s3.BucketObject(`frontend-${fileName}`, {
    bucket: siteBucket.id,
    key: fileName,
    source: new pulumi.asset.FileAsset(path.join(publicDir, fileName)),
    contentType: contentTypes[ext] ?? "application/octet-stream",
  });
}

// Overrides the local-dev config.js (same-origin) with the deployed API Gateway endpoint,
// so the S3-hosted frontend knows where to send API requests.
new aws.s3.BucketObject("frontend-config-js", {
  bucket: siteBucket.id,
  key: "config.js",
  content: httpApi.apiEndpoint.apply(
    (url) => `window.API_BASE_URL = ${JSON.stringify(url.replace(/\/$/, ""))};\n`,
  ),
  contentType: "application/javascript",
});

export const websiteUrl = pulumi.interpolate`http://${siteBucket.websiteEndpoint}`;
export const apiUrl = httpApi.apiEndpoint;
