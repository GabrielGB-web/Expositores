import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Package, 
  Plus, 
  Trash2, 
  Camera, 
  Loader2, 
  AlertCircle, 
  Building2, 
  Tag, 
  Check, 
  Filter,
  FileSpreadsheet,
  Download,
  UploadCloud,
  Search,
  FileDown,
  Copy,
  Shield,
  Info
} from 'lucide-react';
import { Display, DEFAULT_DEPARTMENTS } from '../types';
import { getDepartmentsForFilial, saveDepartmentForFilial, removeDepartmentForFilial } from '../lib/departments';
import { normalizeFilial } from '../lib/staff';
import ExcelImportModal from './ExcelImportModal';
import { exportDisplaysToExcel, downloadExcelTemplate } from '../lib/excelDisplayUtils';
import { 
  fetchUnifiedDisplays, 
  saveUnifiedDisplay, 
  deleteUnifiedDisplay, 
  SUPABASE_RLS_FIX_SQL 
} from '../lib/displays';

interface DisplayManagerProps {
  initialFilial?: string;
}

export default function DisplayManager({ initialFilial = '04' }: DisplayManagerProps) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const [rlsNotice, setRlsNotice] = useState<{ show: boolean; message: string } | null>(null);
  const [copiedRlsSql, setCopiedRlsSql] = useState(false);

  // Filter in the catalog list
  const [catalogFilialFilter, setCatalogFilialFilter] = useState<string>(initialFilial || 'TODAS');

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(DEFAULT_DEPARTMENTS['04'] || []);
  const [isAddingNewDept, setIsAddingNewDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [showDeptManager, setShowDeptManager] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Independent state for Industry/Department Manager to NOT override form filial
  const [deptManagerFilial, setDeptManagerFilial] = useState<string>(initialFilial === 'TODAS' ? '04' : (initialFilial || '04'));
  const [deptManagerList, setDeptManagerList] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    stock: 0,
    department: 'ELMA CHIPS',
    min_order_value: 0,
    filial: initialFilial === 'TODAS' ? '04' : (initialFilial || '04'),
    image: null as File | null,
    imageUrlPreview: ''
  });

  useEffect(() => {
    fetchDisplays();
  }, []);

  // Update available departments when form filial changes
  useEffect(() => {
    loadDepartments(formData.filial);
  }, [formData.filial]);

  // Update department manager list when deptManagerFilial changes
  useEffect(() => {
    loadDeptManagerList(deptManagerFilial);
  }, [deptManagerFilial]);

  async function loadDepartments(filial: string) {
    const list = await getDepartmentsForFilial(filial);
    setAvailableDepartments(list);
    if (!list.includes(formData.department) && list.length > 0) {
      setFormData(prev => ({ ...prev, department: list[0] }));
    }
  }

  async function loadDeptManagerList(filial: string) {
    const list = await getDepartmentsForFilial(filial);
    setDeptManagerList(list);
  }

  async function fetchDisplays() {
    try {
      const data = await fetchUnifiedDisplays();
      setDisplays(data || []);
    } catch (err: any) {
      console.error(err);
      setError("Erro ao carregar catálogo: " + (err.message || "Verifique sua conexão ou se a tabela 'displays' existe no Supabase."));
    } finally {
      setLoading(false);
    }
  }

  const copyRlsSql = () => {
    navigator.clipboard.writeText(SUPABASE_RLS_FIX_SQL);
    setCopiedRlsSql(true);
    setTimeout(() => setCopiedRlsSql(false), 3000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ 
        ...prev, 
        image: file, 
        imageUrlPreview: URL.createObjectURL(file) 
      }));
    }
  };

  const handleEdit = async (display: Display) => {
    const targetFilial = display.filial || '04';
    const depts = await getDepartmentsForFilial(targetFilial);
    setAvailableDepartments(depts);

    setEditId(display.id);
    setFormData({
      name: display.name,
      code: display.code || '',
      stock: display.stock,
      department: display.department || depts[0] || 'ELMA CHIPS',
      min_order_value: display.min_order_value || 0,
      filial: targetFilial,
      image: null,
      imageUrlPreview: display.image_url
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setFormData({
      name: '',
      code: '',
      stock: 0,
      department: availableDepartments[0] || 'ELMA CHIPS',
      min_order_value: 0,
      filial: formData.filial || '04',
      image: null,
      imageUrlPreview: ''
    });
  };

  const handleCreateNewDepartment = async () => {
    const clean = newDeptName.trim().toUpperCase();
    if (!clean) return;

    const updated = await saveDepartmentForFilial(clean, deptManagerFilial);
    setDeptManagerList(updated);
    if (deptManagerFilial === formData.filial) {
      setAvailableDepartments(updated);
      setFormData(prev => ({ ...prev, department: clean }));
    }
    setNewDeptName('');
    setIsAddingNewDept(false);
    setSuccessFeedback(`Indústria "${clean}" adicionada com sucesso na FILIAL ${deptManagerFilial}!`);
    setTimeout(() => setSuccessFeedback(null), 4000);
  };

  const handleDeleteDepartment = async (deptName: string) => {
    const updated = await removeDepartmentForFilial(deptName, deptManagerFilial);
    setDeptManagerList(updated);
    if (deptManagerFilial === formData.filial) {
      setAvailableDepartments(updated);
      if (formData.department === deptName && updated.length > 0) {
        setFormData(prev => ({ ...prev, department: updated[0] }));
      }
    }
    setSuccessFeedback(`Indústria "${deptName}" removida com sucesso da FILIAL ${deptManagerFilial}!`);
    setTimeout(() => setSuccessFeedback(null), 4000);
  };

  const handleSaveDisplay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      alert("Preencha o nome.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let publicUrl = formData.imageUrlPreview;

      // 1. Upload new image if selected
      if (formData.image) {
        try {
          const fileExt = formData.image.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${fileExt}`;
          const filePath = `catalog/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('catalog')
            .upload(filePath, formData.image);

          if (!uploadError) {
            const { data: { publicUrl: newUrl } } = supabase.storage
              .from('catalog')
              .getPublicUrl(filePath);
            publicUrl = newUrl;
          } else {
            console.warn("Storage upload aviso:", uploadError);
          }
        } catch (imgErr) {
          console.warn("Falha no upload da imagem:", imgErr);
        }
      }

      if (!editId && !formData.image && !publicUrl) {
        throw new Error("Imagem é obrigatória para novos cadastros.");
      }

      const displayData: any = {
        name: formData.name.trim(),
        code: formData.code?.trim() || '',
        stock: Number(formData.stock) || 0,
        department: formData.department,
        min_order_value: Number(formData.min_order_value) || 0,
        filial: formData.filial,
        image_url: publicUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=400'
      };

      const result = await saveUnifiedDisplay(displayData, Boolean(editId), editId || undefined);

      if (!result.success) {
        throw new Error(result.errorMessage || "Não foi possível salvar o expositor.");
      }

      // Reset form
      const savedFilial = formData.filial;
      const savedName = formData.name;
      handleCancelEdit();
      await fetchDisplays();
      setCatalogFilialFilter(savedFilial);

      if (result.supabaseRlsBlocked) {
        setRlsNotice({
          show: true,
          message: `O expositor "${savedName}" foi SALVO COM SUCESSO no sistema e já está disponível para a FILIAL ${savedFilial}! Sua tabela no Supabase retornou restrição de segurança (RLS). Para liberar a gravação direta também no Supabase, execute o comando de liberação abaixo no SQL Editor do Supabase.`
        });
      } else {
        setRlsNotice(null);
        setSuccessFeedback(`Expositor "${savedName}" ${editId ? 'atualizado' : 'cadastrado'} com sucesso na FILIAL ${savedFilial}!`);
        setTimeout(() => setSuccessFeedback(null), 5000);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("min_order_value") || err.message?.includes("filial") || err.message?.includes("column")) {
        setError("ERRO DE ESTRUTURA: Coluna faltando na tabela 'displays'. Vá na aba 'USUÁRIOS' e execute os 'COMANDOS DE REPARO' no seu painel Supabase.");
      } else if (err.message?.includes("row-level security") || err.message?.includes("security policy")) {
        setError("RESTRIÇÃO DE RLS NO SUPABASE: A tabela 'displays' no Supabase bloqueou o salvamento. Veja o comando de liberação no aviso abaixo.");
        setRlsNotice({
          show: true,
          message: "O Supabase bloqueou o salvamento com: 'new row violates row-level security policy for table displays'. Copie e execute o comando SQL abaixo no seu painel Supabase para destravar."
        });
      } else {
        setError("Erro ao salvar: " + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente remover este expositor?")) return;
    
    try {
      await deleteUnifiedDisplay(id);
      await fetchDisplays();
      setSuccessFeedback("Expositor removido com sucesso!");
      setTimeout(() => setSuccessFeedback(null), 4000);
    } catch (err: any) {
      if (err?.message?.includes('foreign key constraint')) {
        alert("Não é possível excluir este expositor pois existem pedidos vinculados a ele.");
      } else {
        alert(err?.message || "Erro ao excluir expositor.");
      }
    }
  };

  // Displays filtered by selected filial and search query
  const filteredDisplays = displays.filter(d => {
    const dFilial = normalizeFilial(d.filial);
    const targetFilial = catalogFilialFilter === 'TODAS' ? 'TODAS' : normalizeFilial(catalogFilialFilter);
    const matchesFilial = targetFilial === 'TODAS' || dFilial === targetFilial;

    const term = searchTerm.trim().toLowerCase();
    if (!term) return matchesFilial;

    const matchesSearch = 
      d.name?.toLowerCase().includes(term) ||
      (d.code && d.code.toLowerCase().includes(term)) ||
      (d.department && d.department.toLowerCase().includes(term));

    return matchesFilial && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <Loader2 className="w-8 h-8 animate-spin text-[#141414]" />
        <p className="mt-4 font-mono text-[10px] uppercase font-bold text-[#141414]/40">Sincronizando Catálogo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {successFeedback && (
        <div className="p-4 bg-green-600 text-white font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
          <span>✓ {successFeedback}</span>
          <button onClick={() => setSuccessFeedback(null)} className="underline text-[10px]">Fechar</button>
        </div>
      )}

      {/* RLS Security Policy Notice & Fix Box */}
      {rlsNotice && (
        <div className="bg-amber-50 border-4 border-amber-600 p-5 space-y-3 shadow-[8px_8px_0px_0px_rgba(217,119,6,0.2)] animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-amber-600/30 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-600 text-white">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm uppercase tracking-tight text-amber-950">
                  Aviso de Segurança (RLS) do Supabase
                </h4>
                <p className="text-[11px] font-bold text-amber-800">
                  {rlsNotice.message}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={copyRlsSql}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:scale-95"
              >
                {copiedRlsSql ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                {copiedRlsSql ? 'SQL Copiado!' : 'Copiar Comando SQL'}
              </button>
              <button
                type="button"
                onClick={() => setRlsNotice(null)}
                className="px-2.5 py-2 border-2 border-amber-800 text-amber-900 font-bold text-xs uppercase hover:bg-amber-100"
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="bg-[#141414] p-3 font-mono text-[10px] text-green-400 overflow-x-auto border-2 border-amber-600 max-h-36">
            <pre>{SUPABASE_RLS_FIX_SQL}</pre>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-medium text-amber-900">
            <Info className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              <strong>Como resolver definitivamente no Supabase:</strong> Acesse seu painel Supabase &rarr; clique em <strong>SQL Editor</strong> &rarr; cole o comando acima &rarr; clique em <strong>Run</strong>. Isso libera inserções e edições para a Filial 02 e Filial 04.
            </span>
          </div>
        </div>
      )}

      {/* Generic Error Box */}
      {error && !rlsNotice && (
        <div className="p-4 bg-red-600 text-white font-bold text-xs uppercase border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="underline text-[10px] font-mono">Fechar</button>
        </div>
      )}

      {/* Excel Management & Report Hub */}
      <section className="bg-white border-2 border-[#141414] p-5 sm:p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-[#141414] text-white shrink-0 shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]">
              <FileSpreadsheet className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black uppercase text-base tracking-tight">
                  Base de Expositores & Relatórios Excel
                </h3>
                <span className="font-mono text-[9px] bg-amber-100 text-amber-900 border border-amber-400 font-black px-1.5 py-0.5 uppercase">
                  ADMINISTRADOR
                </span>
              </div>
              <p className="text-xs text-[#141414]/75 mt-1 max-w-2xl font-medium leading-relaxed">
                Importe planilhas Excel (<span className="font-mono bg-gray-100 px-1 border border-gray-300">.xlsx / .csv</span>) contendo as colunas <strong className="text-[#141414]">Código do Expositor, Nome, Quantidade, Departamento e Filial</strong>. Atualize o estoque em lote e extraia relatórios operacionais atualizados a qualquer momento.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowExcelImport(true)}
              className="px-4 py-2.5 bg-[#141414] text-white font-black text-xs uppercase tracking-wider hover:bg-[#141414]/90 transition-all flex items-center gap-2 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
            >
              <UploadCloud className="w-4 h-4 text-green-400" />
              Importar Planilha Excel
            </button>

            <button
              type="button"
              onClick={() => exportDisplaysToExcel(displays, catalogFilialFilter)}
              className="px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.3)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
              title="Baixar planilha Excel com os dados dos expositores cadastrados"
            >
              <FileDown className="w-4 h-4" />
              Exportar Relatório (.xlsx)
            </button>

            <button
              type="button"
              onClick={downloadExcelTemplate}
              className="px-3.5 py-2.5 border-2 border-[#141414] hover:bg-gray-100 text-[#141414] font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5"
              title="Baixar modelo oficial com as colunas corretas preenchidas"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar Modelo
            </button>
          </div>
        </div>
      </section>

      {/* Add New Display Form */}
      <section className="bg-white border-2 border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b-2 border-[#141414] pb-4">
          <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {editId ? 'Editar Modelo de Expositor' : 'Cadastrar Novo Modelo de Expositor'}
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDeptManager(!showDeptManager)}
              className="px-3 py-1.5 border-2 border-[#141414] font-mono text-[10px] font-black uppercase hover:bg-[#141414] hover:text-white transition-all flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              {showDeptManager ? 'Ocultar Indústrias' : 'Gerenciar Indústrias'}
            </button>
          </div>
        </div>

        {/* Expandable Department / Industry Manager */}
        {showDeptManager && (
          <div className="mb-6 p-5 border-2 border-[#141414] bg-gray-50 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black uppercase text-xs tracking-tight flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Indústrias Cadastradas - FILIAL {deptManagerFilial}
                </h4>
                <p className="text-[9px] font-bold text-[#141414]/50 uppercase mt-0.5">
                  Estas indústrias aparecem como filtro para os vendedores da Filial {deptManagerFilial}.
                </p>
              </div>

              {/* Branch switcher for department manager */}
              <div className="flex items-center gap-1 border border-[#141414] p-1 bg-white">
                <button
                  type="button"
                  onClick={() => setDeptManagerFilial('04')}
                  className={`px-2.5 py-0.5 text-[9px] font-mono font-black uppercase ${deptManagerFilial === '04' ? 'bg-[#141414] text-white' : 'hover:bg-gray-100'}`}
                >
                  Filial 04
                </button>
                <button
                  type="button"
                  onClick={() => setDeptManagerFilial('02')}
                  className={`px-2.5 py-0.5 text-[9px] font-mono font-black uppercase ${deptManagerFilial === '02' ? 'bg-[#141414] text-white' : 'hover:bg-gray-100'}`}
                >
                  Filial 02
                </button>
              </div>
            </div>

            {/* List of active departments for this filial */}
            <div className="flex flex-wrap gap-2">
              {deptManagerList.map(dept => (
                <div key={dept} className="flex items-center gap-1 bg-white border border-[#141414] px-2.5 py-1 text-xs font-mono font-black uppercase shadow-sm">
                  <span>{dept}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteDepartment(dept)}
                    className="text-red-500 hover:text-red-700 ml-1.5 p-0.5 font-bold hover:bg-red-50"
                    title={`Remover ${dept}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add new department input */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#141414]/10">
              <input
                type="text"
                placeholder={`NOME DA NOVA INDÚSTRIA PARA FILIAL ${deptManagerFilial} (EX: BEBIDAS, DOCES...)`}
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateNewDepartment(); } }}
                className="flex-1 border-2 border-[#141414] p-2 font-mono text-xs uppercase font-bold outline-none bg-white"
              />
              <button
                type="button"
                onClick={handleCreateNewDepartment}
                className="px-4 py-2 bg-[#141414] text-white font-black text-xs uppercase tracking-widest hover:bg-opacity-80 transition-all"
              >
                + Adicionar na Filial {deptManagerFilial}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveDisplay} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Photo Dropzone */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Foto do Produto</label>
            <div className="relative aspect-square border-4 border-dashed border-[#141414]/20 hover:border-[#141414] transition-colors flex flex-col items-center justify-center overflow-hidden bg-gray-50 group">
              {formData.imageUrlPreview ? (
                <img src={formData.imageUrlPreview} className="w-full h-full object-cover" alt="Preview" />
              ) : (
                <>
                  <Camera className="w-8 h-8 text-[#141414]/20 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-bold uppercase mt-2 text-[#141414]/40">Selecionar Imagem</span>
                </>
              )}
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
            </div>
          </div>

          {/* Form Fields */}
          <div className="md:col-span-2 space-y-6 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Filial */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Filial Destino</label>
                <select
                  value={formData.filial}
                  onChange={e => setFormData(p => ({ ...p, filial: e.target.value }))}
                  className="w-full border-2 border-[#141414] p-3 font-bold uppercase text-sm focus:bg-[#141414]/5 outline-none bg-amber-50"
                >
                  <option value="04">🏢 FILIAL 04</option>
                  <option value="02">🏢 FILIAL 02</option>
                </select>
              </div>

              {/* Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Nome do Modelo</label>
                <input 
                  type="text" 
                  required
                  placeholder="EX: Expositor de Metal 2.0"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full border-2 border-[#141414] p-3 font-bold uppercase text-sm focus:bg-[#141414]/5 outline-none"
                />
              </div>

              {/* Code */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Código do Expositor</label>
                <input 
                  type="text" 
                  placeholder="EX: EXP-001"
                  value={formData.code}
                  onChange={e => setFormData(p => ({ ...p, code: e.target.value }))}
                  className="w-full border-2 border-[#141414] p-3 font-mono font-bold uppercase text-sm focus:bg-[#141414]/5 outline-none"
                />
              </div>

              {/* Department */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Indústria / Depto</label>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewDept(!isAddingNewDept)}
                    className="text-[9px] font-black uppercase text-blue-600 hover:underline"
                  >
                    {isAddingNewDept ? 'Selecionar da Lista' : '+ Nova Indústria'}
                  </button>
                </div>

                {isAddingNewDept ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="EX: BEBIDAS"
                      value={newDeptName}
                      onChange={e => setNewDeptName(e.target.value)}
                      className="w-full border-2 border-[#141414] p-3 font-bold uppercase text-xs focus:bg-[#141414]/5 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateNewDepartment}
                      className="px-3 bg-[#141414] text-white font-black text-xs uppercase hover:bg-opacity-80"
                    >
                      Salvar
                    </button>
                  </div>
                ) : (
                  <select 
                    value={formData.department}
                    onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                    className="w-full border-2 border-[#141414] p-3 font-bold uppercase text-sm focus:bg-[#141414]/5 outline-none bg-white"
                  >
                    {availableDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Stock */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Estoque</label>
                <input 
                  type="number" 
                  min="0"
                  required
                  placeholder="0"
                  value={formData.stock}
                  onChange={e => setFormData(p => ({ ...p, stock: parseInt(e.target.value) || 0 }))}
                  className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none"
                />
              </div>

              {/* Min Order Value */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Valor Mín. Pedido (R$)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formData.min_order_value}
                  onChange={e => setFormData(p => ({ ...p, min_order_value: parseFloat(e.target.value) || 0 }))}
                  className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-red-500 w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-red-700 text-xs font-bold">{error}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <button 
                type="submit"
                disabled={saving}
                className="w-full py-5 bg-[#141414] text-white font-black uppercase tracking-[0.3em] text-xs shadow-[6px_6px_0px_0px_rgba(20,20,20,0.3)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50"
              >
                {saving ? 'Guardando Informações...' : (editId ? 'Atualizar Expositor' : 'Adicionar ao Catálogo')}
              </button>
              {editId && (
                <button 
                  type="button"
                  onClick={handleCancelEdit}
                  className="w-full py-3 border-2 border-[#141414] text-[#141414] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-gray-50 transition-all"
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </div>
        </form>
      </section>

      {/* List Existing Displays */}
      <section className="bg-white border-2 border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b-2 border-[#141414] pb-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
              <Package className="w-6 h-6" />
              Catálogo Atual & Estoque
            </h2>
            <p className="font-mono text-[9px] uppercase font-bold text-[#141414]/50 mt-0.5">
              Exibindo {filteredDisplays.length} de {displays.length} modelos ({filteredDisplays.reduce((acc, d) => acc + d.stock, 0)} unidades no estoque)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filial filter buttons */}
            <div className="flex items-center gap-1 border-2 border-[#141414] p-1 bg-white">
              <span className="text-[8px] font-black uppercase text-[#141414]/40 px-2 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Filial:
              </span>
              <button
                onClick={() => setCatalogFilialFilter('TODAS')}
                className={`px-3 py-1 font-mono text-[9px] font-black uppercase transition-all ${
                  catalogFilialFilter === 'TODAS' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-[#141414]/5'
                }`}
              >
                TODAS
              </button>
              <button
                onClick={() => setCatalogFilialFilter('04')}
                className={`px-3 py-1 font-mono text-[9px] font-black uppercase transition-all ${
                  catalogFilialFilter === '04' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-[#141414]/5'
                }`}
              >
                FILIAL 04
              </button>
              <button
                onClick={() => setCatalogFilialFilter('02')}
                className={`px-3 py-1 font-mono text-[9px] font-black uppercase transition-all ${
                  catalogFilialFilter === '02' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-[#141414]/5'
                }`}
              >
                FILIAL 02
              </button>
            </div>

            {/* Quick Export Button */}
            <button
              type="button"
              onClick={() => exportDisplaysToExcel(displays, catalogFilialFilter)}
              className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-900 border-2 border-green-600 font-mono text-[9px] font-black uppercase transition-all flex items-center gap-1.5"
              title="Exportar dados da lista filtrada para planilha Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-700" />
              Exportar (.xlsx)
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="w-4 h-4 text-[#141414]/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="PESQUISAR EXPOSITOR POR CÓDIGO, NOME OU INDÚSTRIA..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border-2 border-[#141414] font-mono text-xs uppercase font-bold outline-none bg-gray-50 focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#141414]/50 hover:text-black"
              >
                LIMPAR
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDisplays.map(display => (
            <div key={display.id} className="border-2 border-[#141414] p-4 flex flex-col group hover:bg-[#141414]/5 transition-colors">
              <div className="aspect-video bg-gray-100 border border-[#141414]/5 mb-4 overflow-hidden grayscale group-hover:grayscale-0 transition-all">
                <img src={display.image_url} alt={display.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-black uppercase text-xs tracking-tight line-clamp-1">{display.name}</h4>
                    {display.code && (
                      <span className="text-[8px] font-mono font-black bg-[#141414] text-white px-1 py-0.5">{display.code}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[8px] font-mono font-black bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 uppercase">
                      FILIAL {display.filial || '04'}
                    </span>
                    <span className="font-mono text-[8px] font-black text-[#141414]/60 uppercase tracking-tighter">
                      {display.department}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    <p className="font-mono text-[9px] font-bold text-green-700 bg-green-50 inline-block px-1">ESTOQUE: {display.stock}</p>
                    <p className="font-mono text-[9px] font-bold text-blue-700 bg-blue-50 inline-block px-1">MINIMO: R$ {display.min_order_value?.toLocaleString('pt-br', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleEdit(display)}
                    className="p-2 text-[#141414]/20 hover:text-blue-600 transition-colors"
                    title="Editar"
                  >
                    <Plus className="w-4 h-4 rotate-45" />
                  </button>
                  <button 
                    onClick={() => handleDelete(display.id)}
                    className="p-2 text-[#141414]/20 hover:text-red-600 transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredDisplays.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-[#141414]/10">
            <p className="text-xs font-black uppercase text-[#141414]/40 tracking-widest">
              {searchTerm 
                ? `Nenhum expositor encontrado para o termo "${searchTerm}".`
                : (catalogFilialFilter === 'TODAS'
                  ? 'O catálogo está vazio. Utilize o botão "Importar Planilha Excel" acima para carregar sua base.'
                  : `Nenhum expositor cadastrado para a Filial ${catalogFilialFilter}. Use o formulário ou a importação Excel para cadastrar.`)}
            </p>
          </div>
        )}
      </section>

      {/* Modal de Importação de Planilha Excel */}
      <ExcelImportModal
        isOpen={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        existingDisplays={displays}
        onImportComplete={async () => {
          await fetchDisplays();
          setShowExcelImport(false);
          setSuccessFeedback('Base de expositores importada e atualizada com sucesso!');
          setTimeout(() => setSuccessFeedback(null), 5000);
        }}
        currentFilial={catalogFilialFilter === 'TODAS' ? '04' : catalogFilialFilter}
      />
    </div>
  );
}
