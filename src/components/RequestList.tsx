import React, { useEffect, useState, useMemo } from 'react';
import { Search, Filter, Loader2, PackageX, User, X, Clock, CheckCircle2, ThumbsUp, XCircle, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DisplayRequest, DEPARTMENTS, RequestStatus } from '../types';
import RequestCard from './RequestCard';

interface RequestListProps {
  isAdmin?: boolean;
}

type StatusFilterType = 'TODOS' | RequestStatus;

export default function RequestList({ isAdmin }: RequestListProps) {
  const [requests, setRequests] = useState<DisplayRequest[]>([]);
  const [profilesList, setProfilesList] = useState<{ id: string; email: string; role?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('TODOS');
  const [sellerFilter, setSellerFilter] = useState<string>('TODOS');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('TODOS');

  async function fetchRequests(isInitial = false) {
    try {
      if (isInitial) setLoading(true);
      setError(null);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Se for admin, busca também lista de perfis para garantir listagem completa de vendedores
      if (isAdmin) {
        try {
          const { data: profs } = await supabase.from('profiles').select('id, email, role');
          if (profs) setProfilesList(profs);
        } catch (e) {
          console.warn("Não foi possível buscar a lista de perfis:", e);
        }
      }

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

  // Lista agregada de vendedores para o filtro
  const sellersList = useMemo(() => {
    const sellersMap = new Map<string, { email: string; count: number; userId?: string }>();

    // Inicializa com perfis conhecidos
    profilesList.forEach(p => {
      if (p.email) {
        const key = p.email.toLowerCase();
        sellersMap.set(key, {
          email: p.email,
          count: 0,
          userId: p.id
        });
      }
    });

    // Contabiliza solicitações por vendedor
    requests.forEach(r => {
      if (r.user_email && r.user_email !== 'Vendedor' && r.user_email !== 'Sincronizando...') {
        const key = r.user_email.toLowerCase();
        const existing = sellersMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          sellersMap.set(key, {
            email: r.user_email,
            count: 1,
            userId: r.user_id
          });
        }
      }
    });

    return Array.from(sellersMap.values()).sort((a, b) => a.email.localeCompare(b.email));
  }, [profilesList, requests]);

  // Contadores de status (baseados no filtro de vendedor/departamento/texto se aplicável ou no total)
  const statusCounts = useMemo(() => {
    const counts = {
      TODOS: requests.length,
      pending: 0,
      approved: 0,
      delivered: 0,
      rejected: 0,
    };

    requests.forEach(r => {
      if (r.status && counts[r.status] !== undefined) {
        counts[r.status]++;
      }
    });

    return counts;
  }, [requests]);

  const filteredRequests = requests.filter(r => {
    const matchesSearch = 
      r.display_name?.toLowerCase().includes(filter.toLowerCase()) ||
      r.order_number.toLowerCase().includes(filter.toLowerCase()) ||
      r.customer_code.toLowerCase().includes(filter.toLowerCase()) ||
      r.customer_name.toLowerCase().includes(filter.toLowerCase()) ||
      r.user_email?.toLowerCase().includes(filter.toLowerCase());
    
    const matchesDept = deptFilter === 'TODOS' || r.department === deptFilter;

    const matchesSeller = 
      !isAdmin || 
      sellerFilter === 'TODOS' || 
      r.user_email?.toLowerCase() === sellerFilter.toLowerCase() ||
      (profilesList.find(p => p.email.toLowerCase() === sellerFilter.toLowerCase())?.id === r.user_id);
    
    const matchesStatus = statusFilter === 'TODOS' || r.status === statusFilter;

    return matchesSearch && matchesDept && matchesSeller && matchesStatus;
  });

  const hasActiveFilters = 
    deptFilter !== 'TODOS' || 
    (isAdmin && sellerFilter !== 'TODOS') || 
    statusFilter !== 'TODOS' || 
    filter.trim() !== '';

  const getStatusLabel = (st: StatusFilterType) => {
    switch (st) {
      case 'pending': return 'Pendente';
      case 'approved': return 'Aprovado';
      case 'delivered': return 'Concluído';
      case 'rejected': return 'Reprovado';
      default: return 'Todos';
    }
  };

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
      {/* Status Filter Tabs / Quick Select */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <button
          onClick={() => setStatusFilter('TODOS')}
          className={`p-3 border-2 border-[#141414] flex items-center justify-between transition-all text-left ${
            statusFilter === 'TODOS'
              ? 'bg-[#141414] text-white shadow-[4px_4px_0px_0px_rgba(20,20,20,0.3)]'
              : 'bg-white hover:bg-[#141414]/5 text-[#141414]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-wider">Todos</span>
          </div>
          <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-xs ${
            statusFilter === 'TODOS' ? 'bg-white/20 text-white' : 'bg-[#141414]/10 text-[#141414]'
          }`}>
            {statusCounts.TODOS}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('pending')}
          className={`p-3 border-2 border-[#141414] flex items-center justify-between transition-all text-left ${
            statusFilter === 'pending'
              ? 'bg-amber-500 border-amber-600 text-white shadow-[4px_4px_0px_0px_rgba(245,158,11,0.4)]'
              : 'bg-white hover:bg-amber-50/50 text-[#141414]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 shrink-0 ${statusFilter === 'pending' ? 'text-white' : 'text-amber-600'}`} />
            <span className="text-[11px] font-black uppercase tracking-wider">Pendentes</span>
          </div>
          <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-xs ${
            statusFilter === 'pending' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'
          }`}>
            {statusCounts.pending}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('approved')}
          className={`p-3 border-2 border-[#141414] flex items-center justify-between transition-all text-left ${
            statusFilter === 'approved'
              ? 'bg-blue-600 border-blue-700 text-white shadow-[4px_4px_0px_0px_rgba(37,99,235,0.4)]'
              : 'bg-white hover:bg-blue-50/50 text-[#141414]'
          }`}
        >
          <div className="flex items-center gap-2">
            <ThumbsUp className={`w-4 h-4 shrink-0 ${statusFilter === 'approved' ? 'text-white' : 'text-blue-600'}`} />
            <span className="text-[11px] font-black uppercase tracking-wider">Aprovados</span>
          </div>
          <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-xs ${
            statusFilter === 'approved' ? 'bg-white/30 text-white' : 'bg-blue-100 text-blue-900 border border-blue-300'
          }`}>
            {statusCounts.approved}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('delivered')}
          className={`p-3 border-2 border-[#141414] flex items-center justify-between transition-all text-left ${
            statusFilter === 'delivered'
              ? 'bg-green-600 border-green-700 text-white shadow-[4px_4px_0px_0px_rgba(22,163,74,0.4)]'
              : 'bg-white hover:bg-green-50/50 text-[#141414]'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${statusFilter === 'delivered' ? 'text-white' : 'text-green-600'}`} />
            <span className="text-[11px] font-black uppercase tracking-wider">Concluídos</span>
          </div>
          <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-xs ${
            statusFilter === 'delivered' ? 'bg-white/30 text-white' : 'bg-green-100 text-green-900 border border-green-300'
          }`}>
            {statusCounts.delivered}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('rejected')}
          className={`col-span-2 sm:col-span-1 p-3 border-2 border-[#141414] flex items-center justify-between transition-all text-left ${
            statusFilter === 'rejected'
              ? 'bg-red-600 border-red-700 text-white shadow-[4px_4px_0px_0px_rgba(220,38,38,0.4)]'
              : 'bg-white hover:bg-red-50/50 text-[#141414]'
          }`}
        >
          <div className="flex items-center gap-2">
            <XCircle className={`w-4 h-4 shrink-0 ${statusFilter === 'rejected' ? 'text-white' : 'text-red-600'}`} />
            <span className="text-[11px] font-black uppercase tracking-wider">Reprovados</span>
          </div>
          <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-xs ${
            statusFilter === 'rejected' ? 'bg-white/30 text-white' : 'bg-red-100 text-red-900 border border-red-300'
          }`}>
            {statusCounts.rejected}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border-2 border-[#141414] p-4 flex flex-col gap-3 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
            <input
              type="text"
              placeholder={isAdmin ? "Filtrar por pedido, cliente, modelo ou vendedor..." : "Filtrar por pedido, cliente ou modelo..."}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 border-2 border-[#141414]/10 focus:border-[#141414] outline-none font-mono font-bold text-sm transition-all"
            />
            {filter && (
              <button 
                onClick={() => setFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/40 hover:text-[#141414]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Dropdown Filter */}
            <div className={`flex items-center gap-2 px-3 py-2 border-2 border-[#141414] flex-1 sm:flex-none transition-colors ${
              statusFilter !== 'TODOS' ? 'bg-amber-50 border-amber-600' : 'bg-[#141414]/5'
            }`}>
              <Filter className="w-4 h-4 shrink-0" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilterType)}
                className="bg-transparent font-black uppercase text-[10px] outline-none cursor-pointer w-full"
              >
                <option value="TODOS">STATUS: TODOS ({requests.length})</option>
                <option value="pending">PENDENTES ({statusCounts.pending})</option>
                <option value="approved">APROVADOS ({statusCounts.approved})</option>
                <option value="delivered">CONCLUÍDOS ({statusCounts.delivered})</option>
                <option value="rejected">REPROVADOS ({statusCounts.rejected})</option>
              </select>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2 bg-[#141414]/5 px-3 py-2 border-2 border-[#141414] flex-1 sm:flex-none">
              <Filter className="w-4 h-4 shrink-0" />
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

            {/* Seller Filter (Admin only) */}
            {isAdmin && (
              <div className={`flex items-center gap-2 px-3 py-2 border-2 border-[#141414] flex-1 sm:flex-none transition-colors ${
                sellerFilter !== 'TODOS' ? 'bg-blue-50 border-blue-600 text-blue-950' : 'bg-[#141414]/5'
              }`}>
                <User className={`w-4 h-4 shrink-0 ${sellerFilter !== 'TODOS' ? 'text-blue-600' : ''}`} />
                <select 
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                  className="bg-transparent font-black uppercase text-[10px] outline-none cursor-pointer max-w-[200px] truncate"
                >
                  <option value="TODOS">TODOS VENDEDORES ({requests.length})</option>
                  {sellersList.map(seller => (
                    <option key={seller.email} value={seller.email}>
                      {seller.email} ({seller.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sync button */}
            <button 
              onClick={() => fetchRequests(true)}
              className="px-3 py-2 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-white shrink-0"
              title="Sincronizar dados"
            >
              <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            {/* Counter Badge */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-2 border-[#141414] bg-[#141414] text-white text-[10px] font-black uppercase tracking-widest shrink-0">
              <Filter className="w-3 h-3" />
              <span>{filteredRequests.length} Registros</span>
            </div>
          </div>
        </div>

        {/* Active Filter Chips indicator */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#141414]/10 text-[10px] font-mono">
            <span className="font-bold text-[#141414]/50 uppercase">Filtros ativos:</span>
            {statusFilter !== 'TODOS' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-bold uppercase rounded-xs border ${
                statusFilter === 'pending' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                statusFilter === 'approved' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                statusFilter === 'delivered' ? 'bg-green-100 text-green-900 border-green-300' :
                'bg-red-100 text-red-900 border-red-300'
              }`}>
                Status: {getStatusLabel(statusFilter)}
                <button onClick={() => setStatusFilter('TODOS')} className="hover:opacity-70 ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {deptFilter !== 'TODOS' && (
              <span className="inline-flex items-center gap-1 bg-[#141414]/10 px-2 py-0.5 font-bold uppercase rounded-xs">
                Depto: {deptFilter}
                <button onClick={() => setDeptFilter('TODOS')} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {isAdmin && sellerFilter !== 'TODOS' && (
              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 font-bold uppercase rounded-xs">
                <User className="w-3 h-3 text-blue-600" />
                Vendedor: {sellerFilter}
                <button onClick={() => setSellerFilter('TODOS')} className="hover:text-red-600 ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filter.trim() !== '' && (
              <span className="inline-flex items-center gap-1 bg-[#141414]/10 px-2 py-0.5 font-bold uppercase rounded-xs">
                Termo: "{filter}"
                <button onClick={() => setFilter('')} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setStatusFilter('TODOS');
                setDeptFilter('TODOS');
                setSellerFilter('TODOS');
                setFilter('');
              }}
              className="text-red-600 underline font-bold uppercase text-[9px] ml-auto hover:text-red-800"
            >
              Limpar todos
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-6">
        {filteredRequests.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[#141414]/20 p-16 flex flex-col items-center text-center">
            <PackageX className="w-12 h-12 text-[#141414]/20 mb-4" />
            <h3 className="font-black text-xs text-[#141414]/40 uppercase tracking-[0.2em]">Sem resultados para esta busca</h3>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setStatusFilter('TODOS');
                  setDeptFilter('TODOS');
                  setSellerFilter('TODOS');
                  setFilter('');
                }}
                className="mt-4 px-4 py-2 border border-[#141414] text-[10px] font-black uppercase tracking-widest hover:bg-[#141414] hover:text-white transition-all"
              >
                Limpar Filtros
              </button>
            )}
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

