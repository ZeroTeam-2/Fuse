#!/bin/sh
set -e

mc alias set fuse-local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
mc mb --ignore-existing "fuse-local/$S3_BUCKET"

echo "MinIO bucket ready: $S3_BUCKET"
