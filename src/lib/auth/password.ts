import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordStrength {
  valid: boolean;
  message?: string;
}

export function checkPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters.' };
  if (password.length > 200) return { valid: false, message: 'Password must be at most 200 characters.' };
  if (!/[a-zA-Z]/.test(password)) return { valid: false, message: 'Password must contain a letter.' };
  if (!/\d/.test(password)) return { valid: false, message: 'Password must contain a number.' };
  return { valid: true };
}