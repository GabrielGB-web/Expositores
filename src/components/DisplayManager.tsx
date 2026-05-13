import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Plus, Trash2, Camera, Loader2, AlertCircle } from 'lucide-react';
import { Display } from '../types';

export default function DisplayManager() {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    stock: 0,
    image: null as File | null,
    imageUrlPreview: ''
  });

  useEffect(() => {
    fetchDisplays();
  }, []);

  async function fetchDisplays() {
    try {
      const { data, error: err } = await supabase
        .from('displays')
        .select('*')
        .order('name');
      
      if (err) throw err;
      setDisplays(data || []);
    } catch (err: any) {
      console.error(err);
      setError("Erro ao carregar catálogo: " + (err.message || "Verifique se a tabela 'displays' existe no seu Supabase."));
    } finally {
      setLoading(false);
    }
  }

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

  const handleAddDisplay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.image) {
      alert("Preencha o nome e selecione uma imagem.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Upload image
      const fileExt = formData.image.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `catalog/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('catalog')
        .upload(filePath, formData.image);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('catalog')
        .getPublicUrl(filePath);

      // 2. Insert into DB
      const { error: insertError } = await supabase
        .from('displays')
        .insert([{
          name: formData.name,
          stock: formData.stock,
          image_url: publicUrl
        }]);

      if (insertError) throw insertError;

      // 3. Reset form
      setFormData({ name: '', stock: 0, image: null, imageUrlPreview: '' });
      fetchDisplays();
    } catch (err: any) {
      console.error(err);
      setError("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente remover este expositor?")) return;
    
    try {
      const { error: err } = await supabase.from('displays').delete().eq('id', id);
      if (err) {
        if (err.message.includes('foreign key constraint')) {
          throw new Error("Não é possível excluir este expositor pois existem pedidos vinculados a ele. Exclua os pedidos primeiro ou execute o comando SQL de CASCADE.");
        }
        throw err;
      }
      fetchDisplays();
    } catch (err: any) {
      alert(err.message);
    }
  };

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
      {/* Add New Display Form */}
      <section className="bg-white border-2 border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <h2 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-2 border-b-2 border-[#141414] pb-4">
          <Plus className="w-5 h-5" />
          Cadastrar Novo Modelo de Expositor
        </h2>

        <form onSubmit={handleAddDisplay} className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Quantidade Inicial</label>
                <input 
                  type="number" 
                  min="0"
                  required
                  placeholder="0"
                  value={formData.stock}
                  onChange={e => setFormData(p => ({ ...p, stock: parseInt(e.target.value) }))}
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
                {(error.includes("row-level security") || error.includes("foreign key")) && (
                  <p className="text-[10px] uppercase font-bold text-red-700 bg-white p-3 border border-red-200 text-left whitespace-pre-wrap font-mono leading-relaxed">
                    Execute no SQL Editor do Supabase:\n\n
                    -- Corrigir Remoção com Pedidos Ativos:\n
                    ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_display_id_fkey;\n
                    ALTER TABLE requests ADD CONSTRAINT requests_display_id_fkey \n
                    FOREIGN KEY (display_id) REFERENCES displays(id) ON DELETE CASCADE;\n\n
                    -- Configurar Tabelas (se necessário):\n
                    ALTER TABLE displays ENABLE ROW LEVEL SECURITY;\n
                    CREATE POLICY "Public" ON displays FOR ALL USING (true) WITH CHECK (true);
                  </p>
                )}
              </div>
            )}

            <button 
              type="submit"
              disabled={saving}
              className="w-full py-5 bg-[#141414] text-white font-black uppercase tracking-[0.3em] text-xs shadow-[6px_6px_0px_0px_rgba(20,20,20,0.3)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50"
            >
              {saving ? 'Guardando Informações...' : 'Adicionar ao Catálogo'}
            </button>
          </div>
        </form>
      </section>

      {/* List Existing Displays */}
      <section className="bg-white border-2 border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="flex items-center justify-between mb-8 border-b-2 border-[#141414] pb-4">
          <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
            <Package className="w-6 h-6" />
            Catálogo Atual
          </h2>
          <div className="font-mono text-[9px] uppercase font-bold text-[#141414]/40">
            Total em estoque: {displays.reduce((acc, d) => acc + d.stock, 0)} unidades
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displays.map(display => (
            <div key={display.id} className="border-2 border-[#141414] p-4 flex flex-col group hover:bg-[#141414]/5 transition-colors">
              <div className="aspect-video bg-gray-100 border border-[#141414]/5 mb-4 overflow-hidden grayscale group-hover:grayscale-0 transition-all">
                <img src={display.image_url} alt={display.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-black uppercase text-xs tracking-tight line-clamp-1">{display.name}</h4>
                  <p className="font-mono text-[10px] font-bold text-green-700 bg-green-50 inline-block px-1 mt-1">ESTOQUE: {display.stock}</p>
                </div>
                <button 
                  onClick={() => handleDelete(display.id)}
                  className="p-2 text-[#141414]/20 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {displays.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-[#141414]/10">
            <p className="text-xs font-black uppercase text-[#141414]/20 tracking-widest">O catálogo está vazio.</p>
          </div>
        )}
      </section>
    </div>
  );
}
