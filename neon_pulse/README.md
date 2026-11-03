# Neon Pulse

Neon Pulse is a dependency-free local audio player for desktop and Android. It plays MP3, WAV, and device-supported FLAC files with three audio-reactive Canvas visualizers. The playlist exists only in the current page; audio files are read locally and are not uploaded or saved by the app.

## Run

Open `index.html` in a modern browser, or serve the repository with any static HTTP server and visit `/neon_pulse/`. There is no build step or package installation.

## Controls

- Add or drag multiple audio files to create a playlist.
- Switch between Bars, Orbit, and Wave visualizers.
- Use Space to play/pause, Left/Right to seek, and M to mute.
- Use the transport controls to play, skip tracks, shuffle, repeat, seek, adjust volume, or mute. On supported devices, lock-screen media controls and a screen wake lock are also enabled during playback.
- Use `neon_pulse.apk` for the packaged Android build when available.

FLAC playback depends on the browser or device codec. Unsupported files show a playback error.
