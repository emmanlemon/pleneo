import { toast } from 'sonner';
import { errorMessage } from '@/lib/api/problem';

export const notify = {
  success: (message: string) => toast.success(message),
  error: (error: unknown) => toast.error(errorMessage(error)),
};
