// Sprachbefehl „Clip das“ (nur Windows): nutzt die eingebaute Windows-Spracherkennung (System.Speech).
// Läuft komplett offline, erkennt nur die festen Sätze unten und meldet sich mit einer Zeile pro Treffer.
const { spawn } = require('child_process');

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Speech
  $recs = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  if ($recs.Count -eq 0) { Write-Output 'ERR none'; exit }
  $info = ($recs | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq 'de' } | Select-Object -First 1)
  if (-not $info) { $info = ($recs | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq 'en' } | Select-Object -First 1) }
  if (-not $info) { $info = $recs[0] }
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  if ($info.Culture.TwoLetterISOLanguageName -eq 'de') {
    $phrases = @('Nook clip das', 'Nook clip', 'clip das', 'clip das mal', 'Nook speichern', 'Nook Clip speichern')
  } else {
    $phrases = @('Nook clip that', 'Nook clip it', 'clip that', 'clip it', 'Nook save clip')
  }
  $choices = New-Object System.Speech.Recognition.Choices
  $choices.Add([string[]]$phrases)
  $gb = New-Object System.Speech.Recognition.GrammarBuilder
  $gb.Culture = $info.Culture
  $gb.Append($choices)
  $engine.LoadGrammar((New-Object System.Speech.Recognition.Grammar($gb)))
  # Rest-Grammatik: alles andere Gesagte landet hier statt fälschlich beim Befehl
  try { $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)) } catch {}
  $engine.SetInputToDefaultAudioDevice()
  $min = [double]$env:NOOK_CLIP_CONFIDENCE
  if (-not $min) { $min = 0.6 }
  Write-Output ('READY ' + $info.Culture.Name)
  while ($true) {
    $r = $engine.Recognize([TimeSpan]::FromSeconds(10))
    if ($r -and $r.Grammar -and $r.Grammar.GetType().Name -eq 'Grammar' -and $r.Confidence -ge $min) {
      Write-Output ('CLIP ' + $r.Confidence.ToString([Globalization.CultureInfo]::InvariantCulture) + ' ' + $r.Text)
    }
  }
} catch {
  Write-Output ('ERR ' + $_.Exception.Message)
}
`;

class ClipVoice {
  constructor({ onClip, onStatus }) {
    this.onClip = onClip;
    this.onStatus = onStatus;
    this.proc = null;
    this.wanted = false;
    this.status = { state: 'off' };
    this.retry = null;
  }
  get supported() {
    return process.platform === 'win32';
  }
  set(on) {
    this.wanted = !!on && this.supported;
    if (this.wanted) this.start();
    else this.stop();
  }
  setStatus(s) {
    this.status = s;
    this.onStatus(s);
  }
  start() {
    if (this.proc || !this.wanted) return;
    clearTimeout(this.retry);
    this.setStatus({ state: 'starting' });
    // als -EncodedCommand (UTF-16LE, Base64): mehrzeilige Blöcke über stdin würde PowerShell zeilenweise ausführen
    const enc = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const p = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true });
    this.proc = p;
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('READY')) this.setStatus({ state: 'on', lang: line.slice(6) });
        else if (line.startsWith('CLIP')) this.onClip(line.slice(5));
        else if (line.startsWith('ERR')) this.setStatus({ state: 'error', error: line.slice(4) === 'none' ? 'Keine Windows-Spracherkennung installiert' : line.slice(4) });
      }
    });
    p.on('exit', () => {
      if (this.proc !== p) return;
      this.proc = null;
      if (this.status.state !== 'error') this.setStatus({ state: 'off' });
      // unerwartet beendet: in 30 s neu versuchen (nicht bei echtem Fehler, z. B. fehlender Spracherkennung)
      if (this.wanted && this.status.state !== 'error') this.retry = setTimeout(() => this.start(), 30000);
    });
    p.on('error', (e) => this.setStatus({ state: 'error', error: e.message }));
  }
  stop() {
    clearTimeout(this.retry);
    const p = this.proc;
    this.proc = null;
    p?.kill();
    this.setStatus({ state: 'off' });
  }
}

module.exports = { ClipVoice };
