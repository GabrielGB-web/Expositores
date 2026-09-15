import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Layers, 
  ArrowRight,
  Info
} from 'lucide-react';
import { Display } from '../types';
import { 
  parseExcelDisplays, 
  ParsedDisplayRow, 
  DEFAULT_DISPLAY_IMAGE, 
  downloadExcelTemplate 
} from '../lib/excelDisplayUtils';
import { supabase } from '../lib/supabase';
import { saveDepartmentForFilial } from '../lib/departments';
import { normalizeFilial } from '../lib/staff';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingDisplays: Display[];
  onImportComplete: () => Promise<void>;
  currentFilial: string;
}

export default function ExcelImportModal({
  isOpen,
  onClose,
  existingDisplays,
  onImportComplete,
  currentFilial
}: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedDisplayRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile: File) => {
    setErrorMessage(null);
    setImportResult(null);
    setFile(selectedFile);
    setParsing(true);

    try {
      const rows = await parseExcelDisplays(selectedFile, currentFilial);
      
      // Cruza com os expositores existentes para marcar se é inserção ou atualização
      const analyzedRows = rows.map(row => {
        const match = existingDisplays.find(d => {
          const sameFilial = normalizeFilial(d.filial) === row.filial;
          const sameCode = row.code && d.code && d.code.trim().toUpperCase() === row.code;
          const sameName = d.name.trim().toUpperCase() === row.name;
          return sameFilial && (sameCode || sameName);
        });

        return {
          ...row,
          isUpdate: !!match
        };
      });

      setParsedRows(analyzedRows);
    } catch (err: any) {
      console.error('Erro ao ler planilha:', err);
      setErrorMessage(err.message || 'Falha ao processar o arquivo. Verifique o formato do Excel.');
      setParsedRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleExecuteImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setErrorMessage('Nenhum expositor válido para importar.');
      return;
    }

    setImporting(true);
    setErrorMessage(null);
    setImportProgress({ current: 0, total: validRows.length });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    try {
      // 1. Cadastra automaticamente qualquer nova indústria/departamento encontrado na planilha
      const deptsByFilial = new Map<string, Set<string>>();
      validRows.forEach(r => {
        if (!deptsByFilial.has(r.filial)) {
          deptsByFilial.set(r.filial, new Set());
        }
        if (r.department) {
          deptsByFilial.get(r.filial)!.add(r.department);
        }
      });

      for (const [filial, depts] of deptsByFilial.entries()) {
        for (const dept of depts) {
          await saveDepartmentForFilial(dept, filial);
        }
      }

      // 2. Processa cada linha no Supabase
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        setImportProgress({ current: i + 1, total: validRows.length });

        // Verifica se já existe um expositor com mesmo código ou nome na mesma filial
        const existing = existingDisplays.find(d => {
          const sameFilial = normalizeFilial(d.filial) === row.filial;
          const sameCode = row.code && d.code && d.code.trim().toUpperCase() === row.code;
          const sameName = d.name.trim().toUpperCase() === row.name;
          return sameFilial && (sameCode || sameName);
        });

        if (existing) {
          // Atualiza dados e soma ou atualiza estoque
          const { error: updateErr } = await supabase
            .from('displays')
            .update({
              name: row.name,
              code: row.code || existing.code,
              stock: row.quantity, // Define o novo estoque importado da base
              department: row.department || existing.department,
              min_order_value: row.min_order_value > 0 ? row.min_order_value : (existing.min_order_value || 0),
              filial: row.filial
            })
            .eq('id', existing.id);

          if (updateErr) {
            console.warn(`Erro ao atualizar linha ${row.rowNumber}:`, updateErr);
            skipped++;
          } else {
            updated++;
          }
        } else {
          // Insere novo expositor
          const { error: insertErr } = await supabase
            .from('displays')
            .insert([{
              name: row.name,
              code: row.code,
              stock: row.quantity,
              department: row.department,
              min_order_value: row.min_order_value,
              filial: row.filial,
              image_url: DEFAULT_DISPLAY_IMAGE
            }]);

          if (insertErr) {
            console.warn(`Erro ao inserir linha ${row.rowNumber}:`, insertErr);
            skipped++;
          } else {
            inserted++;
          }
        }
      }

      setImportResult({ inserted, updated, skipped });
      await onImportComplete();
    } catch (err: any) {
      console.error('Falha durante importação:', err);
      setErrorMessage(`Erro ao importar: ${err.message || 'Verifique sua conexão e tente novamente.'}`);
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setParsedRows([]);
    setErrorMessage(null);
    setImportResult(null);
    setImportProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const newCount = parsedRows.filter(r => r.isValid && !r.isUpdate).length;
  const updateCount = parsedRows.filter(r => r.isValid && r.isUpdate).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141414]/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white border-2 border-[#141414] shadow-[10px_10px_0px_0px_rgba(20,20,20,1)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b-2 border-[#141414] bg-[#141414] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white text-[#141414]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wider">
                Importação em Massa de Expositores (Excel / CSV)
              </h3>
              <p className="text-[10px] text-white/70 font-mono mt-0.5">
                Alimente a base oficial de expositores com Código, Nome, Quantidade, Indústria e Filial
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-white hover:bg-white/20 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Instruções e Modelo */}
          <div className="bg-amber-50 border-2 border-amber-300 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-950 font-bold space-y-1">
                <p>
                  Sua planilha deve conter as colunas: <span className="font-mono bg-amber-200/80 px-1 py-0.5">Código</span>, <span className="font-mono bg-amber-200/80 px-1 py-0.5">Nome</span>, <span className="font-mono bg-amber-200/80 px-1 py-0.5">Quantidade</span>, <span className="font-mono bg-amber-200/80 px-1 py-0.5">Departamento</span> e <span className="font-mono bg-amber-200/80 px-1 py-0.5">Filial (04 ou 02)</span>.
                </p>
                <p className="text-[10px] text-amber-900 font-normal">
                  Se um expositor com o mesmo código ou nome já existir na filial, seu estoque e indústria serão atualizados automaticamente.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadExcelTemplate}
              className="px-3.5 py-2 bg-white hover:bg-amber-100 border-2 border-[#141414] text-[#141414] font-black text-xs uppercase tracking-wider flex items-center gap-2 shrink-0 transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:shadow-none"
            >
              <Download className="w-4 h-4" />
              Baixar Modelo Excel (.xlsx)
            </button>
          </div>

          {/* Feedback de Sucesso Final */}
          {importResult && (
            <div className="bg-green-50 border-2 border-green-600 p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-800 font-black text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Importação Concluída com Sucesso!
              </div>
              <p className="text-xs text-green-900 font-mono">
                ✓ <strong>{importResult.inserted}</strong> novos expositores criados na base.<br />
                ✓ <strong>{importResult.updated}</strong> expositores já existentes atualizados com o novo estoque.<br />
                {importResult.skipped > 0 && <span>⚠️ {importResult.skipped} linhas com inconsistência ignoradas.</span>}
              </p>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-green-700 text-white font-black text-xs uppercase hover:bg-green-800"
                >
                  Concluir e Ver no Catálogo
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-2 border border-green-700 text-green-800 font-bold text-xs uppercase hover:bg-green-100"
                >
                  Importar Outra Planilha
                </button>
              </div>
            </div>
          )}

          {/* Mensagem de Erro */}
          {errorMessage && (
            <div className="bg-red-50 border-2 border-red-500 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-red-900 font-black text-xs uppercase">Atenção na Importação</h5>
                <p className="text-red-700 text-xs font-bold mt-1">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Dropzone de Seleção */}
          {!importResult && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-4 border-dashed p-8 text-center cursor-pointer transition-all ${
                isDragOver 
                  ? 'border-green-600 bg-green-50/50' 
                  : 'border-[#141414]/20 hover:border-[#141414] bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="p-3 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                  {parsing ? (
                    <Loader2 className="w-6 h-6 animate-spin text-[#141414]" />
                  ) : (
                    <Upload className="w-6 h-6 text-[#141414]" />
                  )}
                </div>
                <h4 className="font-black text-sm uppercase text-[#141414] mt-2">
                  {file ? file.name : 'Clique ou arraste a planilha Excel aqui'}
                </h4>
                <p className="text-[10px] font-mono text-[#141414]/50 uppercase">
                  Formatos suportados: .xlsx, .xls, .csv
                </p>
              </div>
            </div>
          )}

          {/* Pré-visualização das Linhas Reconhecidas */}
          {parsedRows.length > 0 && !importResult && (
            <div className="space-y-4">
              {/* Badges de Resumo */}
              <div className="flex flex-wrap gap-2 text-xs font-mono font-bold">
                <span className="px-3 py-1 bg-[#141414] text-white border border-[#141414]">
                  Total: {parsedRows.length} linhas
                </span>
                <span className="px-3 py-1 bg-green-100 text-green-900 border border-green-500">
                  {newCount} Novos Expositores
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-900 border border-blue-500">
                  {updateCount} A Atualizar
                </span>
                {invalidCount > 0 && (
                  <span className="px-3 py-1 bg-red-100 text-red-900 border border-red-500">
                    {invalidCount} Inválidos
                  </span>
                )}
              </div>

              {/* Tabela de Preview */}
              <div className="border-2 border-[#141414] overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 border-b-2 border-[#141414] flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-[#141414]/70">
                    Pré-visualização dos Dados Mapeados
                  </span>
                  <span className="text-[9px] font-mono text-[#141414]/50">
                    Exibindo até 20 primeiros itens
                  </span>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#141414] text-white text-[9px] uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="p-2.5">Linha</th>
                        <th className="p-2.5">Código</th>
                        <th className="p-2.5">Nome do Expositor</th>
                        <th className="p-2.5">Qtd / Estoque</th>
                        <th className="p-2.5">Departamento</th>
                        <th className="p-2.5">Filial</th>
                        <th className="p-2.5">Ação Prevista</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#141414]/10 bg-white">
                      {parsedRows.slice(0, 20).map((row, idx) => (
                        <tr key={idx} className={row.isValid ? 'hover:bg-gray-50' : 'bg-red-50'}>
                          <td className="p-2.5 font-bold text-[#141414]/40">#{row.rowNumber}</td>
                          <td className="p-2.5 font-black">{row.code || <span className="text-gray-400">AUTOMÁTICO</span>}</td>
                          <td className="p-2.5 font-bold uppercase truncate max-w-[200px]" title={row.name}>
                            {row.name}
                          </td>
                          <td className="p-2.5 font-black text-green-700 bg-green-50/50">
                            {row.quantity} un
                          </td>
                          <td className="p-2.5 font-bold uppercase text-[#141414]/70">
                            {row.department}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase border ${
                              row.filial === '02' 
                                ? 'bg-amber-100 text-amber-900 border-amber-400' 
                                : 'bg-purple-100 text-purple-900 border-purple-400'
                            }`}>
                              FILIAL {row.filial}
                            </span>
                          </td>
                          <td className="p-2.5">
                            {row.isValid ? (
                              row.isUpdate ? (
                                <span className="text-blue-700 font-bold text-[9px] uppercase bg-blue-50 px-1.5 py-0.5 border border-blue-200">
                                  Atualizar Estoque
                                </span>
                              ) : (
                                <span className="text-green-700 font-bold text-[9px] uppercase bg-green-50 px-1.5 py-0.5 border border-green-200">
                                  + Novo Cadastro
                                </span>
                              )
                            ) : (
                              <span className="text-red-700 font-bold text-[9px] uppercase bg-red-100 px-1.5 py-0.5 border border-red-300">
                                {row.validationErrors.join(', ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedRows.length > 20 && (
                <p className="text-[10px] text-center font-mono text-[#141414]/50">
                  + {parsedRows.length - 20} linhas adicionais serão importadas conforme mapeadas.
                </p>
              )}
            </div>
          )}

          {/* Barra de Progresso durante a importação */}
          {importing && importProgress && (
            <div className="p-4 border-2 border-[#141414] bg-gray-50 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importando expositores para a base...
                </span>
                <span>{importProgress.current} de {importProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 h-3 border border-[#141414]">
                <div 
                  className="bg-[#141414] h-full transition-all duration-150"
                  style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-[#141414] bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[10px] font-mono text-[#141414]/50 font-bold">
            {parsedRows.length > 0 
              ? `${validCount} expositores prontos para integração` 
              : 'Nenhum arquivo carregado'}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="flex-1 sm:flex-none px-4 py-2.5 border-2 border-[#141414] text-xs font-black uppercase hover:bg-gray-100 disabled:opacity-50"
            >
              Cancelar
            </button>

            {!importResult && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing || validCount === 0}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-[#141414] text-white text-xs font-black uppercase tracking-wider hover:bg-opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    Confirmar e Importar ({validCount})
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
