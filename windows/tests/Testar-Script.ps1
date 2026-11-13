# Testes do script no Windows (GitHub Actions). O telemóvel (MTP) não dá para testar aqui.
$ErrorActionPreference = 'Stop'
$falhas = 0
function Check([string]$nome, [bool]$ok, $info = '') { if ($ok) { Write-Host "OK   $nome" } else { Write-Host "FALHA $nome  $info"; $script:falhas++ } }

# 1. O PowerShell consegue ler o script (acentos, sintaxe)
$erros = $null
[void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path "$PSScriptRoot\..\Importar-Inspecoes.ps1"), [ref]$null, [ref]$erros)
Check 'script sem erros de sintaxe' ($erros.Count -eq 0) ($erros | Out-String)
$erros = $null
[void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path "$PSScriptRoot\..\Instalar-Arranque.ps1"), [ref]$null, [ref]$erros)
Check 'instalador sem erros de sintaxe' ($erros.Count -eq 0) ($erros | Out-String)

. "$PSScriptRoot\..\Importar-Inspecoes.ps1" -SoFuncoes
Check 'nome da pasta no telemóvel com acentos' ($PastaNoTelemovel -eq ('Inspe' + [char]0x00E7 + [char]0x00F5 + 'es'))

$tmp = Join-Path $env:TEMP ('teste-insp-' + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null

function New-Foto([string]$caminho, [int]$w, [int]$h, [int]$orientacao = 0) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::Orange); $g.FillRectangle([System.Drawing.Brushes]::Purple, 0, 0, [int]($w / 2), [int]($h / 4)); $g.Dispose()
  if ($orientacao) {
    $p = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject([System.Drawing.Imaging.PropertyItem])
    $p.Id = 0x0112; $p.Type = 3; $p.Len = 2; $p.Value = [byte[]]@($orientacao, 0)
    $bmp.SetPropertyItem($p)
  }
  $dir = Split-Path -Parent $caminho
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir -Force | Out-Null }
  $bmp.Save($caminho, [System.Drawing.Imaging.ImageFormat]::Jpeg); $bmp.Dispose()
}
function Get-Dim([string]$c) { $i = [System.Drawing.Image]::FromFile($c); $r = "$($i.Width)x$($i.Height)"; $i.Dispose(); $r }

# 2. Tamanho como o Image Resizer (Ajustar 2500 x 1875)
Check 'deitada 4000x3000 -> 2500x1875' ((Get-TamanhoAjustado 4000 3000) -join 'x' -eq '2500x1875')
Check 'em pé 3000x4000 -> 1875x2500' ((Get-TamanhoAjustado 3000 4000) -join 'x' -eq '1875x2500')
Check '16:9 4000x2250 -> 2500x1406' ((Get-TamanhoAjustado 4000 2250) -join 'x' -eq '2500x1406')
Check 'pequena 800x600 não aumenta' ((Get-TamanhoAjustado 800 600) -join 'x' -eq '800x600')

# 3. Versão leve a sério (com orientação EXIF)
New-Foto "$tmp\a.jpg" 4000 3000
New-VersaoLeve "$tmp\a.jpg" "$tmp\a-leve.jpg"
Check 'leve 2500x1875' ((Get-Dim "$tmp\a-leve.jpg") -eq '2500x1875') (Get-Dim "$tmp\a-leve.jpg")
New-Foto "$tmp\b.jpg" 4000 3000 6
New-VersaoLeve "$tmp\b.jpg" "$tmp\b-leve.jpg"
Check 'foto rodada pela câmara (EXIF 6) sai em pé 1875x2500' ((Get-Dim "$tmp\b-leve.jpg") -eq '1875x2500') (Get-Dim "$tmp\b-leve.jpg")
Check 'leve é mais pequena que o original' ((Get-Item "$tmp\a-leve.jpg").Length -lt (Get-Item "$tmp\a.jpg").Length)

# 4. Índice dos processos no OneDrive
$root = "$tmp\0. Processos"
New-Item -ItemType Directory "$root\2026\11 Novembro\260098 - Praça de Portugal 7 Odivelas - Ana" -Force | Out-Null
New-Item -ItemType Directory "$root\2026\10 Outubro\260001 - Quinta da Fortaleza - Cliente" -Force | Out-Null
New-Item -ItemType Directory "$root\2025\12 Dezembro\251234" -Force | Out-Null
$ind = Get-IndiceProcessos $root
Check 'encontra 260098 pela pasta "260098 - morada - cliente"' ($ind['260098'] -like '*11 Novembro\260098 - Pra*')
Check 'encontra pasta só com o número' ($ind['251234'] -like '*\251234')
Check 'a pasta do ano não conta como processo' (-not $ind.ContainsKey('2026'))
Check '3 processos' ($ind.Count -eq 3) ($ind.Keys -join ',')

# 5. Não escreve por cima
New-Foto "$tmp\dest\20261112_151003.jpg" 100 100
$len = (Get-Item "$tmp\dest\20261112_151003.jpg").Length
Check 'mesmo nome e tamanho -> já copiada' ($null -eq (Get-DestinoLivre "$tmp\dest" '20261112_151003.jpg' $len))
Check 'mesmo nome, outro tamanho -> _2' ((Get-DestinoLivre "$tmp\dest" '20261112_151003.jpg' 5) -like '*20261112_151003_2.jpg')
Check 'nome livre -> igual' ((Get-DestinoLivre "$tmp\dest" 'x.jpg' 5) -like '*\x.jpg')

# 6. Pasta Light com as mesmas subpastas
$proc = $ind['260098']
New-Foto "$proc\2. Fotos\Espaços comuns\Fachada\20261112_150201.jpg" 4000 3000
New-Foto "$proc\2. Fotos\Fração A\Cozinha\20261112_151003.jpg" 3000 4000
New-Foto "$proc\2. Fotos\Sala\20261112_152410.jpg" 4000 3000
$st = [pscustomobject]@{ Copiadas = 0; Iguais = 0; Leves = 0; Erros = 0 }
Update-PastaLight "$proc\2. Fotos" "$proc\3. Fotos - Light" $st
Check '3 versões leves' ($st.Leves -eq 3 -and $st.Erros -eq 0) ($st | Out-String)
Check 'Light\Espaços comuns\Fachada' (Test-Path "$proc\3. Fotos - Light\Espaços comuns\Fachada\20261112_150201.jpg")
Check 'Light\Fração A\Cozinha (em pé)' ((Get-Dim "$proc\3. Fotos - Light\Fração A\Cozinha\20261112_151003.jpg") -eq '1875x2500')
Check 'Light\Sala' (Test-Path "$proc\3. Fotos - Light\Sala\20261112_152410.jpg")
$st2 = [pscustomobject]@{ Copiadas = 0; Iguais = 0; Leves = 0; Erros = 0 }
Update-PastaLight "$proc\2. Fotos" "$proc\3. Fotos - Light" $st2
Check 'à segunda vez não refaz nada' ($st2.Leves -eq 0)

Remove-Item $tmp -Recurse -Force
if ($falhas) { Write-Host "$falhas FALHA(S)"; exit 1 } else { Write-Host 'TUDO OK' }
