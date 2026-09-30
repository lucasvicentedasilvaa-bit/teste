# ============================================================================
# extrai_forvia.ps1
# Le os arquivos .zip de encerramento de importacao (tipo "ENC__FORVIA..." com
# XMLs de NF-e + PDFs de BL/DUIMP/GLME), extrai os dados das NF-e e
# gera/atualiza uma planilha CSV com uma linha por zip.
#
# Os zips sao processados EM PARALELO (varios ao mesmo tempo). As linhas do
# CSV continuam saindo na mesma ordem dos zips (ordem alfabetica do nome).
#
# Quais zips sao processados:
#   - Se forem passados zips como argumento (ex.: arrastados em cima do .bat),
#     processa apenas esses.
#   - Caso contrario, processa todos os .zip da pasta atual.
#
# Colunas preenchidas automaticamente (vem das NF-e dentro do zip):
#   DATA, NF (notas separadas por "/"), DESTINO, CONTAINER, PROCESSO, DI,
#   VALOR NF (soma de todas), Rementente (remetente da nota de numeracao mais baixa)
#
# Colunas deixadas em branco para preenchimento manual:
#   DACTE, ROMANEIO, SM, PLACA, QUITACAO, FRETE EMPRESA, FRETE MOTORISTA, PEDAGIO,
#   COLETA PORTO, ENTREGA CLIENTE, SAIDA ENTREGA, TEMPO DE ESPERA, BAIXA TERMINAL,
#   DIARIAS, MOTORISTA, TERMINAL
# ============================================================================

$ErrorActionPreference = "Stop"

# Quantos zips processar ao mesmo tempo (padrao: numero de nucleos, max. 8)
$maxParalelo = [Math]::Max(2, [Math]::Min([Environment]::ProcessorCount, 8))

$pasta  = Get-Location
$saida  = Join-Path $pasta "extracao_forvia.csv"
$colunas = "/;DATA;NF;DESTINO;DACTE;ROMANEIO;SM;PLACA;QUITAÇÃO;FRETE EMPRESA;FRETE MOTORISTA;PEDÁGIO;CONTAINER;PROCESSO;DI;VALOR NF;COLETA PORTO;ENTREGA CLIENTE;SAIDA ENTREGA;TEMPO DE ESPERA;BAIXA TERMINAL;DIARIAS;MOTORISTA;TERMINAL;Rementente;;"

if ($args.Count -gt 0) {
    $zips = @($args |
        Where-Object { $_ -like "*.zip" -and (Test-Path -LiteralPath $_) } |
        ForEach-Object { Get-Item -LiteralPath $_ } |
        Sort-Object Name)
} else {
    $zips = @(Get-ChildItem -Path $pasta -Filter *.zip | Sort-Object Name)
}

if ($zips.Count -eq 0) {
    Write-Host "Nenhum arquivo .zip encontrado."
    Read-Host "Pressione ENTER para sair"
    exit
}

if (-not (Test-Path $saida)) {
    $colunas | Out-File -FilePath $saida -Encoding UTF8
}

