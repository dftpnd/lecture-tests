#!/usr/bin/env bash
# Grant the current user passwordless sudo (one-time, asks for password once).
# Lets the agent run sudo commands (ctr image import, etc.) without a TTY prompt.
#
# Run:   bash scripts/enable-nopasswd-sudo.sh
# Undo:  sudo rm /etc/sudoers.d/$USER-nopasswd
set -euo pipefail

FILE="/etc/sudoers.d/${USER}-nopasswd"

echo "${USER} ALL=(ALL) NOPASSWD: ALL" | sudo tee "$FILE" >/dev/null
sudo chmod 440 "$FILE"

# Validate the sudoers file so a typo can't lock you out of sudo.
sudo visudo -cf "$FILE"

echo "OK: passwordless sudo enabled for ${USER} (${FILE})"
