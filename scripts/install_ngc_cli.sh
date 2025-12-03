#!/usr/bin/env bash
set -euo pipefail

# Simple installer for the NVIDIA NGC CLI.
# The default download URL can be overridden with NGC_CLI_URL if needed.

command -v unzip >/dev/null 2>&1 || {
  echo "[install_ngc_cli] unzip is required to extract the NGC CLI archive." >&2
  exit 1
}

TMPDIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

NGC_CLI_URL="${NGC_CLI_URL:-https://ngc.nvidia.com/downloads/ngccli_linux.zip}"
ARCHIVE_PATH="$TMPDIR/ngccli_linux.zip"

curl -fL "$NGC_CLI_URL" -o "$ARCHIVE_PATH"

unzip -qo "$ARCHIVE_PATH" -d "$TMPDIR"
install -m 0755 "$TMPDIR/ngc-cli/ngc" /usr/local/bin/ngc

echo "[install_ngc_cli] Installed ngc to /usr/local/bin/ngc"
