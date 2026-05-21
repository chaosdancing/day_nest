import { z } from 'zod';

export const RegisterInput = z.object({
  inviteToken: z.string().min(8),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  username: z.string(),
  password: z.string(),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const UserDTO = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarKey: z.string().nullable(),
});
export type UserDTO = z.infer<typeof UserDTO>;

/**
 * Self-service profile patch. Only fields the user is allowed to edit
 * themselves — username is intentionally NOT here (it's the login key
 * and renaming it would invalidate every existing session/token).
 */
export const UpdateProfileInput = z.object({
  displayName: z.string().min(1).max(64).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const AuthResponse = z.object({
  user: UserDTO,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;