# ----------------------------------------------------------------------------
# Processa UM zip e devolve um objeto com a linha do CSV (ou o erro).
# Roda isolado em cada thread, por isso nao usa variaveis de fora.
# Le os XMLs direto de dentro do zip, sem descompactar em disco.
# ----------------------------------------------------------------------------
$processaZip = {
    param($zipPath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $resultado = [PSCustomObject]@{
        Nome     = [System.IO.Path]::GetFileName($zipPath)
        Linha    = $null
        Mensagem = ""
    }

    try {
        $notas = @()
        $infAdFiscoTextos = @()
        $destino = ""

        $arquivo = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
        try {
            foreach ($entrada in $arquivo.Entries) {
                if (-not $entrada.FullName.EndsWith(".xml", [StringComparison]::OrdinalIgnoreCase)) { continue }

                $doc = New-Object System.Xml.XmlDocument
                $stream = $entrada.Open()
                try { $doc.Load($stream) }
                catch { continue }   # XML invalido, ignora
                finally { $stream.Dispose() }

                $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
                $ns.AddNamespace("n", "http://www.portalfiscal.inf.br/nfe")

                $infNFe = $doc.SelectSingleNode("//n:infNFe", $ns)
                if (-not $infNFe) { continue }   # ignora arquivos que nao sejam NF-e

                $nNF    = $doc.SelectSingleNode("//n:ide/n:nNF", $ns).InnerText
                $dhEmi  = $doc.SelectSingleNode("//n:ide/n:dhEmi", $ns).InnerText
                $vNFTxt = $doc.SelectSingleNode("//n:total/n:ICMSTot/n:vNF", $ns).InnerText

                $emitNode = $doc.SelectSingleNode("//n:emit/n:xNome", $ns)
                $emit = if ($emitNode) { $emitNode.InnerText } else { "" }

                if (-not $destino) {
                    $munNode = $doc.SelectSingleNode("//n:emit/n:enderEmit/n:xMun", $ns)
                    $ufNode  = $doc.SelectSingleNode("//n:emit/n:enderEmit/n:UF", $ns)
                    if ($munNode -and $ufNode) { $destino = "$($munNode.InnerText)/$($ufNode.InnerText)" }
                }

                $adNode = $doc.SelectSingleNode("//n:infAdic/n:infAdFisco", $ns)
                if ($adNode) { $infAdFiscoTextos += $adNode.InnerText }

                $notas += [PSCustomObject]@{
                    NF    = [int]$nNF
                    DhEmi = $dhEmi
                    Valor = [decimal]::Parse($vNFTxt, [System.Globalization.CultureInfo]::InvariantCulture)
                    Emit  = $emit
                }
            }
        }
        finally {
            $arquivo.Dispose()
        }

        if ($notas.Count -eq 0) {
            $resultado.Mensagem = "Nenhuma NF-e encontrada, pulando."
            return $resultado
        }

        $notasOrd = @($notas | Sort-Object NF)
        $primeira = $notasOrd[0]

        $data    = (Get-Date).ToString("dd/MM/yyyy")

        $listaNF = ($notasOrd | ForEach-Object { $_.NF }) -join "/"

        $textoFiscal = $infAdFiscoTextos -join " "
        $processos  = ([regex]::Matches($textoFiscal, "FAS\d+/\d+")    | ForEach-Object { $_.Value } | Select-Object -Unique) -join "; "
        $dis        = ([regex]::Matches($textoFiscal, "\d{2}BR\d{11}") | ForEach-Object { $_.Value } | Select-Object -Unique) -join "; "
        $containers = ([regex]::Matches($textoFiscal, "[A-Z]{4}\d{7}") | ForEach-Object { $_.Value } | Select-Object -Unique) -join "; "

        $valorTotal    = ($notas | Measure-Object -Property Valor -Sum).Sum
        $valorTotalTxt = $valorTotal.ToString("N2", [System.Globalization.CultureInfo]::GetCultureInfo("pt-BR"))

        $remetente = $primeira.Emit

        # Colunas na ordem: /;DATA;NF;DESTINO;DACTE;ROMANEIO;SM;PLACA;QUITACAO;FRETE EMPRESA;FRETE MOTORISTA;PEDAGIO;
        #                   CONTAINER;PROCESSO;DI;VALOR NF;COLETA PORTO;ENTREGA CLIENTE;SAIDA ENTREGA;TEMPO DE ESPERA;
        #                   BAIXA TERMINAL;DIARIAS;MOTORISTA;TERMINAL;Rementente;;
        $resultado.Linha = @(
            "", $data, $listaNF, $destino,
            "", "", "", "", "", "", "", "",
            $containers, $processos, $dis, $valorTotalTxt,
            "", "", "", "", "", "", "", "",
            $remetente, "", ""
        ) -join ";"
        $resultado.Mensagem = "OK -> NFs: $listaNF | Processo(s): $processos | Total: R$ $valorTotalTxt"
    }
    catch {
        $resultado.Mensagem = "ERRO: $($_.Exception.Message)"
    }

    return $resultado
}

# ----------------------------------------------------------------------------
# Dispara todos os zips em paralelo
# ----------------------------------------------------------------------------
Write-Host "Processando $($zips.Count) zip(s), ate $maxParalelo ao mesmo tempo..."
Write-Host ""

$pool = [RunspaceFactory]::CreateRunspacePool(1, $maxParalelo)
$pool.Open()

$tarefas = foreach ($zip in $zips) {
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($processaZip.ToString()).AddArgument($zip.FullName)
    [PSCustomObject]@{ PS = $ps; Handle = $ps.BeginInvoke(); Nome = $zip.Name }
}

# Recolhe os resultados na ordem dos zips (para o CSV sair ordenado)
$linhas = New-Object System.Collections.Generic.List[string]
$ok = 0; $falhas = 0; $i = 0
foreach ($t in $tarefas) {
    $i++
    try {
        $r = $t.PS.EndInvoke($t.Handle) | Select-Object -Last 1
        if ($r -and $r.Linha) {
            $linhas.Add($r.Linha)
            $ok++
        } elseif ($r -and $r.Mensagem -like "ERRO:*") {
            $falhas++
        }
        $msg = if ($r) { $r.Mensagem } else { "ERRO: sem resultado" }
        Write-Host "[$i/$($zips.Count)] $($t.Nome)"
        Write-Host "  $msg"
    }
    catch {
        $falhas++
        Write-Host "[$i/$($zips.Count)] $($t.Nome)"
        Write-Host "  ERRO: $($_.Exception.Message)"
    }
    finally {
        $t.PS.Dispose()
    }
}

$pool.Close()
$pool.Dispose()

if ($linhas.Count -gt 0) {
    Add-Content -Path $saida -Value $linhas -Encoding UTF8
}

Write-Host ""
Write-Host "Concluido. $ok linha(s) adicionada(s), $falhas erro(s)."
Write-Host "Resultado em: $saida"
Read-Host "Pressione ENTER para sair"
