# Test prim — GPT6 CHAT

**最初は「Test prim」。 「GPT6 CHAT」を押すと、ゲーム「LUMINA — 星灯りの庭」のタイトルが始まります。**

LUMINA は、スマートフォンで遊べる３章の幻想アクションゲームです。アカウント登録、課金、ゲームエンジンのインストールは不要です。

## スマートフォンで遊ぶ

- **公開用 URL（GitHub Pages）**: https://sunpotflower4460-cpu.github.io/Test-prim/
- **設定前に確認するためのプレビュー**: https://raw.githack.com/sunpotflower4460-cpu/Test-prim/main/index.html

GitHub Pages はリポジトリ作成直後に自動で有効にならない場合があります。初回だけ **Settings → Pages → Build and deployment → Source → GitHub Actions** を選び、保存してください。GitHub Actions の `Publish LUMINA` が公開を行います。

*プレビューは外部のソースコード配信サービス経由です。最初に確認画面が表示される場合があります。通常利用やホーム画面への追加は GitHub Pages の URL を使ってください。*

## 進み方

1. **Test prim** の画面で **GPT6 CHAT** を押す
2. **LUMINA — 星灯りの庭** のタイトルから「旅をはじめる」
3. 「黎明の森」「月影の湖」「星の神殿」を順にめぐる
4. 各章の守護者を倒し、最後の夜明けを迎える

## 操作

- **スマホ**: 左下のスティックで移動、右下の **DASH** で回避。攻撃は自動です
- **PC**: WASD / 矢印キーで移動、Space / Shift でダッシュ、P / Esc で一時停止
- 敵が落とす星を集め、レベルアップ時に３つの祝福から１つを選ぶ
- 12系統の強化、敵の個性、３つのボス、生成音楽、演出、記録保存
- 対応ブラウザでは PWA としてホーム画面に追加でき、オフラインでも遊べます（初回のオンライン読み込みが必要）

## 実装とテスト

HTML / CSS / JavaScript / Canvas 2D / Web Audio / Service Worker。ビルド不要です。

ローカル環境で起動:

```bash
python3 -m http.server 8000
```

http://localhost:8000 にアクセスしてください。

テスト（Node.js 22 以降）:

```bash
node --check game.js
node --check sw.js
node --test tests/game.test.cjs
```

GitHub Actions の `Quality Checks` でも起動、操作、３章のクリアまでチェックします。

© 2026 Test prim · Original interactive game.
