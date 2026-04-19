declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_BASE_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
