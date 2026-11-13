<#
  Importar-Inspecoes.ps1  —  Livehouse
  Liga o telemóvel ao PC (cabo USB, modo "Transferência de ficheiros") e este script:
    1. encontra no telemóvel a pasta Documents\Inspeções\<n.º do processo>\2. Fotos
    2. encontra no OneDrive a pasta do processo (0. Processos\<ano>\<mês>\<n.º> - morada - cliente)
    3. copia as fotos novas para "2. Fotos", com as mesmas subpastas (Espaços comuns\Fachada, Fração A\Cozinha...)
    4. faz a versão leve em "3. Fotos - Light" (como o Image Resizer: Ajustar a 2500 x 1875, qualidade 90)

  Uso:
    Importar-Inspecoes.ps1              importa agora (duplo clique em "Importar Inspeções.bat")
    Importar-Inspecoes.ps1 -Vigiar      fica à espera do telemóvel e importa sempre que é ligado
    Importar-Inspecoes.ps1 -Configurar  escolher a pasta "0. Processos" do OneDrive
#>
param(
  [switch]$Vigiar,
  [switch]$Configurar,
  [switch]$SoFuncoes   # só carrega as funções (para testes)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# ---------------- Definições ----------------
$PastaNoTelemovel = 'Inspeções'          # dentro de Documents (ou Pictures) no telemóvel
$PastaFotos       = '2. Fotos'
$PastaLight       = '3. Fotos - Light'
$LadoMaior        = 2500                 # Image Resizer: Personalizado, Ajustar, 2500 x 1875
$LadoMenor        = 1875
$QualidadeJpeg    = 90
$Extensoes        = @('.jpg', '.jpeg', '.png', '.heic', '.webp')

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir 'config-inspecoes.json'
$LogPath    = Join-Path $ScriptDir 'importacoes.log'
$Staging    = Join-Path $env:TEMP 'InspecoesImport'

function Write-Log([string]$Mensagem) {
  $linha = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Mensagem
  try { Add-Content -Path $LogPath -Value $linha -Encoding UTF8 } catch { }
  Write-Host $linha
}

function Show-Aviso([string]$Titulo, [string]$Texto) {
  if ($Vigiar) {
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(15000, $Titulo, $Texto, [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep -Seconds 8
    $n.Dispose()
  } else {
    [void][System.Windows.Forms.MessageBox]::Show($Texto, $Titulo)
  }
}

# ---------------- Pasta dos processos no OneDrive ----------------

function Get-Config {
  if (Test-Path $ConfigPath) { return (Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json) }
  return $null
}

function Find-ProcessosRoot {
  $bases = @($env:OneDriveCommercial, $env:OneDrive, $env:USERPROFILE) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  foreach ($base in $bases) {
    $achada = Get-ChildItem -Path $base -Directory -Recurse -Depth 4 -Filter '0. Processos' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($achada) { return $achada.FullName }
  }
  return $null
}

function Select-ProcessosRoot {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = 'Escolha a pasta "0. Processos" (a pasta da biblioteca sincronizada com o OneDrive)'
  $d.ShowNewFolderButton = $false
  if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $d.SelectedPath }
  return $null
}

function Get-ProcessosRoot {
  $cfg = Get-Config
  if (-not $Configurar -and $cfg -and $cfg.PastaProcessos -and (Test-Path $cfg.PastaProcessos)) { return $cfg.PastaProcessos }
  $root = $null
  if (-not $Configurar) { $root = Find-ProcessosRoot }
  if (-not $root) { $root = Select-ProcessosRoot }
  if (-not $root) { throw 'Não foi indicada a pasta "0. Processos".' }
  @{ PastaProcessos = $root } | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
  Write-Log "Pasta dos processos: $root"
  return $root
}

# Índice n.º do processo -> pasta (0. Processos\<ano>\<mês>\<n.º> - ...)
function Get-IndiceProcessos([string]$Root) {
  $indice = @{}
  Get-ChildItem -Path $Root -Directory -Recurse -Depth 2 -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -match '^(\d{4,8})(\s|-|$)' -and $_.Name -notmatch '^\d{4}$') {   # "2026" é a pasta do ano
      $num = $Matches[1]
      if (-not $indice.ContainsKey($num)) { $indice[$num] = $_.FullName }
    }
  }
  return $indice
}

