# ShadeOSC - Max for Live Audio Amplitude to OSC

A Max for Live Audio Effect that analyzes audio amplitude and sends it as OSC messages to shade-conductor for real-time visual reactivity.

## What it does

- Placed on an Ableton audio track as an Audio Effect
- Measures stereo peak amplitude (L+R averaged), reports every 50ms
- Sends amplitude as a float (0.0-1.0) via OSC to a configurable host:port
- Audio passes through unmodified (transparent effect)

## OSC Message Format

```
/shade/ext/{channel} {amplitude_float}
```

Example: `/shade/ext/0 0.73` means channel 0 is at 73% amplitude.

## Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Channel | 0-3 | 0 | OSC address index (`/shade/ext/0` through `/shade/ext/3`) |
| Port | 1024-65535 | 9000 | UDP port for OSC messages |
| Active | on/off | on | Enable/disable OSC sending |

## Installation

### Option A: Use the pre-built .amxd (recommended)

1. Drag `ShadeOSC.amxd` onto an audio track in Ableton Live 12
2. Set the Channel number for that track
3. Done

### Option B: Build from source

```bash
python3 build_amxd.py
```

This wraps `ShadeOSC.maxpat` with the .amxd binary header.

### Option C: Load the .maxpat manually

1. In Ableton, create a new Audio Effect rack or add a Max Audio Effect to a track
2. Click the wrench icon to open Max editor
3. Open `ShadeOSC.maxpat` from File > Open
4. Select All, Copy, then paste into the M4L device
5. Save as .amxd

## Track Routing for EIIRP

Place one instance of ShadeOSC on each of these group/bus tracks:

| Ableton Track(s) | Content | ShadeOSC Channel | OSC Address |
|-------------------|---------|-------------------|-------------|
| 8-12 (Drums bus) | Kick + Snare + Tom + OH | 0 | `/shade/ext/0` |
| 3 (Moog) | Moog Sub 25 | 1 | `/shade/ext/1` |
| 4 (Guitar) | Guitar | 2 | `/shade/ext/2` |
| 2 (Vocal) | Vocal | 3 | `/shade/ext/3` |

## Signal Flow

```
[plugin~ 2 2]          Audio input (stereo)
    |         \
    |          |
    v          v
[peakamp~ L] [peakamp~ R]   Peak amplitude every 50ms
    |          |
    v          v
  [expr ($f1+$f2)*0.5]      Average L+R
    |
    v
  [clip 0. 1.]               Clamp range
    |
    v
  [gate]  <-- [Active toggle]
    |
    v
  [prepend /shade/ext/N]     Format OSC message
    |
    v
  [udpsend localhost 9000]   Send via UDP

Audio passes through directly:
[plugin~ 2 2] --> [plugout~ 2 2]
```

## Files

- `ShadeOSC.amxd` - Ready-to-use Max for Live Audio Effect device
- `ShadeOSC.maxpat` - Source patcher (editable JSON)
- `build_amxd.py` - Script to rebuild .amxd from .maxpat
- `README.md` - This file

## Troubleshooting

**No OSC messages received:**
- Check that the Active toggle is on (top-right of device)
- Verify shade-conductor is listening on the configured port (default: 9000)
- Confirm audio is playing through the track (check the meters on the device)

**Device won't load:**
- Rebuild: `python3 build_amxd.py`
- Or use Option C (manual load) from the Installation section

**IP address resets on reload:**
- The device sends to `localhost` by default. This is hardcoded in the udpsend object.
  To change it, open the device in Max editor and modify the udpsend arguments.
