import { useCallback, useEffect, useState } from 'react';
import { loadSkin, saveSkin } from '../lib/storage';
import { DEFAULT_SKIN } from '../lib/appearance';
import type { SkinName } from '../types/chat';

export interface SkinState {
  skin: SkinName;
  setSkin: (skin: SkinName) => void;
}

/**
 * Appearance is one attribute on <html> (`data-skin`), so switching it costs a
 * repaint and nothing else: no component reads it, no prop travels down the
 * tree. The React tree is identical in both skins - that is the point of doing
 * it this way rather than with a second set of components.
 *
 * The stored choice is applied by the inline script in index.html as well, so a
 * reload does not flash the other design before the bundle runs.
 */
export function useSkin(): SkinState {
  const [skin, setSkinState] = useState<SkinName>(() => loadSkin() ?? DEFAULT_SKIN);

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    saveSkin(skin);
  }, [skin]);

  const setSkin = useCallback((next: SkinName) => {
    setSkinState(next);
  }, []);

  return { skin, setSkin };
}
