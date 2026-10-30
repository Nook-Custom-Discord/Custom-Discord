// Eigener Ogg-Opus-Decoder für die iPhone-App (iOS kann .ogg-Sounds nicht selbst öffnen).
// Wird als renderer/opus.js gebaut und nur bei Bedarf nachgeladen.
import { OggOpusDecoder } from 'ogg-opus-decoder';

window.NookOpus = OggOpusDecoder;
