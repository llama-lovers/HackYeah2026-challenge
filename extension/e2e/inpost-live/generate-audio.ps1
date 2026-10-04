$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$outputDirectory = Join-Path $repoRoot 'test-artifacts\inpost\audio'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$cases = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'cases.json') -Raw -Encoding utf8 | ConvertFrom-Json
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'pl-PL' } | Select-Object -First 1
    if (-not $voice) { throw 'Install a Polish Windows speech voice before generating these fixtures.' }
    $synth.SelectVoice($voice.VoiceInfo.Name)
    $synth.Rate = -1
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($case in $cases) {
        $path = Join-Path $outputDirectory ($case.id + '.wav')
        $synth.SetOutputToWaveFile($path, $format)
        $prompt = [System.Speech.Synthesis.PromptBuilder]::new([System.Globalization.CultureInfo]::GetCultureInfo('pl-PL'))
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(700))
        if ($case.text) { $prompt.AppendText($case.text) } else { $prompt.AppendBreak([TimeSpan]::FromSeconds(2)) }
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(700))
        $synth.Speak($prompt)
        $synth.SetOutputToNull()
        Write-Output $path
    }
    Write-Output ('Voice: ' + $voice.VoiceInfo.Name)
} finally { $synth.Dispose() }
