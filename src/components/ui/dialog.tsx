import type {ComponentProps} from 'react';
import * as D from '@radix-ui/react-dialog';
import {X} from 'lucide-react';

// Small shadcn-style wrapper around Radix Dialog (keeps the data-slot hooks the stylesheet uses).
export const Dialog = (props: ComponentProps<typeof D.Root>) => <D.Root data-slot="dialog" {...props}/>;

export function DialogContent({className = '', children, showCloseButton = true, ...props}: ComponentProps<typeof D.Content> & {showCloseButton?: boolean}) {
  return <D.Portal>
    <D.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-[1000] bg-black/50"/>
    <D.Content data-slot="dialog-content" className={`fixed left-1/2 top-1/2 z-[1001] grid w-full -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-6 shadow-lg ${className}`} {...props}>
      {children}
      {showCloseButton && <D.Close className="absolute right-4 top-4" aria-label="Close"><X size={18}/></D.Close>}
    </D.Content>
  </D.Portal>;
}
export const DialogHeader = ({className = '', ...props}: ComponentProps<'div'>) => <div data-slot="dialog-header" className={`flex flex-col gap-2 ${className}`} {...props}/>;
export const DialogTitle = (props: ComponentProps<typeof D.Title>) => <D.Title data-slot="dialog-title" className="font-semibold" {...props}/>;
export const DialogDescription = (props: ComponentProps<typeof D.Description>) => <D.Description data-slot="dialog-description" className="text-muted-foreground" {...props}/>;
