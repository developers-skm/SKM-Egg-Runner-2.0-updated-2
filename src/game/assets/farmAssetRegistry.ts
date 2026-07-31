// Central registry of decorative farm GLB assets used by gameEngine.ts.
// These models replace purely decorative roadside scenery only — they are never
// used for gameplay obstacles, collectibles, or collision geometry.
//
// See public/models/farm/ASSET_LICENSES.md for full licensing details of every file.

export interface FarmAssetDefinition {
  id: string;
  url: string;
  /** Uniform scale applied on top of the loader's maxDim-normalized scale (see loadGLB in gameEngine.ts). */
  scale: number;
  rotationY?: number;
  yOffset?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Themes this asset is appropriate for (documentation only; spawn logic lives in gameEngine.ts). */
  themes: string[];
  /** Procedural decoration function(s) in gameEngine.ts this asset visually replaces. */
  replaces?: string[];
}

export const FARM_ASSETS: Record<string, FarmAssetDefinition> = {
  silo: {
    id: 'silo',
    url: '/models/farm/silo.glb',
    scale: 2.0,
    castShadow: true,
    receiveShadow: true,
    themes: ['POULTRY_FARM', 'WHEAT_FIELDS'],
    replaces: ['createIndustrialSilosMesh'],
  },
  windmillTower: {
    id: 'windmillTower',
    url: '/models/farm/windmill.glb',
    scale: 3.0,
    castShadow: true,
    receiveShadow: false,
    themes: ['RAINY_SEASON', 'WHEAT_FIELDS'],
    replaces: ['createWindmillMesh'],
  },
};
