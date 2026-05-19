export type AuthUser = {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};
