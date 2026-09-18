import React, { useState, useEffect } from 'react';
import { Send, AlertCircle, Loader2, Check, Package, Info, Filter, Building2, Ban, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Display, DEFAULT_DEPARTMENTS } from '../types';
import { getDepartmentsForFilial } from '../lib/departments';
import { fetchUnifiedDisplays } from '../lib/displays';

interface RequestFormProps {
  onSuccess: () => void;
  userFilial?: string;
  isAdmin?: boolean;
}

export default function RequestForm({ onSuccess, userFilial = '04', isAdmin = false }: RequestFormProps) {
  const [selectedFilial, setSelectedFilial] = useState<string>(userFilial || '04');
  const [displays, setDisplays] = useState<Display[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(DEFAULT_DEPARTMENTS[userFilial as '04' | '02'] || DEFAULT_DEPARTMENTS['04']);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDisplay, setSelectedDisplay] = useState<Display | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [formData, setFormData] = useState({
    orderNumber: '',
    customerCode: '',
    customerName: '',
    orderValue: '',
    quantity: '1',
  });

  // Keep filial synced if prop changes
  useEffect(() => {
    if (userFilial) {
      setSelectedFilial(userFilial);
    }
  }, [userFilial]);

  // Load departments for selected filial
  useEffect(() => {
    async function loadDepts() {
      const list = await getDepartmentsForFilial(selectedFilial);
      setAvailableDepartments(list);
      if (list.length > 0) {
        setSelectedDepartment(list[0]);
      }
    }
    loadDepts();
  }, [selectedFilial]);

  // Load displays
  useEffect(() => {
    async function fetchDisplays() {
      try {
        setFetching(true);
        const data = await fetchUnifiedDisplays();
        setDisplays(data || []);
      } catch (err: any) {
        console.error("Error fetching displays:", err);
        setError("Erro ao carregar catálogo: " + (err.message || "Verifique se a tabela 'displays' existe."));
      } finally {
        setFetching(false);
      }
    }
    fetchDisplays();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDisplay) {
      setError('Por favor, selecione um expositor do catálogo acima.');
      return;
    }

    if (selectedDisplay.stock <= 0) {
      setError('Este modelo de expositor está sem estoque e bloqueado para novas solicitações.');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      // 1. Check stock
      const { data: display, error: stockCheckErr } = await supabase
        .from('displays')
        .select('stock')
        .eq('id', selectedDisplay.id)
        .single();

      if (stockCheckErr || !display) throw new Error("Erro ao verificar estoque.");
      const quantityNum = parseInt(formData.quantity);
      if (isNaN(quantityNum) || quantityNum <= 0) throw new Error("Quantidade inválida.");
      if (display.stock < quantityNum) throw new Error(`Estoque insuficiente. Disponível: ${display.stock}`);

      const orderValueNum = parseFloat(formData.orderValue);
      if (selectedDisplay.min_order_value && orderValueNum < selectedDisplay.min_order_value) {
        throw new Error(`O valor do pedido (R$ ${orderValueNum.toLocaleString('pt-br', { minimumFractionDigits: 2 })}) é inferior ao valor mínimo exigido para este expositor (R$ ${selectedDisplay.min_order_value.toLocaleString('pt-br', { minimumFractionDigits: 2 })}).`);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      // 2. Check if customer code already exists in this department for this branch (Unique per department per filial)
      const { data: existingRequests, error: checkErr } = await supabase
        .from('requests')
        .select('id, department, status, filial')
        .eq('customer_code', formData.customerCode.trim())
        .eq('department', selectedDisplay.department)
        .neq('status', 'rejected');
      
      if (checkErr) throw new Error("Erro ao validar cliente no departamento.");
      
      const duplicateInFilial = existingRequests?.find(r => (r.filial || '04') === selectedFilial);
      if (duplicateInFilial) {
        throw new Error(`Este Código de Cliente (${formData.customerCode.trim()}) já possui uma solicitação ativa na Filial ${selectedFilial} para a indústria/departamento "${selectedDisplay.department}".`);
      }

      // 3. Create request with filial
      const requestData: any = {
        display_id: selectedDisplay.id,
        display_name: selectedDisplay.name,
        display_code: selectedDisplay.code || '---',
        display_image: selectedDisplay.image_url,
        order_number: formData.orderNumber,
        customer_code: formData.customerCode,
        customer_name: formData.customerName,
        order_value: parseFloat(formData.orderValue),
        quantity: quantityNum,
        department: selectedDisplay.department,
        filial: selectedFilial,
        status: 'pending',
        user_id: session.user.id
      };

      const { error: err } = await supabase
        .from('requests')
        .insert([requestData]);

      if (err) throw err;

      // 4. Update stock
      await supabase
        .from('displays')
        .update({ stock: display.stock - quantityNum })
        .eq('id', selectedDisplay.id);

      onSuccess();
    } catch (err: any) {
      console.error("Insert error:", err);
      const msg = err.message || "";
      if (msg.includes("min_order_value") || msg.includes("filial") || msg.includes("column")) {
        setError("ERRO DE ESTRUTURA: Colunas novas não encontradas no banco. Vá na aba 'USUÁRIOS' e execute os 'COMANDOS DE REPARO' no seu painel Supabase.");
      } else {
        setError('Falha ao enviar solicitação: ' + (err.message || 'Erro desconhecido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Filter displays strictly by the active filial
  const branchDisplays = displays.filter(d => (d.filial || '04') === selectedFilial);
  const filteredDisplays = branchDisplays.filter(d => d.department === selectedDepartment);

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <Loader2 className="w-8 h-8 animate-spin text-[#141414]" />
        <p className="mt-4 font-mono text-[10px] uppercase font-bold text-[#141414]/40">Carregando catálogo da Filial {selectedFilial}...</p>
      </div>
    );
  }

  if (error && displays.length === 0) {
    return (
      <div className="bg-white border-2 border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="font-black text-lg uppercase tracking-tighter mb-2">Erro ao conectar</h3>
        <p className="text-sm text-[#141414]/60 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="w-full px-8 py-3 bg-[#141414] text-white font-bold uppercase text-xs"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Catalog Section */}
      <section className="bg-white border-2 border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b-2 border-[#141414] pb-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
              <Package className="w-6 h-6" />
              Catálogo de Expositores
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono font-black uppercase bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 inline-flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                FILIAL {selectedFilial}
              </span>
              <span className="text-[10px] font-bold text-[#141414]/50 uppercase">
                Visualizando catálogo exclusivo desta filial
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Admin Filial Switcher */}
            {isAdmin && (
              <div className="flex items-center border-2 border-[#141414] p-1 bg-white">
                <span className="text-[8px] font-mono font-black uppercase text-[#141414]/50 px-2">Trocar Filial:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilial('04');
                    setSelectedDisplay(null);
                  }}
                  className={`px-2.5 py-1 text-[9px] font-mono font-black uppercase transition-all ${
                    selectedFilial === '04' ? 'bg-[#141414] text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  Filial 04
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilial('02');
                    setSelectedDisplay(null);
                  }}
                  className={`px-2.5 py-1 text-[9px] font-mono font-black uppercase transition-all ${
                    selectedFilial === '02' ? 'bg-[#141414] text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  Filial 02
                </button>
              </div>
            )}

            {/* Department Filter */}
            <div className="flex items-center gap-2 bg-[#141414]/5 px-3 py-2 border-2 border-[#141414]">
              <Filter className="w-4 h-4" />
              <select 
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  setSelectedDisplay(null);
                }}
                className="bg-transparent font-black uppercase text-[10px] outline-none cursor-pointer"
              >
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="bg-[#141414] text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest hidden sm:block">
              {filteredDisplays.length} Disponíveis
            </div>
          </div>
        </div>

        {branchDisplays.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#141414]/10">
            <p className="text-xs font-black uppercase text-[#141414]/40 tracking-widest">
              Nenhum expositor cadastrado para a Filial {selectedFilial}.
            </p>
            {isAdmin && (
              <p className="text-[10px] font-bold text-blue-600 mt-2 uppercase">
                Acesse a aba "Catálogo" para cadastrar novos modelos para a Filial {selectedFilial}.
              </p>
            )}
          </div>
        ) : filteredDisplays.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#141414]/10">
            <p className="text-xs font-black uppercase text-[#141414]/40 tracking-widest">
              Nenhum expositor encontrado na indústria "{selectedDepartment}" para a Filial {selectedFilial}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filteredDisplays.map((display) => {
              const isOutOfStock = (display.stock || 0) <= 0;
              const isSelected = selectedDisplay?.id === display.id;

              return (
                <button
                  key={display.id}
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => {
                    if (isOutOfStock) {
                      setError(`O expositor "${display.name}" está sem estoque e não pode ser selecionado.`);
                      return;
                    }
                    setSelectedDisplay(display);
                  }}
                  className={`group relative text-left border-2 transition-all p-2.5 flex flex-col justify-between ${
                    isOutOfStock
                      ? 'border-red-300 bg-red-50/50 opacity-60 cursor-not-allowed hover:border-red-400'
                      : isSelected
                      ? 'border-[#141414] bg-[#141414]/5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]'
                      : 'border-[#141414]/15 hover:border-[#141414]/50 bg-white'
                  }`}
                >
                  {/* Out of Stock Overlay Banner */}
                  {isOutOfStock && (
                    <div className="absolute top-2 left-2 right-2 z-10 bg-red-600 text-white font-black text-[9px] uppercase tracking-widest py-1 px-2 flex items-center justify-center gap-1 shadow-md">
                      <Lock className="w-3 h-3" />
                      Sem Estoque (Bloqueado)
                    </div>
                  )}

                  <div className={`aspect-square bg-gray-100 border border-[#141414]/10 mb-3 overflow-hidden transition-all relative ${
                    isOutOfStock ? 'grayscale opacity-60' : 'grayscale-[0.3] group-hover:grayscale-0'
                  }`}>
                    <img 
                      src={display.image_url} 
                      alt={display.name} 
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div>
                    <p className={`text-xs font-black uppercase leading-tight mb-1 line-clamp-2 ${isOutOfStock ? 'text-gray-500 line-through' : ''}`}>
                      {display.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 mb-2">
                      <p className="text-[9px] font-mono font-black text-[#141414]/40">COD: {display.code || '---'}</p>
                      <span className="text-[8px] font-mono font-black bg-purple-100 text-purple-900 px-1">F{display.filial || '04'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 mt-auto pt-2 border-t border-[#141414]/10">
                    <span className={`text-[9px] font-mono font-black border px-1.5 py-0.5 ${
                       isOutOfStock 
                         ? 'bg-red-600 text-white border-red-700 font-bold' 
                         : 'bg-green-100 text-green-800 border-green-200'
                    }`}>
                      {isOutOfStock ? 'ESTOQUE ZERO' : `QTD: ${display.stock}`}
                    </span>
                    {display.min_order_value > 0 && (
                      <span className="text-[9px] font-mono font-black border bg-blue-100 text-blue-800 border-blue-200 px-1">
                        MIN: R${display.min_order_value}
                      </span>
                    )}
                    {isSelected && !isOutOfStock && <Check className="w-4 h-4 text-[#141414]" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Form Section */}
      <section className={`bg-white border-2 border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all ${!selectedDisplay ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
        <div className="flex items-center justify-between mb-6 border-b border-[#141414]/10 pb-4">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            <h2 className="text-lg font-black uppercase tracking-tighter">Dados da Solicitação</h2>
          </div>
          <span className="text-[10px] font-mono font-black uppercase bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5">
            Destino: FILIAL {selectedFilial}
          </span>
        </div>

        {!selectedDisplay && (
          <div className="mb-6 flex items-center gap-3 bg-blue-50 border-2 border-blue-200 p-4 rounded-sm">
            <Info className="text-blue-500 w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-bold text-blue-800 italic">Selecione um expositor no catálogo acima para habilitar o formulário.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Número do Pedido</label>
              <input
                name="orderNumber"
                required
                type="text"
                value={formData.orderNumber}
                onChange={handleChange}
                placeholder="EX: #9900"
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Código do Cliente</label>
              <input
                name="customerCode"
                required
                type="text"
                value={formData.customerCode}
                onChange={handleChange}
                placeholder="EX: CL_123"
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Fantasia (Nome Cliente)</label>
              <input
                name="customerName"
                required
                type="text"
                value={formData.customerName}
                onChange={handleChange}
                placeholder="NOME DA LOJA"
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Valor (R$)</label>
              <input
                name="orderValue"
                required
                type="number"
                step="0.01"
                value={formData.orderValue}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Quantidade</label>
              <input
                name="quantity"
                required
                type="number"
                min="1"
                max={selectedDisplay?.stock || 1}
                value={formData.quantity}
                onChange={handleChange}
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors text-sm"
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-start gap-3">
              <AlertCircle className="text-red-500 w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm font-bold">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !selectedDisplay}
            className="group w-full py-5 bg-[#141414] text-white font-black uppercase tracking-[0.3em] text-xs hover:bg-[#222] disabled:opacity-50 transition-all shadow-[6px_6px_0px_0px_rgba(20,20,20,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processando Envio para Filial {selectedFilial}...
              </div>
            ) : `Confirmar Solicitação de Envio (FILIAL ${selectedFilial})`}
          </button>
        </form>
      </section>
    </div>
  );
}
