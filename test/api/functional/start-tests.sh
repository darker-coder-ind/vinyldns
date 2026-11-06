#!/usr/bin/env bash
set -euo pipefail

API_TIMEOUT=${API_TIMEOUT:-120s}
TEST_TIMEOUT=${TEST_TIMEOUT:-10m}

report_failure() {
  local status=$?
  if [[ ${status} -ne 0 ]]; then
    echo "Functional runner exited with status ${status} (124 indicates a timeout)."
    tail -n 100 /opt/vinyldns/vinyldns.log
  fi
}
trap report_failure EXIT

echo "Starting isolated functional-test services (timeout: ${API_TIMEOUT})..."
timeout --kill-after=10s "${API_TIMEOUT}" /initialize.sh bind localstack mysql vinyldns-api

echo "Waiting for API HTTP health (timeout: ${API_TIMEOUT})..."
timeout --kill-after=10s "${API_TIMEOUT}" bash -c '
  until curl --fail --silent --max-time 2 http://127.0.0.1:9000/health; do
    sleep 2
  done
'
echo

if [[ ${1:-} == "--" ]]; then
  shift
fi

echo "Running functional tests (timeout: ${TEST_TIMEOUT})..."
timeout --kill-after=10s "${TEST_TIMEOUT}" /functional_test/run.sh "$@"
