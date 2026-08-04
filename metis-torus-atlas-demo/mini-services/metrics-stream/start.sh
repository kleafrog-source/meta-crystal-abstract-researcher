#!/bin/bash
# Persistent wrapper for metrics-stream service
cd /home/z/my-project/mini-services/metrics-stream

while true; do
  echo "[$(date)] starting metrics-stream..."
  bun index.ts 2>&1
  EXIT=$?
  echo "[$(date)] metrics-stream exited with $EXIT, restarting in 2s..."
  sleep 2
done
