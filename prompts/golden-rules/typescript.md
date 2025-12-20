# TypeScript Golden Rules

- **Strict Mode**: `any` 型は使用禁止。必ず型定義を行うこと。
- **Functional**: クラスコンポーネントより関数コンポーネント(React)を推奨。
- **Async/Await**: Promiseチェーンより `async/await` を使用すること。
- **Modern**: `require` ではなく `import` を使用すること。
- **Aliases**: パスインポートには必要に応じてエイリアスを使用すること（tsconfig.json確認）。
