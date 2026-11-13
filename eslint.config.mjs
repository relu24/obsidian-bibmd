// Obsidian's own lint rules, as the community directory's review runs them: npm run lint
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // Build output, the build's own scripts and the .NET side are not plugin code.
  globalIgnores(["node_modules", "dist", "main.js", "esbuild.config.mjs", "wasm", "vault", "test", "install.sh"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.mjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
