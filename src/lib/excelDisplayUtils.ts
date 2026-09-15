import * as XLSX from 'xlsx';
import { Display } from '../types';
import { normalizeFilial } from './staff';

export const DEFAULT_DISPLAY_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='none'%3E%3Crect width='400' height='300' fill='%23F4F4F5'/%3E%3Crect x='130' y='60' width='140' height='180' rx='4' fill='%2318181B' stroke='%2327272A' stroke-width='4'/%3E%3Crect x='145' y='80' width='110' height='30' rx='2' fill='%23FDE047'/%3E%3Ctext x='200' y='100' font-family='monospace' font-size='11' font-weight='900' fill='%2318181B' text-anchor='middle'%3EEXPOSITOR%3C/text%3E%3Cline x1='145' y1='130' x2='255' y2='130' stroke='%2352525B' stroke-width='3' stroke-dasharray='4 4'/%3E%3Cline x1='145' y1='165' x2='255' y2='165' stroke='%2352525B' stroke-width='3' stroke-dasharray='4 4'/%3E%3Cline x1='145' y1='200' x2='255' y2='200' stroke='%2352525B' stroke-width='3' stroke-dasharray='4 4'/%3E%3Ctext x='200' y='270' font-family='sans-serif' font-size='12' font-weight='bold' fill='%2371717A' text-anchor='middle'%3EFRANCAL DISTRIBUIDORA%3C/text%3E%3C/svg%3E";

export interface ParsedDisplayRow {
  rowNumber: number;
  code: string;
  name: string;
  quantity: number;
  department: string;
  filial: '04' | '02';
  min_order_value: number;
  image_url?: string;
  isValid: boolean;
  validationErrors: string[];
  isUpdate?: boolean;
}

/**
 * Normaliza strings para comparação de cabeçalhos de coluna
 */
function cleanKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Mapeia automaticamente as colunas da planilha
 */
function findValue(row: Record<string, any>, possibleKeys: string[]): any {
  const rowKeys = Object.keys(row);
  for (const pKey of possibleKeys) {
    const targetClean = cleanKey(pKey);
    const matchedKey = rowKeys.find(k => cleanKey(k) === targetClean);
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && row[matchedKey] !== '') {
      return row[matchedKey];
    }
  }
  return undefined;
}

/**
 * Analisa o arquivo Excel (.xlsx, .xls ou .csv) e devolve a lista de expositores normalizados
 */
export async function parseExcelDisplays(file: File, fallbackFilial: string = '04'): Promise<ParsedDisplayRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('A planilha selecionada não possui abas ou dados.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('Nenhum dado encontrado na primeira aba da planilha.');
  }

  const results: ParsedDisplayRow[] = [];

  rawRows.forEach((row, index) => {
    // Ignora linhas completamente vazias
    const hasValues = Object.values(row).some(v => String(v).trim() !== '');
    if (!hasValues) return;

    const rowNum = index + 2; // Linha 1 é o cabeçalho no Excel

    // Identifica código do expositor
    const rawCode = findValue(row, [
      'código do expositor',
      'codigo do expositor',
      'código expositor',
      'codigo expositor',
      'código',
      'codigo',
      'cod',
      'code',
      'ref',
      'id'
    ]);
    const code = rawCode ? String(rawCode).trim().toUpperCase() : '';

    // Identifica nome do expositor
    const rawName = findValue(row, [
      'nome do expositor',
      'nome',
      'descricao',
      'descrição',
      'expositor',
      'modelo',
      'name'
    ]);
    const name = rawName ? String(rawName).trim().toUpperCase() : '';

    // Identifica quantidade / estoque
    const rawQuantity = findValue(row, [
      'quantidade',
      'quantidade em estoque',
      'estoque',
      'qtd',
      'quant',
      'saldo',
      'stock'
    ]);
    let quantity = 0;
    if (rawQuantity !== undefined) {
      const parsedNum = parseInt(String(rawQuantity).replace(/[^0-9-]/g, ''), 10);
      quantity = isNaN(parsedNum) ? 0 : Math.max(0, parsedNum);
    }

    // Identifica departamento / indústria
    const rawDept = findValue(row, [
      'departamento',
      'departamento / industria',
      'industria',
      'indústria',
      'depto',
      'setor',
      'marca',
      'department'
    ]);
    const department = rawDept ? String(rawDept).trim().toUpperCase() : 'GERAL';

    // Identifica filial
    const rawFilial = findValue(row, [
      'filial',
      'unidade',
      'filial destino',
      'loja',
      'branch'
    ]);
    const filial = rawFilial ? normalizeFilial(String(rawFilial)) : normalizeFilial(fallbackFilial);

    // Identifica valor mínimo de pedido (opcional)
    const rawMinOrder = findValue(row, [
      'valor mínimo',
      'valor minimo',
      'valor mínimo de pedido',
      'valor minimo do pedido',
      'minimo',
      'mínimo',
      'preco',
      'min_order_value'
    ]);
    let min_order_value = 0;
    if (rawMinOrder !== undefined) {
      const cleanVal = String(rawMinOrder).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
      const parsedMin = parseFloat(cleanVal);
      min_order_value = isNaN(parsedMin) ? 0 : Math.max(0, parsedMin);
    }

    // Validações
    const errors: string[] = [];
    if (!name && !code) {
      errors.push('Informe ao menos o Código ou o Nome do expositor.');
    }

    results.push({
      rowNumber: rowNum,
      code,
      name: name || `EXPOSITOR ${code}`,
      quantity,
      department: department || 'ELMA CHIPS',
      filial,
      min_order_value,
      isValid: errors.length === 0,
      validationErrors: errors
    });
  });

  return results;
}

