#!/usr/bin/env bash
# Deploy the stack, the Lambda code and the static site (Amplify manual deployment).
# Prerequisites: AWS credentials, AWS CLI v2, Node.js 20+, zip, curl.
# Usage: AWS_REGION=eu-central-1 ./infra/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-eu-central-1}"
STACK="${STACK:-trace-portfolio}"
BRANCH="${BRANCH:-main}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

aws sts get-caller-identity >/dev/null

status="$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)"
if [ "$status" = "ROLLBACK_COMPLETE" ]; then
  aws cloudformation delete-stack --stack-name "$STACK"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK"
fi

aws cloudformation deploy --stack-name "$STACK" --template-file infra/template.yaml \
  --parameter-overrides BranchName="$BRANCH" --no-fail-on-empty-changeset

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
APP_ID="$(output AmplifyAppId)"
DISTRIBUTION="$(output DistributionId)"
FUNCTION="$(output FunctionName)"
URL="$(output SiteUrl)"

# Lambda code
rm -rf infra/build && mkdir -p infra/build
(cd api && zip -q ../infra/build/trace.zip tracer.py)
aws lambda update-function-code --function-name "$FUNCTION" --zip-file fileb://infra/build/trace.zip >/dev/null
aws lambda wait function-updated --function-name "$FUNCTION"

# Site: build, then upload the zip to Amplify Hosting
(cd web && npm ci --silent && npm run build)
(cd web/dist && zip -qr ../../infra/build/site.zip .)
deployment="$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH")"
job_id="$(echo "$deployment" | python3 -c 'import sys, json; print(json.load(sys.stdin)["jobId"])')"
zip_url="$(echo "$deployment" | python3 -c 'import sys, json; print(json.load(sys.stdin)["zipUploadUrl"])')"
curl -sS --fail -T infra/build/site.zip "$zip_url" >/dev/null
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$job_id" >/dev/null

for _ in $(seq 1 30); do
  state="$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$job_id" --query 'job.summary.status' --output text)"
  [ "$state" = "SUCCEED" ] && break
  [ "$state" = "FAILED" ] && { echo "Amplify deployment failed"; exit 1; }
  sleep 5
done
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths '/*' >/dev/null
echo "Deployed: $URL"
