# Liga ou desliga a importação automática (corre escondida desde que se inicia sessão no Windows).
param([switch]$Desligar)
$nome = 'Importar Inspecoes'
if ($Desligar) {
  Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Importacao automatica desligada.'
  return
}
$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'Importar-Inspecoes.ps1'
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Vigiar"
$quando = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$opcoes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $quando -Settings $opcoes -Force | Out-Null
Start-ScheduledTask -TaskName $nome
Write-Host 'Importacao automatica ligada. A partir de agora basta ligar o telemovel ao PC.'
