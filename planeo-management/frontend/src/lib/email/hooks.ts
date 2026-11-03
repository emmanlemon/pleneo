'use client';

import { useMutation } from '@tanstack/react-query';
import { emailApi, type TestEmailInput } from './api';

export const useSendTestEmail = () => useMutation({ mutationFn: (input: TestEmailInput) => emailApi.sendTest(input) });
