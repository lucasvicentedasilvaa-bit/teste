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

## Instalação (conta que recebe os e-mails: recebimentomercosulritmo@gmail.com)

O script lê o Gmail da conta em que ele roda. Por isso ele fica na conta **recebimentomercosulritmo@gmail.com**
e grava na planilha pelo ID (`PLANILHA_ID` no início do script).

1. **Acesso à planilha**: com a conta dona da planilha, clique em **Compartilhar** e adicione `recebimentomercosulritmo@gmail.com` como **Editor**.
2. **E-mails**: no Outlook, crie a regra *Assunto contém "CRT"* e *tem anexo* → **Redirecionar para** `recebimentomercosulritmo@gmail.com`.
3. Numa janela anônima (ou só com essa conta logada), entre em **script.google.com** com `recebimentomercosulritmo@gmail.com`
   → **Novo projeto** → nome `CRT Rumo Norte` → apague o conteúdo e cole `CRT_RumoNorte.gs` → salvar.
4. No menu da esquerda, **Serviços (+)** → **Drive API** → Adicionar. É usado para ler o texto do PDF.
5. Escolha a função `processarEmailsCRT` → **Executar** → autorize o acesso ao Gmail, às Planilhas e ao Drive.
   Confira a aba **Base CRT 2026** e a linha da carga na aba Rumo Norte.
6. Escolha a função `instalarAcionadorCRT` → **Executar**. A partir daí, ele roda sozinho a cada 10 minutos.

## Conferência

- Coluna **Resultado** da Base CRT 2026:
  - `linha N: fatura, CRT, somas`: preencheu.
  - `linha não encontrada (placa X)`: não há linha com essa placa até 5 dias da data do CRT.
  - `já tinha outro valor – conferir`: a célula já estava preenchida com outro número, e o script não sobrescreve.
  - `PDF não lido`: o texto do PDF não foi reconhecido. Mande o PDF para ajustar a leitura.
- Coluna **Tipo**: se um CRT de embalagem aparecer como "Peças", ajuste a lista `EMBALAGEM` no início do script.
- O script não processa o mesmo e-mail duas vezes: ele usa a coluna **ID e-mail** da Base CRT 2026.

## Importante

As 4 colunas novas são criadas no fim do cabeçalho da aba Rumo Norte **e ficam ocultas**: não aparecem para a equipe,
mas o script e o painel continuam lendo normalmente. Para vê-las: selecione as colunas vizinhas → botão direito → **Reexibir colunas**.
Se alguém reexibir, o script não esconde de novo. Para deixar sempre visíveis, mude `OCULTAR_COLS` para `false`. O Apps Script que alimenta o painel
precisa devolver a aba inteira. Se ele devolver só algumas colunas, inclua essas 4.
