import type { CursorRole } from './api.ts';

export interface SandboxRoleDefinition {
  role: CursorRole;
  slot: string;
  label: string;
  nativeFallback: string;
  description: string;
}

export const SANDBOX_17_ROLES: readonly SandboxRoleDefinition[] = [
  {
    role: 'pointer',
    slot: 'Arrow',
    label: 'Normal Select',
    nativeFallback: 'auto',
    description: 'Windows desktop folder / primary click',
  },
  {
    role: 'help',
    slot: 'Help',
    label: 'Help Select',
    nativeFallback: 'help',
    description: 'Contextual help & troubleshooting tooltips',
  },
  {
    role: 'working',
    slot: 'AppStarting',
    label: 'Working in Background',
    nativeFallback: 'progress',
    description: 'Background tasks & progress loading',
  },
  {
    role: 'busy',
    slot: 'Wait',
    label: 'Busy / Wait',
    nativeFallback: 'wait',
    description: 'System waiting / blocked operations',
  },
  {
    role: 'precision',
    slot: 'Crosshair',
    label: 'Precision Select',
    nativeFallback: 'crosshair',
    description: 'Target crosshair & graphics canvas',
  },
  {
    role: 'text',
    slot: 'IBeam',
    label: 'Text Select',
    nativeFallback: 'text',
    description: 'Editable input fields & documents',
  },
  {
    role: 'handwriting',
    slot: 'NWPen',
    label: 'Handwriting',
    nativeFallback: 'crosshair',
    description: 'Stylus handwriting & freeform drawing',
  },
  {
    role: 'unavailable',
    slot: 'No',
    label: 'Unavailable',
    nativeFallback: 'not-allowed',
    description: 'Disabled buttons & restricted actions',
  },
  {
    role: 'resize_vertical',
    slot: 'SizeNS',
    label: 'Vertical Resize',
    nativeFallback: 'ns-resize',
    description: 'Window vertical height adjustment',
  },
  {
    role: 'resize_horizontal',
    slot: 'SizeWE',
    label: 'Horizontal Resize',
    nativeFallback: 'ew-resize',
    description: 'Window horizontal width adjustment',
  },
  {
    role: 'resize_diagonal_nwse',
    slot: 'SizeNWSE',
    label: 'Diagonal Resize 1',
    nativeFallback: 'nwse-resize',
    description: 'Top-left to bottom-right corner resize',
  },
  {
    role: 'resize_diagonal_nesw',
    slot: 'SizeNESW',
    label: 'Diagonal Resize 2',
    nativeFallback: 'nesw-resize',
    description: 'Top-right to bottom-left corner resize',
  },
  {
    role: 'move',
    slot: 'SizeAll',
    label: 'Move / Resize',
    nativeFallback: 'move',
    description: 'Draggable windows & movable items',
  },
  {
    role: 'alternate',
    slot: 'UpArrow',
    label: 'Alternate Select',
    nativeFallback: 'pointer',
    description: 'Alternative navigation & directional jump',
  },
  {
    role: 'link',
    slot: 'Hand',
    label: 'Link Select',
    nativeFallback: 'pointer',
    description: 'Hyperlink & interactive elements',
  },
  {
    role: 'location',
    slot: 'Pin',
    label: 'Location Select',
    nativeFallback: 'pointer',
    description: 'Geographic map pins & location tagging',
  },
  {
    role: 'person',
    slot: 'Person',
    label: 'Person Select',
    nativeFallback: 'pointer',
    description: 'Contact selection & profile mentions',
  },
] as const;
