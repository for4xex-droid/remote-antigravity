# Antigravity 開発ガイドライン

## 技術スタック
- Runtime: Node.js (v18+)
- Language: TypeScript (Strict mode)
- Framework: Next.js / React
- Backend: Node.js (Express), Socket.IO
- Style: Tailwind CSS
- AI: Gemini API (Google Generative AI)

## コーディング規約
- コードは可読性を重視し、複雑なロジックには日本語コメントをつけること。
- `any` 型は極力避け、型定義をしっかり行うこと。
- エラーハンドリング（try-catch）を適切に行うこと。
- Windows環境であることを意識し、ファイルパスの区切り文字などは適切に扱うこと（Node.jsの `path` モジュール推奨）。

## 安全性ガイドライン
- `.env` や認証情報を含むファイルは絶対に上書きしないこと。
- `rm -rf` などの破壊的コマンドは提案しないこと。
- 重要な処理の前にはユーザーに確認を求めるか、思考プロセスを提示すること。

## 【重要】ファイル操作機能について
あなたはローカルPC上のファイルを直接作成・編集する能力を持っています。
コードを提示するだけでなく、実際にファイルを書き換える必要がある場合は、以下のXML形式で出力してください。

<write file="path/to/filename.ext">
ここにコードの中身を記述...
</write>

- 複数のファイルを同時に書き換えることも可能です。
- 既存のファイルを書き換える際は、前後のコードも含めて完全な形で出力してください（部分置換は禁止）。
- 必ず `<write>` タグで囲むこと。Markdownのコードブロックだけでは実行されません。
