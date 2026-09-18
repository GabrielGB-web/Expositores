import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Profile, Display } from '../types';

// Inicializa Firebase com a configuração do projeto
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Inicializa Firestore com o banco específico da aplicação
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const PROFILES_COLLECTION = 'profiles';
const DISPLAYS_COLLECTION = 'displays';

// Limpa email para usar como ID seguro de documento
export function sanitizeEmailKey(email: string): string {
  return email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '_');
}

/**
 * Salva ou atualiza um perfil no Firestore (persistência em nuvem compartilhada)
 */
export async function saveProfileToFirestore(profile: Profile): Promise<void> {
  if (!profile.email) return;
  const docId = sanitizeEmailKey(profile.email);
  try {
    const profileRef = doc(db, PROFILES_COLLECTION, docId);
    await setDoc(profileRef, {
      ...profile,
      email: profile.email.toLowerCase().trim(),
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log("Firestore: Perfil salvo com sucesso na nuvem:", profile.email);
  } catch (error) {
    console.warn("Firestore: Aviso ao salvar perfil na nuvem:", error);
  }
}

/**
 * Busca todos os perfis gravados no Firestore
 */
export async function getProfilesFromFirestore(): Promise<Profile[]> {
  try {
    const profilesCol = collection(db, PROFILES_COLLECTION);
    const snapshot = await getDocs(profilesCol);
    const list: Profile[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Profile;
      if (data.email) {
        list.push({
          id: data.id || docSnap.id,
          email: data.email.toLowerCase().trim(),
          role: data.role || 'vendedor',
          filial: data.filial || '04',
          created_at: data.created_at || new Date().toISOString()
        });
      }
    });
    return list;
  } catch (error) {
    console.warn("Firestore: Aviso ao buscar perfis na nuvem:", error);
    return [];
  }
}

/**
 * Remove um perfil do Firestore
 */
export async function deleteProfileFromFirestore(email: string): Promise<void> {
  if (!email) return;
  try {
    const docId = sanitizeEmailKey(email);
    const profileRef = doc(db, PROFILES_COLLECTION, docId);
    await deleteDoc(profileRef);
    console.log("Firestore: Perfil removido da nuvem:", email);
  } catch (error) {
    console.warn("Firestore: Aviso ao remover perfil da nuvem:", error);
  }
}

/**
 * Listener em tempo real para sincronização instantânea entre todos os navegadores
 */
export function subscribeProfilesFromFirestore(callback: (profiles: Profile[]) => void): () => void {
  try {
    const profilesCol = collection(db, PROFILES_COLLECTION);
    return onSnapshot(profilesCol, (snapshot) => {
      const list: Profile[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Profile;
        if (data.email) {
          list.push({
            id: data.id || docSnap.id,
            email: data.email.toLowerCase().trim(),
            role: data.role || 'vendedor',
            filial: data.filial || '04',
            created_at: data.created_at || new Date().toISOString()
          });
        }
      });
      callback(list);
    }, (err) => {
      console.warn("Firestore: Erro no listener em tempo real de perfis:", err);
    });
  } catch (error) {
    console.warn("Firestore: Falha ao iniciar listener:", error);
    return () => {};
  }
}

/**
 * Salva ou atualiza um expositor no Firestore (persistência em nuvem compartilhada)
 */
export async function saveDisplayToFirestore(display: Display): Promise<void> {
  if (!display.name) return;
  const rawId = display.id || `${(display.code || display.name).replace(/[^a-zA-Z0-9_-]/g, '_')}_${display.filial || '04'}`;
  const docId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  try {
    const displayRef = doc(db, DISPLAYS_COLLECTION, docId);
    await setDoc(displayRef, {
      ...display,
      id: docId,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log("Firestore: Expositor sincronizado com sucesso na nuvem:", display.name, "Filial:", display.filial);
  } catch (error) {
    console.warn("Firestore: Aviso ao salvar expositor na nuvem:", error);
  }
}

/**
 * Busca todos os expositores gravados no Firestore
 */
export async function getDisplaysFromFirestore(): Promise<Display[]> {
  try {
    const displaysCol = collection(db, DISPLAYS_COLLECTION);
    const snapshot = await getDocs(displaysCol);
    const list: Display[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Display;
      if (data.name) {
        list.push({
          id: data.id || docSnap.id,
          name: data.name,
          code: data.code || '',
          stock: typeof data.stock === 'number' ? data.stock : 0,
          department: data.department || 'ELMA CHIPS',
          min_order_value: data.min_order_value || 0,
          filial: data.filial || '04',
          image_url: data.image_url || ''
        });
      }
    });
    return list;
  } catch (error) {
    console.warn("Firestore: Aviso ao carregar expositores da nuvem:", error);
    return [];
  }
}

/**
 * Remove um expositor do Firestore
 */
export async function deleteDisplayFromFirestore(id: string): Promise<void> {
  if (!id) return;
  try {
    const docId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const displayRef = doc(db, DISPLAYS_COLLECTION, docId);
    await deleteDoc(displayRef);
    console.log("Firestore: Expositor removido da nuvem:", id);
  } catch (error) {
    console.warn("Firestore: Aviso ao remover expositor da nuvem:", error);
  }
}

/**
 * Listener em tempo real para sincronização instantânea de expositores
 */
export function subscribeDisplaysFromFirestore(callback: (displays: Display[]) => void): () => void {
  try {
    const displaysCol = collection(db, DISPLAYS_COLLECTION);
    return onSnapshot(displaysCol, (snapshot) => {
      const list: Display[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Display;
        if (data.name) {
          list.push({
            id: data.id || docSnap.id,
            name: data.name,
            code: data.code || '',
            stock: typeof data.stock === 'number' ? data.stock : 0,
            department: data.department || 'ELMA CHIPS',
            min_order_value: data.min_order_value || 0,
            filial: data.filial || '04',
            image_url: data.image_url || ''
          });
        }
      });
      callback(list);
    }, (err) => {
      console.warn("Firestore: Erro no listener de expositores:", err);
    });
  } catch (error) {
    console.warn("Firestore: Falha ao iniciar listener de expositores:", error);
    return () => {};
  }
}
