/**
 * CRT Rumo Norte – lê os e-mails "Solicito CRT" e preenche a programação.
 *
 * O que faz, a cada 10 minutos:
 *  1. Procura no Gmail os e-mails com PDF de CRT argentino (AR…) dos últimos dias.
 *  2. Lê no corpo do e-mail os pares "CRT  fatura" e a placa do veículo (tração e carreta).
 *  3. Lê cada PDF de CRT: peso bruto, volume, valor, caixas e se é de PEÇAS ou de EMBALAGEM.
 *  4. Na aba "Rumo Norte", acha a linha da carga (mesma placa, data de programação até 5 dias da data do CRT)
 *     e preenche Fatura e CRT (só se estiverem vazias) e as somas dos CRTs de PEÇAS em
 *     "Peso Bruto CRT", "Volume CRT", "Valor CRT", "Caixas CRT" (o painel leva essas colunas para o tracking).
 *  5. Registra cada CRT na aba "Base CRT 2026" (é também o controle para não processar o mesmo e-mail duas vezes).
 *
 * Instalação: veja apps-script/LEIAME.md.
 */

const CFG = {
  ABA_PROGRAMACAO: 'Rumo Norte',
  ABA_BASE: 'Base CRT 2026',
  // e-mails com anexo PDF de CRT dos últimos dias (o script ignora os que já estão na Base)
  BUSCA: 'has:attachment filename:pdf CRT newer_than:7d',
  DIAS_JANELA: 5,                       // diferença máxima entre a data do CRT e a data da programação
  // descrição da mercadoria (campo 11 do CRT): o que é embalagem (não soma nas colunas do tracking)
  // (a embalagem cita as peças: "FACTURA DE EMBALAJE … CONTENIENDO PIEZAS", por isso embalagem é conferida primeiro)
  EMBALAGEM: /EMBALAJ|EMBALAGEM|ENVASE|VAC[IÍ]O|RETORNABLE|REUTILIZ|RACKS?\b|CAJONES|PALLETS?\b|CAJAS VAC/i,
  PECAS: /PARTES Y PIEZAS|REPUESTOS|PIEZAS|AUTOPARTES/i,
  COLS_CRT: ['Peso Bruto CRT', 'Volume CRT', 'Valor CRT', 'Caixas CRT'],
  OCULTAR_COLS: true,                   // as 4 colunas novas ficam ocultas na aba Rumo Norte
};

// ---------------------------------------------------------------- execução
function processarEmailsCRT() {
  const ss = SpreadsheetApp.getActive();
  const base = abaBase_(ss);
  const vistos = new Set(base.getRange(2, 13, Math.max(base.getLastRow() - 1, 1), 1).getValues().flat().filter(String));
  const threads = GmailApp.search(CFG.BUSCA, 0, 50);
  for (const th of threads) {
    for (const msg of th.getMessages()) {
      if (vistos.has(msg.getId())) continue;
      const pdfs = msg.getAttachments().filter(a => /\.pdf$/i.test(a.getName()) && /AR\s*\d{9}/i.test(a.getName()));
      if (!pdfs.length) continue;
      try {
        processarMensagem_(ss, base, msg, pdfs);
      } catch (e) {
        base.appendRow([new Date(), '', '', '', '', '', '', '', '', '', '', msg.getSubject(), msg.getId(), 'ERRO: ' + e.message]);
      }
      vistos.add(msg.getId());
    }
  }
}

function processarMensagem_(ss, base, msg, pdfs) {
  const corpo = lerCorpo(msg.getPlainBody());
  const crts = pdfs.map(a => {
    let d = {};
    try { d = lerCRT(textoDoPdf_(a.copyBlob())); } catch (e) { d = {erro: e.message}; }
    d.crt = d.crt || (a.getName().match(/AR\s*\d{9}/i) || [''])[0].replace(/\s/g, '').toUpperCase();
    d.fatura = (corpo.pares.find(p => p.crt === d.crt) || {}).fatura || d.fatura || '';
    return d;
  });
  // fatura/CRT na ordem do corpo do e-mail (é a ordem que a equipe usa); CRTs só do PDF vão no fim
  const ordem = corpo.pares.map(p => p.crt).concat(crts.map(c => c.crt)).filter((c, i, a) => c && a.indexOf(c) === i);
  const faturaDe = c => (corpo.pares.find(p => p.crt === c) || crts.find(x => x.crt === c) || {}).fatura || '';
  const dataCarga = crts.map(c => c.data).find(Boolean) || msg.getDate();
  const pecas = crts.filter(c => c.tipo === 'Peças');
  const soma = k => pecas.reduce((s, c) => s + (c[k] || 0), 0);
  const tot = pecas.length ? [arred(soma('peso'), 3), arred(soma('volume'), 3), arred(soma('valor'), 2), soma('caixas')] : null;

  const res = gravaProgramacao_(ss, corpo.tracao, dataCarga,
    ordem.map(faturaDe).filter(Boolean).join(' / '), ordem.join(' / '), tot);

  crts.forEach(c => base.appendRow([new Date(), corpo.tracao, corpo.carreta, c.crt, c.fatura, c.tipo || '?',
    c.peso || '', c.volume || '', c.valor || '', c.caixas || '', c.data || '', msg.getSubject(), msg.getId(),
    c.erro ? 'PDF não lido: ' + c.erro : res]));
}

