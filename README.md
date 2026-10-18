# SQLConduit documentation site

Vue 3 + VitePress static documentation for SQLConduit.

```bash
npm install
npm run dev
```

Production build and local preview:

```bash
npm run build
npm run preview
```

The default deployment base is `/`. Override it only for a sub-path deployment:

```bash
DOCS_BASE=/docs/ npm run build
```

Documentation targets SQLConduit v1.2.0. New API pages cover typed results/named binding/per-call controls, typed pagination, and diagnostics in Chinese and English. Oracle/OCI was not revalidated for this release.
