export type RequestStatus = 'pending' | 'delivered';
export type UserRole = 'admin' | 'vendedor';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
}

export interface Display {
  id: string;
  name: string;
  image_url: string;
  stock: number;
}

export interface DisplayRequest {
  id: string;
  display_id: string;
  display_name?: string;
  display_image?: string;
  order_number: string;
  customer_code: string;
  customer_name: string;
  order_value: number;
  status: RequestStatus;
  photo_url?: string;
  created_at: string;
  delivered_at?: string;
  user_id: string;
  user_email?: string;
}
