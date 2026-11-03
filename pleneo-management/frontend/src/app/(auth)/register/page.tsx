import type { Metadata } from 'next';
import { RegisterForm } from '@/components/forms/register-form';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Create your account</h1>
      <RegisterForm />
    </>
  );
}
