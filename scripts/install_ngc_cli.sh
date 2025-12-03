#!/usr/bin/env bash
set -euo pipefail

# Simple installer for the NVIDIA NGC CLI using architecture-aware downloads.
# The default download URL can be overridden with NGC_CLI_URL if needed.
# You can also override the target install directory with NGC_INSTALL_DIR
# and the CLI version with NGC_CLI_VERSION.

command -v unzip >/dev/null 2>&1 || {
  echo "[install_ngc_cli] unzip is required to extract the NGC CLI archive." >&2
  exit 1
}

TMPDIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

VERSION="${NGC_CLI_VERSION:-4.9.17}"
arch="$(uname -m)"

if [[ -z "${NGC_CLI_URL:-}" ]]; then
  case "$arch" in
    x86_64)
      NGC_CLI_URL="https://api.ngc.nvidia.com/v2/resources/nvidia/ngc-apps/ngc_cli/versions/${VERSION}/files/ngccli_linux.zip"
      ;;
    aarch64|arm64)
      NGC_CLI_URL="https://api.ngc.nvidia.com/v2/resources/nvidia/ngc-apps/ngc_cli/versions/${VERSION}/files/ngccli_arm64.zip"
      ;;
    *)
      echo "[install_ngc_cli] Unsupported architecture '$arch'. Set NGC_CLI_URL to a valid archive for your platform." >&2
      exit 1
      ;;
  esac
fi

NGC_CLI_URL="${NGC_CLI_URL}"
ARCHIVE_PATH="$TMPDIR/ngccli.zip"

INSTALL_DIR="${NGC_INSTALL_DIR:-$HOME/.local/ngc-cli}"
PATH_SNIPPET="export PATH=\"\$PATH:${INSTALL_DIR}\""
PROFILE_FILE="$HOME/.bash_profile"

mkdir -p "$INSTALL_DIR"

echo "[install_ngc_cli] Detected architecture: $arch"
echo "[install_ngc_cli] Downloading NGC CLI version ${VERSION} from $NGC_CLI_URL"
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

rm -rf "$INSTALL_DIR"
mv "$TMPDIR/ngc-cli" "$INSTALL_DIR"
chmod u+x "$INSTALL_DIR/ngc"

if [[ ! -f "$PROFILE_FILE" ]]; then
  touch "$PROFILE_FILE"
fi

if ! grep -F "$PATH_SNIPPET" "$PROFILE_FILE" >/dev/null 2>&1; then
  echo "$PATH_SNIPPET" >> "$PROFILE_FILE"
  echo "[install_ngc_cli] Added PATH update to $PROFILE_FILE"
else
  echo "[install_ngc_cli] PATH update already present in $PROFILE_FILE"
fi

printf "[install_ngc_cli] Installation complete. To use the CLI in current shell, run: \n\n  export PATH=\"\$PATH:%s\"\n\n" "$INSTALL_DIR"
"$INSTALL_DIR/ngc" --version
