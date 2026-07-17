// Fuerza Conventional Commits (feat:, fix:, chore:, docs:, refactor:, test:, ...).
// El hook commit-msg de husky lo aplica en cada commit.
const config = {
  extends: ["@commitlint/config-conventional"],
};

export default config;