# ---------------- Telemóvel (MTP) ----------------

function Get-NomeFicheiro($Item) {
  $nome = $null
  try { $nome = $Item.ExtendedProperty('System.FileName') } catch { }
  if (-not $nome) { $nome = $Item.Name }
  return [string]$nome
}

function Get-SubPasta($Pasta, [string]$Nome) {
  if (-not $Pasta) { return $null }
  foreach ($i in $Pasta.Items()) {
    if ($i.IsFolder -and ((Get-NomeFicheiro $i) -eq $Nome -or $i.Name -eq $Nome)) { return $i.GetFolder }
  }
  return $null
}

# Pastas "Inspeções" nos telemóveis ligados
function Get-PastasTelemovel {
  $shell = New-Object -ComObject Shell.Application
  $pc = $shell.NameSpace(17)   # "Este PC"
  $res = @()
  foreach ($dev in $pc.Items()) {
    if ($dev.IsFileSystem) { continue }   # discos e pens: não interessam
    $devPasta = $null
    try { $devPasta = $dev.GetFolder } catch { }
    if (-not $devPasta) { continue }
    foreach ($arm in $devPasta.Items()) {
      if (-not $arm.IsFolder) { continue }
      foreach ($topo in @('Documents', 'Pictures')) {
        $insp = Get-SubPasta (Get-SubPasta $arm.GetFolder $topo) $PastaNoTelemovel
        if ($insp) { $res += [pscustomobject]@{ Telemovel = $dev.Name; Pasta = $insp } }
      }
    }
  }
  return $res
}

# Copia um ficheiro do telemóvel e espera que acabe (a cópia do Windows por MTP é assíncrona)
function Copy-DoTelemovel($Item, [string]$Destino, [int64]$Tamanho) {
  if (-not (Test-Path $Staging)) { New-Item -ItemType Directory -Path $Staging | Out-Null }
  $nome = Get-NomeFicheiro $Item
  $tmp = Join-Path $Staging $nome
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  $shell = New-Object -ComObject Shell.Application
  $shell.NameSpace($Staging).CopyHere($Item, 4 + 16 + 512 + 1024)
  $limite = (Get-Date).AddMinutes(5)
  while ((Get-Date) -lt $limite) {
    if (Test-Path $tmp) {
      $f = Get-Item $tmp
      if ($Tamanho -le 0 -or $f.Length -ge $Tamanho) {
        try { $s = [System.IO.File]::Open($tmp, 'Open', 'Read', 'None'); $s.Close(); break } catch { }
      }
    }
    Start-Sleep -Milliseconds 300
  }
  if (-not (Test-Path $tmp)) { throw "A cópia de $nome não terminou." }
  Move-Item -Path $tmp -Destination $Destino -Force
}

# Nome livre no destino: igual se não existir; se existir com o mesmo tamanho -> já copiado ($null)
function Get-DestinoLivre([string]$Pasta, [string]$Nome, [int64]$Tamanho) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($Nome)
  $ext = [System.IO.Path]::GetExtension($Nome)
  for ($n = 1; $n -lt 1000; $n++) {
    $cand = if ($n -eq 1) { Join-Path $Pasta $Nome } else { Join-Path $Pasta ('{0}_{1}{2}' -f $base, $n, $ext) }
    if (-not (Test-Path $cand)) { return $cand }
    if ((Get-Item $cand).Length -eq $Tamanho) { return $null }
  }
  return $null
}

