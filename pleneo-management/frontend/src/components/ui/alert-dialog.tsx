'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg sm:max-w-md',
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

const AlertDialogHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('flex flex-col gap-2 text-center sm:text-left', className)} {...props} />
);

const AlertDialogFooter = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
);

const AlertDialogTitle = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) => (
  <AlertDialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />
);

const AlertDialogDescription = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) => (
  <AlertDialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
);

const AlertDialogAction = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Action>) => (
  <AlertDialogPrimitive.Action className={cn(buttonVariants(), className)} {...props} />
);

const AlertDialogCancel = ({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Cancel>) => (
  <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />
);

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
