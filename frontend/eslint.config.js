import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// The knowledge base names "calling fetch directly from several components" as
// antipattern #1 (section 19). This config is what makes that a build failure
// instead of a code-review opinion: every HTTP call must go through the data
// boundary in src/data/, which is the only directory where the rule is lifted.
const httpTransportIsBoundaryOnly = {
  "no-restricted-globals": [
    "error",
    {
      name: "fetch",
      message:
        "Use a fronteira de dados em src/data/ — componentes nao falam HTTP diretamente.",
    },
    {
      name: "XMLHttpRequest",
      message:
        "Use a fronteira de dados em src/data/ — componentes nao falam HTTP diretamente.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "bundle-report.html"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...httpTransportIsBoundaryOnly,
    },
  },
  {
    // The data boundary is the one place allowed to touch the network.
    files: ["src/data/**/*.{ts,tsx}"],
    rules: { "no-restricted-globals": "off" },
  },
);