/**
 * Gera e faz o download de um modelo oficial de Excel pronto para preenchimento
 */
export function downloadExcelTemplate() {
  const headers = [
    {
      'Código do Expositor': 'EXP-001',
      'Nome do Expositor': 'EXPOSITOR DE CHIPS GIRATÓRIO',
      'Quantidade': 15,
      'Departamento': 'ELMA CHIPS',
      'Filial': '04',
      'Valor Mínimo (R$)': 250.00
    },
    {
      'Código do Expositor': 'EXP-002',
      'Nome do Expositor': 'DISPLAY BALCÃO CHOCOLATES',
      'Quantidade': 30,
      'Departamento': 'MONDELEZ',
      'Filial': '04',
      'Valor Mínimo (R$)': 180.00
    },
    {
      'Código do Expositor': 'EXP-003',
      'Nome do Expositor': 'EXPOSITOR SEMENTES E HORTA',
      'Quantidade': 10,
      'Departamento': 'FELTRIN',
      'Filial': '02',
      'Valor Mínimo (R$)': 300.00
    },
    {
      'Código do Expositor': 'EXP-004',
      'Nome do Expositor': 'GANCHEIRA BEBIDAS GELADAS',
      'Quantidade': 25,
      'Departamento': 'BEBIDAS',
      'Filial': '02',
      'Valor Mínimo (R$)': 200.00
    }
  ];

  const ws = XLSX.utils.json_to_sheet(headers);

  // Define larguras amigáveis de colunas
  ws['!cols'] = [
    { wch: 22 }, // Código
    { wch: 38 }, // Nome
    { wch: 14 }, // Quantidade
    { wch: 20 }, // Departamento
    { wch: 10 }, // Filial
    { wch: 18 }  // Valor Mínimo
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expositores');

  XLSX.writeFile(wb, 'modelo_importacao_expositores_francal.xlsx');
}

/**
 * Exporta a base completa de expositores cadastrados para um relatório Excel
 */
export function exportDisplaysToExcel(displays: Display[], selectedFilialFilter: string = 'TODAS') {
  const filtered = displays.filter(d => {
    if (selectedFilialFilter === 'TODAS') return true;
    return normalizeFilial(d.filial) === normalizeFilial(selectedFilialFilter);
  });

  const exportData = filtered.map(d => ({
    'Código': d.code || 'S/CÓD',
    'Nome do Expositor': d.name,
    'Filial': `FILIAL ${normalizeFilial(d.filial)}`,
    'Departamento / Indústria': d.department || 'GERAL',
    'Quantidade em Estoque': d.stock,
    'Valor Mínimo de Pedido (R$)': (d.min_order_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    'Situação': d.stock > 0 ? 'DISPONÍVEL' : 'ESGOTADO'
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);

  ws['!cols'] = [
    { wch: 16 }, // Código
    { wch: 40 }, // Nome
    { wch: 14 }, // Filial
    { wch: 24 }, // Departamento
    { wch: 22 }, // Quantidade em Estoque
    { wch: 26 }, // Valor Mínimo
    { wch: 16 }  // Situação
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Base de Expositores');

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const suffix = selectedFilialFilter === 'TODAS' ? 'todas_filiais' : `filial_${normalizeFilial(selectedFilialFilter)}`;
  
  XLSX.writeFile(wb, `relatorio_expositores_francal_${suffix}_${dateStr}.xlsx`);
}
