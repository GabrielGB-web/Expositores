import React, { useEffect, useState } from 'react';
import { Search, Filter, Loader2, PackageX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DisplayRequest, DEPARTMENTS } from '../types';
import RequestCard from './RequestCard';

interface RequestListProps {
  isAdmin?: boolean;
}

export default function RequestList({ isAdmin }: RequestListProps) {
  const [requests, setRequests] = useState<DisplayRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('TODOS');

  async function fetchRequests(isInitial = false) {
    try {
      if (isInitial) setLoading(true);
      setError(null);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Consulta simplificada e resiliente
      const { data, error: fetchErr } = await supabase
        .from('requests')
        .select('*, displays(name, code, image_url, department), profiles(email)')
        .order('created_at', { ascending: false });

      if (fetchErr) {
        throw fetchErr;
      }
      
      const formatted = (data || []).map(r => ({
        ...r,
        display_name: r.display_name || (r as any).displays?.name || 'Expositor Removido',
        display_code: r.display_code || (r as any).displays?.code || '---',
        display_image: r.display_image || (r as any).displays?.image_url,
        department: r.department || (r as any).displays?.department || 'ELMA CHIPS',
        user_email: (r as any).profiles?.email || 'Vendedor'
      }));
      
      // Se não for admin, filtra localmente para garantir segurança se o RLS falhar
      const finalData = isAdmin ? formatted : formatted.filter(r => r.user_id === session.user.id);
      setRequests(finalData as DisplayRequest[]);
    } catch (err: any) {
      console.error("Error fetching requests:", err);
      // Fallback final
      try {
        const { data: fallbackData } = await supabase
          .from('requests')
          .select('*')
          .order('created_at', { ascending: false });
        
        const formatted = (fallbackData || []).map(r => ({
          ...r,
          display_name: 'Carregando...',
          display_code: '---',
          user_email: 'Sincronizando...'
        }));
        setRequests(formatted as DisplayRequest[]);
      } catch (innerErr) {
        setError("Erro ao carregar solicitações. Tente atualizar a página.");
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }

  useEffect(() => {
    fetchRequests(true);

    // Inscrição em tempo real para atualizações automáticas
    const channel = supabase
      .channel('requests_realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'requests' 
      }, (payload) => {
        console.log("Realtime Change:", payload);
        fetchRequests(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const filteredRequests = requests.filter(r => {
    const matchesSearch = 
      r.display_name?.toLowerCase().includes(filter.toLowerCase()) ||
      r.order_number.toLowerCase().includes(filter.toLowerCase()) ||
      r.customer_code.toLowerCase().includes(filter.toLowerCase()) ||
      r.customer_name.toLowerCase().includes(filter.toLowerCase()) ||
      r.user_email?.toLowerCase().includes(filter.toLowerCase());
    
    const matchesDept = deptFilter === 'TODOS' || r.department === deptFilter;
    
    return matchesSearch && matchesDept;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[#141414]/40">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-[#141414]" />
        <p className="font-mono text-xs uppercase tracking-widest font-black">Sincronizando Banco...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border-2 border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] text-center">
        <PackageX className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="font-black text-lg uppercase tracking-tighter mb-2">Erro na Listagem</h3>
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
      {/* Filters */}
      <div className="bg-white border-2 border-[#141414] p-4 flex flex-col sm:flex-row gap-4 items-center shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
          <input
            type="text"
            placeholder="Filtrar por pedido, cliente ou modelo..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border-2 border-[#141414]/10 focus:border-[#141414] outline-none font-mono font-bold text-sm transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-[#141414]/5 px-3 py-2 border-2 border-[#141414] flex-1 sm:flex-none">
            <Filter className="w-4 h-4" />
            <select 
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-transparent font-black uppercase text-[10px] outline-none cursor-pointer w-full"
            >
              <option value="TODOS">TODOS DEPTS</option>
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={() => fetchRequests(true)}
            className="px-4 py-2 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-white"
          >
            <Loader2 className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
          <div className="flex items-center gap-2 px-4 py-2 border-2 border-[#141414] bg-[#141414] text-white text-[10px] font-black uppercase tracking-widest">
            <Filter className="w-3 h-3" />
            {filteredRequests.length} Registros
          </div>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-6">
        {filteredRequests.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[#141414]/20 p-16 flex flex-col items-center text-center">
            <PackageX className="w-12 h-12 text-[#141414]/20 mb-4" />
            <h3 className="font-black text-xs text-[#141414]/40 uppercase tracking-[0.2em]">Sem resultados para esta busca</h3>
          </div>
        ) : (
          filteredRequests.map(request => (
            <RequestCard 
              key={request.id} 
              request={request} 
              isAdmin={isAdmin} 
              onStatusChange={fetchRequests}
            />
          ))
        )}
      </div>
    </div>
  );
}