function Copy-ArvoreTelemovel($PastaTel, [string]$Destino, $Stats) {
  if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Path $Destino -Force | Out-Null }
  foreach ($item in $PastaTel.Items()) {
    $nome = Get-NomeFicheiro $item
    if ($item.IsFolder) { Copy-ArvoreTelemovel $item.GetFolder (Join-Path $Destino $nome) $Stats; continue }
    if ($Extensoes -notcontains ([System.IO.Path]::GetExtension($nome).ToLower())) { continue }
    $tamanho = [int64]0
    try { $tamanho = [int64]$item.ExtendedProperty('System.Size') } catch { }
    if ($tamanho -le 0) { try { $tamanho = [int64]$item.Size } catch { } }
    $alvo = Get-DestinoLivre $Destino $nome $tamanho
    if (-not $alvo) { $Stats.Iguais++; continue }
    try {
      Copy-DoTelemovel $item $alvo $tamanho
      $Stats.Copiadas++
    } catch {
      $Stats.Erros++
      Write-Log "  ERRO a copiar $nome : $($_.Exception.Message)"
    }
  }
}

# ---------------- Versão leve (como o Image Resizer) ----------------

function Get-TamanhoAjustado([int]$Largura, [int]$Altura) {
  if ($Largura -ge $Altura) { $cw = $LadoMaior; $ch = $LadoMenor } else { $cw = $LadoMenor; $ch = $LadoMaior }
  $escala = [Math]::Min(1.0, [Math]::Min($cw / $Largura, $ch / $Altura))   # nunca aumenta
  return @([int][Math]::Max(1, [Math]::Round($Largura * $escala)), [int][Math]::Max(1, [Math]::Round($Altura * $escala)))
}

function New-VersaoLeve([string]$Origem, [string]$Destino) {
  $img = [System.Drawing.Image]::FromFile($Origem)
  try {
    # Endireitar conforme a orientação gravada pela câmara (EXIF 0x0112)
    if ($img.PropertyIdList -contains 0x0112) {
      switch ([int]$img.GetPropertyItem(0x0112).Value[0]) {
        2 { $img.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
        3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
        4 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipX) }
        5 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipX) }
        6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
        7 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipX) }
        8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
      }
    }
    $t = Get-TamanhoAjustado $img.Width $img.Height
    $bmp = New-Object System.Drawing.Bitmap $t[0], $t[1]
    try {
      $bmp.SetResolution(96, 96)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.DrawImage($img, 0, 0, $t[0], $t[1])
      $g.Dispose()
      # Manter data, marca/modelo e GPS (a orientação já foi aplicada)
      $manter = @(0x010F, 0x0110, 0x0132, 0x9003, 0x9004) + (0..31)
      foreach ($p in $img.PropertyItems) { if ($manter -contains $p.Id) { try { $bmp.SetPropertyItem($p) } catch { } } }
      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
      $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
      $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$QualidadeJpeg)
      $tmp = "$Destino.tmp"
      $bmp.Save($tmp, $codec, $ep)
      Move-Item -Path $tmp -Destination $Destino -Force
    } finally { $bmp.Dispose() }
  } finally { $img.Dispose() }
}

