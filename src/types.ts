export type RequestStatus = 'pending' | 'approved' | 'delivered' | 'rejected';
export type UserRole = 'admin' | 'vendedor';
export type FilialId = '04' | '02';

export interface Filial {
  id: FilialId;
  name: string;
  code: string;
}

export const FILIAIS: Filial[] = [
  { id: '04', name: 'Filial 04', code: 'FILIAL 04' },
  { id: '02', name: 'Filial 02', code: 'FILIAL 02' }
];

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  filial?: string;
  created_at?: string;
}

export interface Display {
  id: string;
  name: string;
  code?: string;
  image_url: string;
  stock: number;
  department: string;
  min_order_value?: number;
  filial?: string;
}

export interface DisplayRequest {
  id: string;
  display_id: string;
  display_name?: string;
  display_code?: string;
  display_image?: string;
  order_number: string;
  customer_code: string;
  customer_name: string;
  order_value: number;
  quantity: number;
  status: RequestStatus;
  photo_url?: string;
  created_at: string;
  delivered_at?: string;
  user_id: string;
  user_email?: string;
  department?: string;
  filial?: string;
  rejection_reason?: string;
  photo_status?: 'pending' | 'approved' | 'rejected';
  photo_rejection_reason?: string;
}

export const DEFAULT_DEPARTMENTS: Record<string, string[]> = {
  '04': [
    'ELMA CHIPS',
    'MONDELEZ',
    'FELTRIN',
    'CALÇADOS',
    'AB MAURY'
  ],
  '02': [
    'ELMA CHIPS',
    'MONDELEZ',
    'FELTRIN',
    'BEBIDAS',
    'DOCES'
  ]
};

export const DEPARTMENTS = DEFAULT_DEPARTMENTS['04'];
