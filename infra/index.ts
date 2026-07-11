// infra/index.ts
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as command from "@pulumi/command";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");

const project = gcpConfig.require("project");
const zone = gcpConfig.get("zone") || "us-central1-a";

// Firewall rule for HTTP/HTTPS
const firewall = new gcp.compute.Firewall("mytasco-firewall", {
  network: "default",
  allows: [
    { protocol: "tcp", ports: ["80", "443", "8790"] },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["mytasco"],
});

// Startup script to install Docker
const startupScript = `#!/bin/bash
apt-get update
apt-get install -y docker.io docker-compose
systemctl enable docker
systemctl start docker
usermod -aG docker $USER
`;

// VM instance
const instance = new gcp.compute.Instance("mytasco-vm", {
  machineType: "e2-medium",
  zone,
  tags: ["mytasco"],
  bootDisk: {
    initializeParams: {
      image: "ubuntu-os-cloud/ubuntu-2204-lts",
      size: 50,
    },
  },
  networkInterfaces: [{
    network: "default",
    accessConfigs: [{}], // Ephemeral public IP
  }],
  metadataStartupScript: startupScript,
  serviceAccount: {
    scopes: ["cloud-platform"],
  },
});

// Storage bucket for static assets
const bucket = new gcp.storage.Bucket("mytasco-static", {
  location: "US",
  uniformBucketLevelAccess: true,
  website: {
    mainPageSuffix: "index.html",
    notFoundPage: "index.html",
  },
});

// Make bucket public
const bucketIam = new gcp.storage.BucketIAMBinding("mytasco-static-public", {
  bucket: bucket.name,
  role: "roles/storage.objectViewer",
  members: ["allUsers"],
});

export const vmIp = instance.networkInterfaces.apply(
  (nis) => nis[0]?.accessConfigs?.[0]?.natIp
);
export const vmName = instance.name;
export const staticBucketUrl = pulumi.interpolate`https://storage.googleapis.com/${bucket.name}`;
