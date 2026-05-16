import React, { useState, useEffect } from 'react';
import { Send, AlertCircle, Loader2, Check, Package, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Display, DEPARTMENTS } from '../types';
import { Filter } from 'lucide-react';

interface RequestFormProps {
  onSuccess: () => void;
}

export default function RequestForm({ onSuccess }: RequestFormProps) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDisplay, setSelectedDisplay] = useState<Display | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>(DEPARTMENTS[0]);
  const [formData, setFormData] = useState({
    orderNumber: '',
    customerCode: '',
    customerName: '',
    orderValue: '',
    quantity: '1',
  });

  useEffect(() => {
    async function fetchDisplays() {
      try {
        const { data, error: err } = await supabase
          .from('displays')
          .select('*')
          .order('name', { ascending: true });
        
        if (err) throw err;
        setDisplays(data || []);
      } catch (err: any) {
        console.error("Error fetching displays:", err);
        setError("Erro ao carregar catálogo: " + (err.message || "Verifique as chaves do Supabase e se a tabela 'displays' existe."));
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
    
    setLoading(true);
    setError(null);

    try {
      // 1. Check stock again
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

      // 2. Check if customer code already exists (Unique constraint check)
      const { data: existingRequest, error: checkErr } = await supabase
        .from('requests')
        .select('id')
        .eq('customer_code', formData.customerCode)
        .maybeSingle();
      
      if (checkErr) throw new Error("Erro ao validar cliente.");
      if (existingRequest) throw new Error(`Este Código de Cliente (${formData.customerCode}) já possui uma solicitação ativa.`);

      // 3. Create request
      const { error: err } = await supabase
        .from('requests')
        .insert([{
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
          status: 'pending',
          user_id: session.user.id
        }]);

      if (err) throw err;

      // 4. Update stock (Manual decrement)
      await supabase
        .from('displays')
        .update({ stock: display.stock - quantityNum })
        .eq('id', selectedDisplay.id);

      onSuccess();
    } catch (err: any) {
      console.error("Insert error:", err);
      const msg = err.message || "";
      if (msg.includes("min_order_value") || msg.includes("column")) {
        setError("ERRO DE ESTRUTURA: Colunas novas não encontradas. Vá na aba 'USUÁRIOS' e siga as instruções de 'COMANDOS DE REPARO' no seu painel Supabase.");
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

  const filteredDisplays = displays.filter(d => d.department === selectedDepartment);

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <Loader2 className="w-8 h-8 animate-spin text-[#141414]" />
        <p className="mt-4 font-mono text-[10px] uppercase font-bold text-[#141414]/40">Carregando catálogo...</p>
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
        <div className="flex items-center justify-between mb-6 border-b-2 border-[#141414] pb-4">
          <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
            <Package className="w-6 h-6" />
            Catálogo de Expositores
          </h2>
          <div className="flex items-center gap-2">
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
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
            </div>
            <div className="bg-[#141414] text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest hidden sm:block">
              {filteredDisplays.length} Disponíveis
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {filteredDisplays.map((display) => (
            <button
              key={display.id}
              onClick={() => setSelectedDisplay(display)}
              className={`group relative text-left border-2 transition-all p-2 ${
                selectedDisplay?.id === display.id 
                  ? 'border-[#141414] bg-[#141414]/5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]' 
                  : 'border-[#141414]/10 hover:border-[#141414]/30'
              }`}
            >
              <div className="aspect-square bg-gray-100 border border-[#141414]/5 mb-3 overflow-hidden transition-all grayscale-[0.5] group-hover:grayscale-0">
                <img 
                  src={display.image_url} 
                  alt={display.name} 
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs font-black uppercase leading-none mb-1 truncate">{display.name}</p>
              <p className="text-[9px] font-mono font-black text-[#141414]/40 mt-1 mb-2">COD: {display.code || '---'}</p>
              <div className="flex flex-wrap items-center justify-between gap-1 mt-auto">
                <span className={`text-[9px] font-mono font-black border px-1 ${
                   display.stock > 0 ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'
                }`}>
                  QTD: {display.stock}
                </span>
                {display.min_order_value > 0 && (
                  <span className="text-[9px] font-mono font-black border bg-blue-100 text-blue-800 border-blue-200 px-1">
                    MIN: R${display.min_order_value}
                  </span>
                )}
                {selectedDisplay?.id === display.id && <Check className="w-4 h-4 text-[#141414]" />}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Form Section */}
      <section className={`bg-white border-2 border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all ${!selectedDisplay ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
        <div className="flex items-center gap-2 mb-6">
          <Send className="w-5 h-5" />
          <h2 className="text-lg font-black uppercase tracking-tighter">Dados da Solicitação</h2>
        </div>

        {!selectedDisplay && (
          <div className="mb-6 flex items-center gap-3 bg-blue-50 border-2 border-blue-200 p-4 rounded-sm">
            <Info className="text-blue-500 w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-bold text-blue-800 italic">Selecione um expositor no catálogo acima para habilitar o formulário.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Número do Pedido</label>
              <input
                name="orderNumber"
                required
                type="text"
                value={formData.orderNumber}
                onChange={handleChange}
                placeholder="EX: #9900"
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors"
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
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors"
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
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors"
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
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors"
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
                className="w-full border-2 border-[#141414] p-3 font-mono font-bold focus:bg-[#141414]/5 outline-none transition-colors"
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
                Processando...
              </div>
            ) : 'Confirmar Solicitação de Envio'}
          </button>
        </form>
      </section>
    </div>
  );
}
