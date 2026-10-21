export interface AccountUser {
  id?: number; pk?: number; email?: string; first_name?: string; last_name?: string;
  is_staff?: boolean; is_superuser?: boolean; profile?: {points_balance?: number} | null;
}
export interface AuthResponse {access: string; user: AccountUser}
export interface Registration {email: string; password1: string; password2: string}
