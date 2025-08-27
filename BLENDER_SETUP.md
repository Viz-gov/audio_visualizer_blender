# Blender Automation Setup

This project includes automated Blender video generation that creates reactive background videos from your audio features.

## Prerequisites

1. **Install Blender 3.x or later** from [blender.org](https://www.blender.org/download/)
2. **Ensure ffmpeg is available** (already included via ffmpeg-static)

## Configuration

### Windows
The default Blender path is: `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`

If your Blender is installed elsewhere, set the environment variable:
```bash
set BLENDER_PATH="C:\Path\To\Your\Blender.exe"
```

### macOS
```bash
export BLENDER_PATH="/Applications/Blender.app/Contents/MacOS/Blender"
```

### Linux
```bash
export BLENDER_PATH="/usr/bin/blender"
```

## How It Works

1. **Upload MP3** → Audio is normalized to WAV and features are extracted
2. **Generate Guide & Mask** → Waveform visualization videos are created
3. **Click "Run Blender Automation"** → This will:
   - Generate a reactive background video (`bg_blender.mp4`) using Blender
   - Composite the waveform with the background (`composited.mp4`)
   - Mux the audio back in (`final.mp4`)

## Blender Script Details

The automation:
- Uses EEVEE renderer for fast rendering
- Creates animated noise patterns that react to your audio's `env_peak` values
- Generates a 1080p/30fps MP4 with neon blue aesthetic
- Keyframes the emission strength based on audio intensity

## Troubleshooting

### Blender Not Found
- Verify Blender is installed and the path is correct
- Check that the `BLENDER_PATH` environment variable is set
- Ensure Blender executable has proper permissions

### Rendering Issues
- Blender rendering can take several minutes for longer audio files
- Check the browser console for detailed error messages
- Verify that `features.json` exists and contains valid data

### Performance
- For faster rendering, consider lowering resolution in the UI
- Blender rendering is CPU-intensive; close other applications if needed

## Manual Execution

If you prefer to run the Blender script manually:

1. Navigate to your guidepack directory
2. Run: `blender -b -P blender_script.py -- --dir "/path/to/guidepack" --style neon --fps 30 --width 1920 --height 1080`

## Output Files

- `bg_blender.mp4` - Animated background (no audio)
- `composited.mp4` - Waveform + background composite (no audio)  
- `final.mp4` - Complete video with audio synchronized
