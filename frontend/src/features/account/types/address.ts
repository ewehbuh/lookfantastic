export interface AddressInput {
  label: string; full_name: string; line1: string; line2: string;
  city: string; postcode: string; country: string; phone: string; is_default: boolean;
}
export interface Address extends AddressInput {id: number}
export interface AddressPage {count: number; next: string | null; previous: string | null; results: Address[]}
export const emptyAddress: AddressInput = {label: '', full_name: '', line1: '', line2: '', city: '', postcode: '', country: 'GB', phone: '', is_default: false};
