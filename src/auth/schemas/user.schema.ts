import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

/**
 * Roles de acesso do sistema.
 * - user: acesso padrão
 * - admin: acesso total
 * - moderator: acesso intermediário
 */
export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ unique: true, required: true, trim: true, lowercase: true })
  username: string;

  @Prop({ trim: true, default: '' })
  phone: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ type: [String], default: [] })
  refreshTokens: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