// ---------------------------------------------------------------- leitura do e-mail
// corpo: "AR446727795  0023 00023628" (um por linha) e "AZF5D60  BAA1458" (tração e carreta)
function lerCorpo(txt) {
  const topo = String(txt || '').split(/\n\s*(De|From|Enviado|Sent|-{3,}|_{5,})\s*:?/i)[0];
  const pares = [];
  const reP = /\bAR[\s.]*(\d{3})[\s.]*(\d{3})[\s.]*(\d{3})\b[^\S\n]*[-–|;,]?[^\S\n]*(\d{4})[\s.-]*(\d{8})/gi;
  let m;
  while ((m = reP.exec(topo))) pares.push({crt: 'AR' + m[1] + m[2] + m[3], fatura: m[4] + ' ' + m[5]});
  let tracao = '', carreta = '';
  for (const linha of topo.split('\n')) {
    const l = linha.replace(/\b(placas?|tra[cç][aã]o|cavalo|carreta|semi)\s*:?/gi, ' ');
    const pl = (l.toUpperCase().match(/\b([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2}|[A-Z]{3}[\s-]?\d{3})\b/g) || [])
      .map(p => p.replace(/[\s-]/g, '')).filter(p => !/^AR\d/.test(p));
    if (pl.length) { tracao = pl[0]; carreta = pl[1] || ''; break; }
  }
  return {pares, tracao, carreta};
}

// ---------------------------------------------------------------- leitura do PDF do CRT
function lerCRT(t) {
  t = String(t || '').replace(/\r/g, '');
  const num = s => { if (s == null) return null; s = String(s).trim();
    if (/,\d{1,3}$/.test(s) && !/\.\d{1,3}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
    const n = parseFloat(s); return isNaN(n) ? null : n; };
  const crt = (t.match(/\d{0,3}(AR\s?\d{9})/) || [])[1];
  const peso = num((t.match(/PB\s*:?\s*([\d.,]+)/i) || t.match(/Peso bruto[^\d]{0,60}([\d.,]+)/i) || [])[1]);
  const volume = num((t.match(/m\.?\s?cu\.?(?:\s*\/\s*Volumen en m\.?\s?cu\.?)?\s*([\d]+[.,]\d+|\d+)/i) || [])[1]);
  const mv = t.match(/Moeda\s*(\d[\d.,\s]*?)\s*(?:USD|U\$S|DOLAR|BRL|EUR)/i) || t.match(/Valor\s*\/\s*Valor\.?\s*[^\d]{0,40}(\d[\d.,\s]*?)\s*(?:USD|U\$S)/i);
  const valor = num(mv ? mv[1].replace(/\s+/g, '') : null);
  const caixas = num((t.match(/(\d+)\s*BULTOS/i) || t.match(/(\d+)\s*(VOLUMES|CAJAS|CAIXAS)/i) || [])[1]);
  const fat = t.match(/\bPL\s*(\d{4})[\s-]?(\d{8})/) || t.match(/FACTURA DE EMBALAJE\s*N(?:RO|º|°|O)?\.?\s*:?\s*(\d{4})[\s-]?(\d{8})/i)
    || t.match(/FACTURA COMERCIAL\s*N(?:RO|º|°|O)?\.?\s*:?\s*(\d{4})[\s-]?(\d{8})/i);
  const dt = t.match(/hace cargo[\s\S]{0,200}?(\d{2})[-\/](\d{2})[-\/](\d{4})/i);
  const desc = (t.match(/BULTOS[^\n]*\n?[^\n]*/i) || [''])[0] + ' ' + (t.match(/CONTENER:?[^\n]*/i) || [''])[0];
  const tipo = CFG.EMBALAGEM.test(desc) ? 'Embalagem' : CFG.PECAS.test(desc) ? 'Peças' : (CFG.EMBALAGEM.test(t) ? 'Embalagem' : 'Peças');
  return {crt: crt ? crt.replace(/\s/g, '') : '', peso, volume, valor, caixas: caixas != null ? Math.round(caixas) : null,
    fatura: fat ? fat[1] + ' ' + fat[2] : '', data: dt ? new Date(+dt[3], +dt[2] - 1, +dt[1]) : null, tipo};
}

function textoDoPdf_(blob) {
  // converte o PDF em Google Docs só para ler o texto (precisa do serviço avançado "Drive API" ativado)
  const f = Drive.Files.create({name: 'tmp_crt_' + Date.now(), mimeType: MimeType.GOOGLE_DOCS}, blob, {ocrLanguage: 'es'});
  try { return DocumentApp.openById(f.id).getBody().getText(); }
  finally { try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) {} }
}

