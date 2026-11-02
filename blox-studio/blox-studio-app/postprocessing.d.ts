/**
 * `@react-three/postprocessing` ships types, but its package.json `exports` field omits them,
 * so strict resolution cannot find them. Declare the subset Blox Studio uses.
 */
declare module '@react-three/postprocessing' {
  import type { ReactNode, FC } from 'react';
  import type { ToneMappingMode } from 'postprocessing';

  export const EffectComposer: FC<{ children?: ReactNode; multisampling?: number; enabled?: boolean }>;
  export const Bloom: FC<{ intensity?: number; luminanceThreshold?: number; luminanceSmoothing?: number; mipmapBlur?: boolean }>;
  export const ToneMapping: FC<{ mode?: ToneMappingMode }>;
}
