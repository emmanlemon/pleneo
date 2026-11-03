import { describe, expect, it } from 'vitest';
import { changePasswordSchema, loginSchema, mfaSchema, password, registerSchema, resetPasswordSchema } from './schemas';

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('auth schemas', () => {
  it('normalises email on login', () => {
    const parsed = loginSchema.parse({ email: '  User@Example.COM ', password: 'x' });
    expect(parsed.email).toBe('user@example.com');
  });

  it('mirrors the server password policy', () => {
    expect(password.safeParse('short1A').success).toBe(false);
    expect(firstMessage(password.safeParse('alllowercase1234'))).toBe('Include upper case, lower case and a number');
    expect(password.safeParse(' Leading-Space-1A ').success).toBe(false);
    expect(password.safeParse('Correct-Horse-9').success).toBe(true);
  });

  it('requires a name on registration', () => {
    expect(firstMessage(registerSchema.safeParse({ email: 'a@b.co', password: 'Correct-Horse-9', name: ' ' }))).toBe(
      'Enter your name',
    );
  });

  it('accepts TOTP or recovery codes for MFA', () => {
    expect(mfaSchema.safeParse({ mfaToken: 'a'.repeat(20), code: '123456' }).success).toBe(true);
    expect(mfaSchema.parse({ mfaToken: 'a'.repeat(20), code: 'ABCDE-12345' }).code).toBe('abcde-12345');
    expect(mfaSchema.safeParse({ mfaToken: 'a'.repeat(20), code: '12' }).success).toBe(false);
  });

  it('checks confirmation and difference rules', () => {
    const reset = resetPasswordSchema.safeParse({
      token: 't'.repeat(20),
      password: 'Correct-Horse-9',
      confirmPassword: 'nope',
    });
    expect(reset.error?.issues[0]?.path).toEqual(['confirmPassword']);
    const change = changePasswordSchema.safeParse({
      currentPassword: 'Correct-Horse-9',
      newPassword: 'Correct-Horse-9',
      confirmPassword: 'Correct-Horse-9',
    });
    expect(change.error?.issues[0]?.path).toEqual(['newPassword']);
  });
});