// ---------------------------------------------------------------- gravação na programação
function gravaProgramacao_(ss, placa, dataCarga, faturas, crts, tot) {
  if (!placa) return 'sem placa no e-mail';
  const sh = ss.getSheetByName(CFG.ABA_PROGRAMACAO);
  if (!sh) return 'aba ' + CFG.ABA_PROGRAMACAO + ' não encontrada';
  const vals = sh.getDataRange().getValues();
  const hi = vals.slice(0, 30).findIndex(r => r.map(norm).includes('placa') && r.map(norm).includes('status'));
  if (hi < 0) return 'cabeçalho não encontrado';
  const H = vals[hi].map(norm), col = p => H.findIndex(h => h.startsWith(p));
  const cFat = col('fatura'), cCrt = col('crt'), cPl = col('placa'), cData = col('dataprogramacao');
  if (cFat < 0 || cCrt < 0 || cPl < 0 || cData < 0) return 'colunas Fatura/CRT/Placa/Data programação não encontradas';
  // colunas das somas: cria no fim do cabeçalho se ainda não existirem, já ocultas
  // (continuam sendo lidas pelo script e pelo painel; para ver: selecionar as colunas vizinhas → botão direito → Reexibir)
  const cTot = CFG.COLS_CRT.map(nome => {
    let c = H.indexOf(norm(nome));
    if (c < 0) {
      c = sh.getLastColumn();
      if (c >= sh.getMaxColumns()) sh.insertColumnAfter(sh.getMaxColumns());
      sh.getRange(hi + 1, c + 1).setValue(nome); H[c] = norm(nome);
      if (CFG.OCULTAR_COLS) sh.hideColumns(c + 1);
    }
    return c;
  });
  const alvo = vals.map((r, i) => ({r, i})).slice(hi + 1)
    .filter(({r}) => placaN(r[cPl]) === placa && r[cData] instanceof Date && Math.abs(r[cData] - dataCarga) <= CFG.DIAS_JANELA * 864e5)
    .sort((a, b) => (!!String(a.r[cFat]).trim() - !!String(b.r[cFat]).trim()) || Math.abs(a.r[cData] - dataCarga) - Math.abs(b.r[cData] - dataCarga))[0];
  if (!alvo) return 'linha não encontrada (placa ' + placa + ')';
  const lin = alvo.i + 1, feito = [];
  const poe = (c, v, nome) => {
    if (v === '' || v == null) return;
    const atual = String(vals[alvo.i][c] == null ? '' : vals[alvo.i][c]).trim();
    if (!atual) { sh.getRange(lin, c + 1).setValue(v); feito.push(nome); }
    else if (docs(atual) !== docs(String(v)) && nome !== 'somas') feito.push(nome + ' já tinha outro valor – conferir');
  };
  poe(cFat, faturas, 'fatura'); poe(cCrt, crts, 'CRT');
  if (tot) tot.forEach((v, k) => poe(cTot[k], v, 'somas'));
  return 'linha ' + lin + ': ' + ([...new Set(feito)].join(', ') || 'nada a preencher');
}

// ---------------------------------------------------------------- auxiliares
function abaBase_(ss) {
  const sh = ss.getSheetByName(CFG.ABA_BASE) || ss.insertSheet(CFG.ABA_BASE);
  if (!sh.getLastRow()) sh.appendRow(['Processado em', 'Placa tração', 'Placa carreta', 'CRT', 'Fatura', 'Tipo', 'Peso bruto', 'Volume m³',
    'Valor USD', 'Caixas', 'Data do CRT', 'Assunto', 'ID e-mail', 'Resultado']);
  return sh;
}
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function placaN(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function docs(s) { return (String(s).match(/\d{8,}/g) || []).sort().join(','); }
function arred(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

// cria o acionador de 10 em 10 minutos (rodar uma vez)
function instalarAcionador() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'processarEmailsCRT').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processarEmailsCRT').timeBased().everyMinutes(10).create();
}
