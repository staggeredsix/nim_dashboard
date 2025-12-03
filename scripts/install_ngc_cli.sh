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

if [[ -z "${NGC_CLI_URL:-}" ]]; then
  arch="$(uname -m)"
  case "$arch" in
    x86_64)
      NGC_CLI_URL="https://ngc.nvidia.com/downloads/ngccli_linux.zip"
      ;;
    aarch64|arm64)
      NGC_CLI_URL="https://api.ngc.nvidia.com/v2/resources/nvidia/ngc-apps/ngc_cli/versions/4.9.17/files/ngccli_arm64.zip"
      ;;
    *)
      echo "[install_ngc_cli] Unsupported architecture '$arch'. Set NGC_CLI_URL to a valid archive for your platform." >&2
      exit 1
      ;;
  esac
fi

NGC_CLI_URL="${NGC_CLI_URL}"
ARCHIVE_PATH="$TMPDIR/ngccli_linux.zip"

echo "[install_ngc_cli] Downloading NGC CLI from $NGC_CLI_URL"
curl -fL "$NGC_CLI_URL" -o "$ARCHIVE_PATH"

unzip -qo "$ARCHIVE_PATH" -d "$TMPDIR"

DOWNLOADED_NGC="$TMPDIR/ngc-cli/ngc"
if [[ ! -x "$DOWNLOADED_NGC" ]]; then
  echo "[install_ngc_cli] Downloaded archive did not contain an executable ngc binary." >&2
  exit 1
fi

if ! "$DOWNLOADED_NGC" --version >/dev/null 2>&1; then
  echo "[install_ngc_cli] Downloaded ngc binary failed to execute. Check your download URL or network access and try again." >&2
  exit 1
fi

install -m 0755 "$DOWNLOADED_NGC" /usr/local/bin/ngc

echo "[install_ngc_cli] Installed ngc to /usr/local/bin/ngc"
