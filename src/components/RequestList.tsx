import React, { useEffect, useState } from 'react';
import { Search, Filter, Loader2, PackageX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DisplayRequest } from '../types';
import RequestCard from './RequestCard';

interface RequestListProps {
  isAdmin?: boolean;
}

export default function RequestList({ isAdmin }: RequestListProps) {
  const [requests, setRequests] = useState<DisplayRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    async function fetchRequests() {
      try {
        setError(null);
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Fetch requests. Using !inner join for profiles to ensure it works, but if join fails we handle it
        let query = supabase
          .from('requests')
          .select(`
            *,
            displays (
              name,
              image_url
            ),
            profiles!requests_user_id_fkey (
              email
            )
          `);

        if (!isAdmin) {
          query = query.eq('user_id', session.user.id);
        }

        const { data, error: fetchErr } = await query.order('created_at', { ascending: false });

        if (fetchErr) throw fetchErr;

        const formatted = (data || []).map(r => ({
          ...r,
          display_name: (r as any).displays?.name,
          display_image: (r as any).displays?.image_url,
          user_email: (r as any).profiles?.email
        }));

        setRequests(formatted as DisplayRequest[]);
      } catch (err: any) {
        console.error("Error fetching requests:", err);
        setError(err.message || "Erro ao conectar com o banco.");
      } finally {
        setLoading(false);
      }
    }

    fetchRequests();

    const channel = supabase
      .channel('requests_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const filteredRequests = requests.filter(r => 
    r.display_name?.toLowerCase().includes(filter.toLowerCase()) ||
    r.order_number.toLowerCase().includes(filter.toLowerCase()) ||
    r.customer_code.toLowerCase().includes(filter.toLowerCase()) ||
    r.customer_name.toLowerCase().includes(filter.toLowerCase())
  );

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
        <p className="text-sm text-[#141414]/60 mb-6">O banco retornou: {error}</p>
        <div className="space-y-4">
          <div className="text-left bg-gray-900 text-green-400 p-4 rounded font-mono text-[9px] overflow-x-auto whitespace-pre">
            {`-- Cole no SQL Editor do Supabase:\n\n` +
             `CREATE TABLE IF NOT EXISTS requests (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, display_id UUID REFERENCES displays(id), user_id UUID REFERENCES auth.users(id), order_number TEXT, customer_code TEXT, customer_name TEXT, order_value DECIMAL, status TEXT, photo_url TEXT, created_at TIMESTAMPTZ DEFAULT now());\n\n` +
             `CREATE TABLE IF NOT EXISTS profiles (id UUID PRIMARY KEY REFERENCES auth.users(id), email TEXT, role TEXT DEFAULT 'vendedor');\n\n` +
             `ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_user_id_fkey;\n` +
             `ALTER TABLE requests ADD CONSTRAINT requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);\n` +
             `ALTER TABLE requests ADD CONSTRAINT unique_customer_code UNIQUE (customer_code);\n\n` +
             `ALTER TABLE requests ENABLE ROW LEVEL SECURITY;\n` +
             `CREATE POLICY "Public" ON requests FOR ALL USING (true) WITH CHECK (true);`}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full px-8 py-3 bg-[#141414] text-white font-bold uppercase text-xs"
          >
            Sincronizar Agora
          </button>
        </div>
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
        <div className="flex items-center gap-2 px-4 py-2 border-2 border-[#141414] bg-[#141414] text-white text-[10px] font-black uppercase tracking-widest">
          <Filter className="w-3 h-3" />
          {filteredRequests.length} Registros
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
            <RequestCard key={request.id} request={request} isAdmin={isAdmin} />
          ))
        )}
      </div>
    </div>
  );
}
