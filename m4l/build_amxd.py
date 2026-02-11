#!/usr/bin/env python3
"""
Build ShadeOSC.amxd from ShadeOSC.maxpat.

The .amxd format wraps a .maxpat JSON patcher with a binary header and footer.
The header identifies the device type (audio effect / MIDI effect / instrument).

This script creates a minimal .amxd audio effect wrapper around the patcher JSON.
"""

import struct
import sys
import os

def build_amxd(maxpat_path: str, output_path: str, device_type: str = "audio") -> None:
    """
    Wrap a .maxpat JSON file in the .amxd binary envelope.

    The .amxd format:
    - 4 bytes: "ampf" magic
    - 4 bytes: type identifier ("aaaa" for audio, "mmmm" for MIDI, "iiii" for instrument)
    - 8 bytes: "metaptch"
    - Variable: the JSON patcher content
    - No footer required for unfrozen devices
    """
    type_map = {
        "audio": b"aaaa",
        "midi": b"mmmm",
        "instrument": b"iiii",
    }

    if device_type not in type_map:
        print(f"Error: device_type must be one of: {list(type_map.keys())}")
        sys.exit(1)

    with open(maxpat_path, "rb") as f:
        patcher_json = f.read()

    # Build the .amxd binary
    header = b"ampf" + type_map[device_type] + b"metaptch"
    amxd_data = header + patcher_json

    with open(output_path, "wb") as f:
        f.write(amxd_data)

    print(f"Built {output_path} ({len(amxd_data)} bytes, type={device_type})")


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    maxpat = os.path.join(script_dir, "ShadeOSC.maxpat")
    amxd = os.path.join(script_dir, "ShadeOSC.amxd")

    if not os.path.exists(maxpat):
        print(f"Error: {maxpat} not found")
        sys.exit(1)

    build_amxd(maxpat, amxd, "audio")
    print(f"\nTo install: drag {amxd} onto an audio track in Ableton Live 12")
