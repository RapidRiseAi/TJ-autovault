declare module 'next/dist/compiled/@next/font/dist/fontkit' {
  import type { Fontkit } from 'pdf-lib/cjs/types/fontkit';

  type FontkitCreate = Fontkit['create'];

  const fontkit: Fontkit | FontkitCreate;
  export default fontkit;
}