# Para cada foto de "2. Fotos" sem versão leve, cria-a em "3. Fotos - Light" (mesmas subpastas, sempre .jpg)
function Update-PastaLight([string]$Fotos, [string]$Light, $Stats) {
  if (-not (Test-Path $Fotos)) { return }
  $raiz = (Get-Item $Fotos).FullName.TrimEnd('\')
  Get-ChildItem -Path $Fotos -File -Recurse | Where-Object { $Extensoes -contains $_.Extension.ToLower() -and $_.Extension.ToLower() -ne '.heic' } | ForEach-Object {
    $rel = $_.FullName.Substring($raiz.Length).TrimStart('\')
    $alvo = Join-Path $Light ([System.IO.Path]::ChangeExtension($rel, '.jpg'))
    if (Test-Path $alvo) { return }
    $pasta = Split-Path -Parent $alvo
    if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta -Force | Out-Null }
    try { New-VersaoLeve $_.FullName $alvo; $Stats.Leves++ } catch { $Stats.Erros++; Write-Log "  ERRO na versão leve de $rel : $($_.Exception.Message)" }
  }
}

# ---------------- Importação ----------------

function Invoke-Importacao {
  $telemoveis = @(Get-PastasTelemovel)
  if ($telemoveis.Count -eq 0) {
    Write-Log 'Telemóvel não encontrado (está ligado, desbloqueado e em "Transferência de ficheiros"?).'
    return $null
  }
  $root = Get-ProcessosRoot
  $indice = Get-IndiceProcessos $root
  $resumo = @()
  $semPasta = @()
  foreach ($tel in $telemoveis) {
    Write-Log "Telemóvel: $($tel.Telemovel)"
    foreach ($proc in $tel.Pasta.Items()) {
      if (-not $proc.IsFolder) { continue }
      $num = Get-NomeFicheiro $proc
      if ($num -notmatch '^\d{4,8}$') { continue }
      $fotosTel = Get-SubPasta $proc.GetFolder $PastaFotos
      if (-not $fotosTel) { continue }
      $destProc = $indice[$num]
      if (-not $destProc) { $semPasta += $num; Write-Log "Processo $num : não existe pasta no OneDrive. Ignorado."; continue }
      $stats = [pscustomobject]@{ Copiadas = 0; Iguais = 0; Leves = 0; Erros = 0 }
      Write-Log "Processo $num -> $destProc"
      Copy-ArvoreTelemovel $fotosTel (Join-Path $destProc $PastaFotos) $stats
      Update-PastaLight (Join-Path $destProc $PastaFotos) (Join-Path $destProc $PastaLight) $stats
      Write-Log ("  {0} fotos novas, {1} já lá estavam, {2} versões leves, {3} erros" -f $stats.Copiadas, $stats.Iguais, $stats.Leves, $stats.Erros)
      if ($stats.Copiadas -gt 0 -or $stats.Leves -gt 0 -or $stats.Erros -gt 0) {
        $resumo += ("{0}: {1} fotos novas, {2} leves{3}" -f $num, $stats.Copiadas, $stats.Leves, $(if ($stats.Erros) { ", $($stats.Erros) erros" } else { '' }))
      }
    }
  }
  $texto = if ($resumo.Count) { $resumo -join "`n" } else { 'Não havia fotos novas.' }
  if ($semPasta.Count) { $texto += "`n`nSem pasta no OneDrive (crie-a e volte a importar): " + ($semPasta -join ', ') }
  Show-Aviso 'Inspeções — importação concluída' $texto
  return $true
}

if ($SoFuncoes) { return }

if ($Configurar) { [void](Get-ProcessosRoot); Show-Aviso 'Inspeções' 'Pasta dos processos guardada.'; return }

if ($Vigiar) {
  Write-Log 'À espera do telemóvel...'
  $jaImportado = $false
  while ($true) {
    $ligado = $false
    try { $ligado = @(Get-PastasTelemovel).Count -gt 0 } catch { }
    if ($ligado -and -not $jaImportado) {
      Start-Sleep -Seconds 3
      try { if (Invoke-Importacao) { $jaImportado = $true } } catch { Write-Log "ERRO: $($_.Exception.Message)" }
    } elseif (-not $ligado) {
      $jaImportado = $false   # desligado: na próxima ligação importa outra vez
    }
    Start-Sleep -Seconds 15
  }
}

try {
  if (-not (Invoke-Importacao)) { Show-Aviso 'Inspeções' "Telemóvel não encontrado.`n`nLigue-o por cabo, desbloqueie-o e escolha `"Transferência de ficheiros`" na notificação USB." }
} catch {
  Write-Log "ERRO: $($_.Exception.Message)"
  Show-Aviso 'Inspeções — erro' $_.Exception.Message
}
