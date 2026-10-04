$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$taskRepo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$audioDir = Join-Path $taskRepo 'test-artifacts\google-live\audio'
New-Item -ItemType Directory -Path $audioDir -Force | Out-Null
$cases = @(
    @{ id = 'natural-search'; text = 'Chcę wyszukać czerwone koty.' },
    @{ id = 'field-search'; text = 'Wpisz czerwone koty w pole wyszukiwania i wyszukaj.' }
)
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'pl-PL' } | Select-Object -First 1
    if (-not $voice) { throw 'Polish speech voice is required.' }
    $synth.SelectVoice($voice.VoiceInfo.Name)
    $synth.Rate = -1
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($case in $cases) {
        $path = Join-Path $audioDir ($case.id + '.wav')
        $synth.SetOutputToWaveFile($path, $format)
        $prompt = [System.Speech.Synthesis.PromptBuilder]::new([System.Globalization.CultureInfo]::GetCultureInfo('pl-PL'))
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(700))
        $prompt.AppendText($case.text)
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(700))
        $synth.Speak($prompt)
        $synth.SetOutputToNull()
        Write-Output $path
    }
} finally { $synth.Dispose() }
