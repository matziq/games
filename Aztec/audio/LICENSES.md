# Aztec audio sources and adaptation

The game uses two bundled licensed excerpts, mixed with original procedural
Foley. Neither excerpt is audio from the commercial Aztec game. All sound bytes
ship locally in `audio-samples.js`; neither the source game nor the standalone
HTML fetches audio from a remote host.

## Pistol: shot.wav

- **Creator:** Vincent Sevedge; published by **Tabasco** as *Gunshot sounds*.
- **Source page:** <https://opengameart.org/content/gunshot-sounds>
- **Download:** <https://opengameart.org/sites/default/files/sounds.zip>
- **Original file:** `sounds/cz.wav`, a CZ-52 pistol recorded during target shooting.
- **License used here:** [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
- **Original notice from `sounds/creativecommons.txt`:**

  > Copyright (c) 2009 Vincent Sevedge
  >
  > Audio and Visual content is covered under the Creative Commons Attribution 3.0 Unported License
  > http://creativecommons.org/licenses/by/3.0/

The web listing says CC0, but the downloaded archive specifies CC BY 3.0.
This distribution conservatively follows the archive's attribution requirements;
it does not relabel the recording as public domain. Attribution is retained here,
in the game help, and in the embedded sample script, including offline releases.
No creator endorsement is implied.

**Changes:** excerpt 2.814–3.534 seconds; mono downmix; 45 Hz high-pass / 9.5 kHz
low-pass; 2 ms attack and 120 ms release fades; DC removal; peak normalized to
0.8; converted to 22,050 Hz, 16-bit PCM. Playback adds a quieter original crack,
body, and short reflected tail. The author cautions that the source recorder
handled firearm peaks imperfectly; amplitude checks did not find full-scale
clipping in this excerpt, but that is not proof of distortion-free recording.

## Dynamite: blast.wav

- **Creator:** **Listener**, *Dynamite sound effect*.
- **Source page:** <https://opengameart.org/content/dynamite-sound-effect>
- **Download:** <https://opengameart.org/sites/default/files/Dynamite%20with%20sensor.wav>
- **License:** [CC0 1.0 Public Domain Dedication](https://creativecommons.org/publicdomain/zero/1.0/).
- The source page explicitly states that the sounds are public domain and usable
  in personal and commercial games.

**Changes:** keep 1.622–4.380 seconds, removing the electronic charge-sensor
preamble; mono downmix (also removes the original's asymmetric stereo tail);
28 Hz high-pass / 9.5 kHz low-pass; 2 ms attack and 200 ms release fades; DC
removal; peak normalized to 0.8; converted to 22,050 Hz, 16-bit PCM. Playback
adds original low-frequency rumble and debris. This is a designed explosion
effect, **not a verified field recording of real dynamite**.

## Original procedural effects

`audio.js` creates the fuse crackle, snake hiss, bat calls, machete swish/impact,
damage breath/thud, jump shuffle, chest/rubble handling, inventory clinks,
water/bubbles, rock release/impact, ceiling scrape, and brief end-state cues.
They use shaped broadband/filtered noise, changing envelopes, inharmonic
resonances and swept/modulated calls, rather than the old square-wave beeps.
Bat calls are deliberately audible designed squeaks, not species-accurate
ultrasonic recordings. Snake and bat cues are **synthesized**, not recordings.

CC0 Freesound animal recordings were considered, but their public media
endpoints returned HTTP 403. None of their audio is included.

## Repacking and checks

The maintained WAV files are the processed source of truth. Run
`node pack-audio.cjs` to regenerate the embedded pack and
`node pack-audio.cjs --check` to verify it. Node and browser tests check
non-silence, finite samples, peak bounds, distinct envelopes, event provenance,
voice limits and lifecycle. Automated waveform tests do not establish subjective
realism or substitute for human listening.
