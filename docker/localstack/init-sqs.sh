#!/bin/bash
set -e

DLQ_URL=$(awslocal sqs get-queue-url \
  --queue-name scenario-execution-dlq \
  --query 'QueueUrl' \
  --output text 2>/dev/null) || true

if [ -z "$DLQ_URL" ]; then
  awslocal sqs create-queue --queue-name scenario-execution-dlq
  DLQ_URL=$(awslocal sqs get-queue-url \
    --queue-name scenario-execution-dlq \
    --query 'QueueUrl' \
    --output text)
fi

DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

QUEUE_URL=$(awslocal sqs get-queue-url \
  --queue-name scenario-execution \
  --query 'QueueUrl' \
  --output text 2>/dev/null) || true

if [ -z "$QUEUE_URL" ]; then
  cat > /tmp/queue-attributes.json <<EOF
{
  "VisibilityTimeout": "7200",
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"${DLQ_ARN}\",\"maxReceiveCount\":\"3\"}"
}
EOF

  awslocal sqs create-queue \
    --queue-name scenario-execution \
    --attributes file:///tmp/queue-attributes.json
fi

echo "SQS queues ready: scenario-execution (VT=7200, DLR maxReceiveCount=3), scenario-execution-dlq"
