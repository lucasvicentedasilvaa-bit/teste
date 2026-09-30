# CRT Rumo Norte – preenchimento automático pela leitura dos e-mails

O script `CRT_RumoNorte.gs` lê os e-mails "Solicito CRT" e preenche a planilha **Programação Mercosul 2026**:

| Onde | O que preenche |
|---|---|
| Aba **Rumo Norte** – Fatura / CRT | `0023 00023628 / 0023 00023629` e `AR446727795 / AR446727796` (só se a célula estiver vazia) |
| Aba **Rumo Norte** – 4 colunas novas no fim | `Peso Bruto CRT`, `Volume CRT`, `Valor CRT`, `Caixas CRT` = soma dos CRTs de **peças** (embalagem não soma) |
| Aba **Base CRT 2026** | uma linha por CRT lido (placa, CRT, fatura, tipo, peso, volume, valor, caixas, resultado) |

O painel lê as 4 colunas novas e grava no tracking da Scania Rumo Norte as colunas
**F Peso Bruto, G Volume (M³), H Valor, I Caixas**.

## O que o e-mail precisa ter

No corpo, antes da conversa anterior:

```
AR446727795  0023 00023628
AR446727796  0023 00023629
AZF5D60      BAA1458          ← placa tração e carreta (truck: só a placa)
```

E os PDFs dos CRTs anexados (nome com o número, ex.: `CRT AR446727795.pdf`).
Do PDF saem peso bruto (PB), volume (m³), valor, caixas (BULTOS), data e se é peças ou embalagem.

## Instalação (uma vez, na conta programacaomercosul@gmail.com)

1. **E-mails no Gmail**: no Outlook, crie a regra *Assunto contém "CRT"* e *tem anexo* →
   **Redirecionar para** `programacaomercosul@gmail.com`. Use "Redirecionar" e não "Encaminhar", para manter o corpo original e os anexos.
   Se a empresa bloquear redirecionamento externo, peça ao TI para liberar só esse endereço.
2. Abra a planilha → **Extensões → Apps Script** → **+ Arquivo** → Script → nome `CRT_RumoNorte` →
   cole o conteúdo de `CRT_RumoNorte.gs` e salve.
3. No menu da esquerda, **Serviços (+)** → **Drive API** → Adicionar. É usado para ler o texto do PDF.
4. Escolha a função `instalarAcionador` e clique em **Executar**. Autorize o acesso ao Gmail, à Planilha e ao Drive.
   A partir daí, ele roda sozinho a cada 10 minutos.
5. Para testar na hora: função `processarEmailsCRT` → **Executar**, e confira a aba **Base CRT 2026**.

## Conferência

- Coluna **Resultado** da Base CRT 2026:
  - `linha N: fatura, CRT, somas`: preencheu.
  - `linha não encontrada (placa X)`: não há linha com essa placa até 5 dias da data do CRT.
  - `já tinha outro valor – conferir`: a célula já estava preenchida com outro número, e o script não sobrescreve.
  - `PDF não lido`: o texto do PDF não foi reconhecido. Mande o PDF para ajustar a leitura.
- Coluna **Tipo**: se um CRT de embalagem aparecer como "Peças", ajuste a lista `EMBALAGEM` no início do script.
- O script não processa o mesmo e-mail duas vezes: ele usa a coluna **ID e-mail** da Base CRT 2026.

## Importante

As 4 colunas novas são criadas no fim do cabeçalho da aba Rumo Norte. O Apps Script que alimenta o painel
precisa devolver a aba inteira. Se ele devolver só algumas colunas, inclua essas 4.
